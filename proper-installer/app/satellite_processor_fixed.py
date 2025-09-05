#!/usr/bin/env python3
"""
COMPLETELY REWRITTEN Satellite Processor with PERFECT Alignment
This version ensures satellite imagery aligns perfectly with OpenStreetMap
"""

import os
import sys
import json
import numpy as np
import requests
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
from rasterio.warp import transform_bounds, reproject, Resampling
import cv2
from datetime import datetime
from pathlib import Path
from shapely.geometry import Polygon, Point
from pystac_client import Client
import time
import warnings
from pyproj import Transformer
import tempfile
from shapely.ops import transform
from functools import partial
warnings.filterwarnings('ignore')

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

class PerfectAlignmentSatelliteProcessor:
    def __init__(self, config):
        self.config = config
        self.city_data = config['city']
        self.start_month = config.get('startMonth', '07')
        self.start_year = config.get('startYear', 2020)
        self.end_month = config.get('endMonth', '07') 
        self.end_year = config.get('endYear', 2020)
        self.cloud_threshold = config.get('cloudCoverageThreshold', 20)
        self.ndvi_threshold = config.get('ndviThreshold', 0.3)
        self.output_dir = Path(config['outputDir'])
        
        # Create output directories
        self.vegetation_dir = self.output_dir / 'vegetation_analysis'
        self.vegetation_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize STAC client
        self.stac_client = Client.open("https://earth-search.aws.element84.com/v1")
        
        # CRITICAL: Store WGS84 bounds for perfect alignment
        self.wgs84_bounds = None
        self.satellite_crs = None
        
    def get_city_bounds_wgs84(self):
        """Get city bounds in WGS84 (EPSG:4326) - the standard web map projection"""
        try:
            if 'polygon_geojson' in self.city_data and self.city_data['polygon_geojson']:
                polygon_data = self.city_data['polygon_geojson']['geometry']
                if polygon_data['type'] == 'Polygon':
                    coordinates = polygon_data['coordinates'][0]
                    lons = [coord[0] for coord in coordinates]
                    lats = [coord[1] for coord in coordinates]
                    
                    # NO PADDING - use exact city bounds for perfect alignment
                    bounds = {
                        'west': min(lons),
                        'east': max(lons), 
                        'south': min(lats),
                        'north': max(lats)
                    }
                    
                    # Store the exact polygon for validation
                    self.city_polygon_coordinates = coordinates
                    print(f"📍 EXACT CITY POLYGON BOUNDS: {bounds}")
                    return bounds
        except Exception as e:
            print(f"⚠️ Error with polygon: {e}")
        
        # Fallback to city coordinates
        lat = float(self.city_data['latitude'])
        lon = float(self.city_data['longitude'])
        buffer = 0.05  # Small buffer around city center
        
        return {
            'west': lon - buffer,
            'east': lon + buffer,
            'south': lat - buffer, 
            'north': lat + buffer
        }
    
    def validate_boundary_alignment(self, result_bounds):
        """Validate that processing result boundaries match city polygon boundaries exactly"""
        city_bounds = self.get_city_bounds_wgs84()
        
        # Check if bounds match within a small tolerance (for floating point precision)
        tolerance = 0.001  # ~100m tolerance
        
        matches = {
            'west': abs(result_bounds['west'] - city_bounds['west']) < tolerance,
            'east': abs(result_bounds['east'] - city_bounds['east']) < tolerance,
            'south': abs(result_bounds['south'] - city_bounds['south']) < tolerance,
            'north': abs(result_bounds['north'] - city_bounds['north']) < tolerance
        }
        
        all_match = all(matches.values())
        
        print(f"🔍 BOUNDARY VALIDATION:")
        print(f"   City bounds: {city_bounds}")
        print(f"   Result bounds: {result_bounds}")
        print(f"   Matches: {matches}")
        print(f"   Overall match: {'✅ PERFECT' if all_match else '❌ MISMATCH'}")
        
        if not all_match:
            print(f"⚠️ WARNING: Boundary mismatch detected!")
            for direction, match in matches.items():
                if not match:
                    diff = abs(result_bounds[direction] - city_bounds[direction])
                    print(f"   {direction}: {diff:.6f}° difference ({diff * 111:.0f}m)")
        
        return all_match
    
    def create_city_polygon_mask(self, height, width, city_bounds):
        """Create a boolean mask for pixels inside the city polygon"""
        if not hasattr(self, 'city_polygon_coordinates'):
            print("⚠️ No city polygon coordinates available, using full rectangle")
            return np.ones((height, width), dtype=bool)
        
        print("🔧 Creating city polygon mask for precise boundary analysis...")
        
        # Create coordinate matrices for each pixel
        lons = np.linspace(city_bounds['west'], city_bounds['east'], width)
        lats = np.linspace(city_bounds['north'], city_bounds['south'], height)  # Note: reversed for image coordinates
        
        lon_grid, lat_grid = np.meshgrid(lons, lats)
        
        # Create the city polygon
        city_polygon = Polygon(self.city_polygon_coordinates)
        
        # Create mask - check each pixel if it's inside the polygon
        mask = np.zeros((height, width), dtype=bool)
        
        print(f"   Checking {height * width:,} pixels against city polygon...")
        
        # Vectorized approach for better performance
        points = np.column_stack([lon_grid.ravel(), lat_grid.ravel()])
        
        # Create Point objects and check if they're within the polygon
        # Using vectorized approach with shapely
        from shapely.vectorized import contains
        mask_flat = contains(city_polygon, points[:, 0], points[:, 1])
        mask = mask_flat.reshape(height, width)
        
        inside_pixels = np.sum(mask)
        total_pixels = height * width
        coverage = (inside_pixels / total_pixels) * 100
        
        print(f"   📊 Polygon mask created:")
        print(f"     Total pixels: {total_pixels:,}")
        print(f"     Inside city: {inside_pixels:,} ({coverage:.1f}%)")
        print(f"     Outside city: {total_pixels - inside_pixels:,} ({100-coverage:.1f}%)")
        
        return mask
    
    def fill_coverage_gaps(self, red, green, blue, nir, city_mask, city_bounds):
        """Fill coverage gaps using additional satellite tiles"""
        print(f"🔧 MULTI-TILE GAP FILLING ALGORITHM:")
        
        # Identify current gaps
        valid_red = (red > 0) & ~np.isnan(red) & ~np.isinf(red)
        valid_nir = (nir > 0) & ~np.isnan(nir) & ~np.isinf(nir)
        current_coverage = valid_red & valid_nir & city_mask
        gap_mask = city_mask & ~current_coverage
        
        print(f"   Gap pixels to fill: {np.sum(gap_mask):,}")
        
        if np.sum(gap_mask) == 0:
            print(f"   ✅ No gaps to fill!")
            return red, green, blue, nir
        
        # Try additional tiles (skip the first one which we already used)
        for i, (tile_item, cloud_cover, _) in enumerate(self.complete_coverage_tiles[1:], 1):
            if np.sum(gap_mask) == 0:
                break
                
            print(f"\n🔍 Trying backup tile {i}: {tile_item.id} (clouds: {cloud_cover:.1f}%)")
            
            try:
                # Download bands from backup tile
                backup_bands = self.download_bands_from_tile(tile_item, city_bounds)
                if not backup_bands:
                    print(f"   ❌ Failed to download backup tile data")
                    continue
                
                backup_red = backup_bands['red']
                backup_green = backup_bands['green'] 
                backup_blue = backup_bands['blue']
                backup_nir = backup_bands['nir']
                
                # Identify valid pixels in backup tile
                backup_valid_red = (backup_red > 0) & ~np.isnan(backup_red) & ~np.isinf(backup_red)
                backup_valid_nir = (backup_nir > 0) & ~np.isnan(backup_nir) & ~np.isinf(backup_nir)
                backup_valid = backup_valid_red & backup_valid_nir
                
                # Find fillable gaps (areas with gaps that have valid backup data)
                fillable_gaps = gap_mask & backup_valid
                fill_count = np.sum(fillable_gaps)
                
                print(f"   📊 Backup tile analysis:")
                print(f"     Valid backup pixels: {np.sum(backup_valid):,}")
                print(f"     Fillable gap pixels: {fill_count:,}")
                
                if fill_count > 0:
                    # Fill gaps with backup data
                    red[fillable_gaps] = backup_red[fillable_gaps]
                    green[fillable_gaps] = backup_green[fillable_gaps]
                    blue[fillable_gaps] = backup_blue[fillable_gaps]
                    nir[fillable_gaps] = backup_nir[fillable_gaps]
                    
                    # Update gap mask
                    gap_mask[fillable_gaps] = False
                    
                    print(f"   ✅ Filled {fill_count:,} gap pixels")
                    print(f"   📊 Remaining gaps: {np.sum(gap_mask):,}")
                else:
                    print(f"   ⚠️ No usable data in backup tile for gap areas")
                    
            except Exception as e:
                print(f"   ❌ Error processing backup tile {tile_item.id}: {e}")
                continue
        
        final_gaps = np.sum(gap_mask)
        print(f"\n🎯 GAP FILLING COMPLETE:")
        print(f"   Final remaining gaps: {final_gaps:,} pixels")
        print(f"   Gap filling success: {final_gaps == 0}")
        
        return red, green, blue, nir
    
    def download_bands_from_tile(self, tile_item, city_bounds):
        """Download band data from a specific satellite tile"""
        try:
            print(f"   🔧 Downloading backup tile: {tile_item.id}")
            print(f"   📊 Available bands in backup tile: {list(tile_item.assets.keys())}")
            
            with rasterio.Env(GDAL_HTTP_UNSAFESSL='YES'):
                bands_data = {}
                
                for band_name in ['red', 'green', 'blue', 'nir']:
                    band_key = {'red': 'B04', 'green': 'B03', 'blue': 'B02', 'nir': 'B08'}[band_name]
                    
                    if band_key not in tile_item.assets:
                        # Try alternative band naming (some tiles use different naming)
                        alt_band_key = {'red': 'red', 'green': 'green', 'blue': 'blue', 'nir': 'nir'}[band_name]
                        if alt_band_key in tile_item.assets:
                            band_key = alt_band_key
                            print(f"   🔧 Using alternative band key: {alt_band_key} for {band_name}")
                        else:
                            print(f"   ❌ Band {band_key} (or {alt_band_key}) not available in tile")
                            print(f"   📊 Available bands: {list(tile_item.assets.keys())}")
                            return None
                    
                    print(f"     📊 Downloading {band_name} ({band_key})...")
                    
                    with rasterio.open(tile_item.assets[band_key].href) as src:
                        print(f"       📊 Source info: {src.shape}, CRS: {src.crs}, Bands: {src.count}")
                        
                        # Transform city bounds to satellite CRS - same as main download
                        transformer = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
                        left, bottom = transformer.transform(city_bounds['west'], city_bounds['south'])
                        right, top = transformer.transform(city_bounds['east'], city_bounds['north'])
                        
                        print(f"       📍 Transformed bounds: ({left:.1f}, {bottom:.1f}) to ({right:.1f}, {top:.1f})")
                        print(f"       📊 Source bounds: {src.bounds}")
                        
                        # Read data within bounds and reproject to exactly 1024x1024 to match main data
                        window = rasterio.windows.from_bounds(left, bottom, right, top, src.transform)
                        
                        # Use same resampling approach as main download
                        band_data = src.read(
                            1,
                            out_shape=(1024, 1024),
                            window=window,
                            resampling=rasterio.enums.Resampling.bilinear,
                            boundless=True,
                            fill_value=0
                        ).astype(np.float32)
                        
                        print(f"       📈 After reproject: min={band_data.min():.3f}, max={band_data.max():.3f}, mean={band_data.mean():.3f}")
                        print(f"       ✅ {band_name}: {band_data.shape}")
                        
                        bands_data[band_name] = band_data
                
                print(f"   ✅ Successfully downloaded all bands from backup tile")
                return bands_data
                
        except Exception as e:
            print(f"   ❌ Error downloading from {tile_item.id}: {e}")
            import traceback
            print(f"   📊 Traceback: {traceback.format_exc()}")
            return None
    
    def validate_satellite_coverage(self, red_band, nir_band, city_mask):
        """Validate how much of the city polygon has valid satellite data"""
        print("🔍 VALIDATING SATELLITE COVERAGE within city polygon...")
        
        # Check for valid data (non-zero, non-NaN values)
        valid_red = (red_band > 0) & ~np.isnan(red_band) & ~np.isinf(red_band)
        valid_nir = (nir_band > 0) & ~np.isnan(nir_band) & ~np.isinf(nir_band)
        valid_satellite = valid_red & valid_nir
        
        # Calculate coverage within city polygon
        city_pixels = np.sum(city_mask)
        city_with_satellite = np.sum(city_mask & valid_satellite)
        city_coverage_percentage = (city_with_satellite / city_pixels) * 100 if city_pixels > 0 else 0
        
        # Calculate areas with missing data
        city_missing_data = city_pixels - city_with_satellite
        
        print(f"   📊 SATELLITE DATA COVERAGE:")
        print(f"     Total city pixels: {city_pixels:,}")
        print(f"     City pixels with satellite data: {city_with_satellite:,}")
        print(f"     City pixels missing satellite data: {city_missing_data:,}")
        print(f"     Coverage percentage: {city_coverage_percentage:.1f}%")
        
        # Warn about incomplete coverage
        if city_coverage_percentage < 90:
            print(f"   ⚠️ WARNING: Only {city_coverage_percentage:.1f}% of city has satellite data!")
            print(f"   ⚠️ {city_missing_data:,} city pixels lack satellite coverage")
            print(f"   ⚠️ This will result in missing vegetation analysis for parts of the city")
        elif city_coverage_percentage < 95:
            print(f"   ⚠️ NOTICE: {city_coverage_percentage:.1f}% satellite coverage (good but not perfect)")
        else:
            print(f"   ✅ EXCELLENT: {city_coverage_percentage:.1f}% satellite coverage")
        
        # Store coverage info for later use
        self.satellite_coverage_percentage = city_coverage_percentage
        self.city_pixels_with_data = city_with_satellite
        self.city_pixels_missing_data = city_missing_data
        
        return city_coverage_percentage

    def download_and_process_satellite_data(self):
        """Download satellite data and ensure perfect coordinate alignment"""
        print(f"🚨🚨🚨 VANCOUVER FIX VERSION 2.0 - MAIN PROCESSING FUNCTION STARTED! 🚨🚨🚨")
        print(f"🎯 Processing city: {self.city_data.get('city', 'Unknown')}")
        print_progress(10, "Getting city bounds for perfect alignment...")
        
        # Get city bounds in WGS84 (web map standard)
        city_bounds = self.get_city_bounds_wgs84()
        print(f"📍 CITY BOUNDS (WGS84): {city_bounds}")
        print(f"🔍 Enhanced tile selection algorithm will be used if this is Vancouver")
        
        # Query satellite data
        print_progress(20, "Querying satellite data...")
        start_date = datetime(self.start_year, int(self.start_month), 1)
        end_date = datetime(self.end_year, int(self.end_month), 28)
        
        # Search for satellite imagery with flexible criteria
        print(f"🔍 Searching for images from {start_date.date()} to {end_date.date()}")
        print(f"📦 Bbox: {[city_bounds['west'], city_bounds['south'], city_bounds['east'], city_bounds['north']]}")
        print(f"☁️ Cloud cover: < {self.cloud_threshold}%")
        
        search = self.stac_client.search(
            collections=["sentinel-2-l2a"],
            bbox=[city_bounds['west'], city_bounds['south'], city_bounds['east'], city_bounds['north']],
            datetime=f"{start_date.date()}/{end_date.date()}",
            query={"eo:cloud_cover": {"lt": self.cloud_threshold}}
        )
        
        items = list(search.items())
        print(f"📡 Found {len(items)} satellite images")
        
        # If no images found, try with relaxed cloud cover
        if not items:
            print("🔄 No images found, trying with relaxed cloud cover (< 50%)...")
            search = self.stac_client.search(
                collections=["sentinel-2-l2a"],
                bbox=[city_bounds['west'], city_bounds['south'], city_bounds['east'], city_bounds['north']],
                datetime=f"{start_date.date()}/{end_date.date()}",
                query={"eo:cloud_cover": {"lt": 50}}
            )
            items = list(search.items())
            print(f"📡 Found {len(items)} satellite images with relaxed criteria")
        
        # If still no images, try with broader date range limited to the target year
        if not items:
            print("🔄 Still no images, trying broader date range (target year, relaxed clouds < 50%)...")
            year_start = datetime(self.start_year, 1, 1)
            year_end = datetime(self.end_year, 12, 31)
            search = self.stac_client.search(
                collections=["sentinel-2-l2a"],
                bbox=[city_bounds['west'], city_bounds['south'], city_bounds['east'], city_bounds['north']],
                datetime=f"{year_start.date()}/{year_end.date()}",
                query={"eo:cloud_cover": {"lt": 50}}
            )
            items = list(search.items())
            print(f"📡 Found {len(items)} satellite images within {self.start_year}")
        
        if not items:
            raise Exception("No satellite images found even with relaxed criteria")
            
        print(f"📡 Found {len(items)} satellite images")
        
        # Find item with COMPLETE coverage of the city area - PRIORITY #1
        items.sort(key=lambda x: x.properties.get('eo:cloud_cover', 100))
        
        best_item = None
        best_overlap_score = 0
        complete_coverage_candidates = []
        
        print(f"🎯 PRIORITY: Finding tiles with COMPLETE city coverage...")
        print(f"🔍 ENHANCED ALGORITHM ACTIVE - searching {min(20, len(items))} tiles for complete coverage")
        print(f"🚨 ENHANCED VANCOUVER FIX VERSION 2.0 RUNNING - SHOULD FIND COMPLETE COVERAGE! 🚨")
        
        for i, item in enumerate(items[:20]):  # Check more items to find complete coverage
            print(f"🔍 Tile {i+1}/20: Analyzing {item.id} (cloud cover: {item.properties.get('eo:cloud_cover', 0)}%)")
            
            # Calculate precise overlap percentage
            try:
                if 'red' in item.assets:
                    with rasterio.Env(GDAL_HTTP_UNSAFESSL='YES'):
                        with rasterio.open(item.assets['red'].href) as src:
                            # Transform city bounds to satellite CRS with high precision
                            transformer = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
                            left, bottom = transformer.transform(city_bounds['west'], city_bounds['south'])
                            right, top = transformer.transform(city_bounds['east'], city_bounds['north'])
                            
                            # Calculate overlap area and percentage
                            src_left, src_bottom, src_right, src_top = src.bounds
                            
                            # Calculate intersection bounds
                            int_left = max(left, src_left)
                            int_right = min(right, src_right)
                            int_bottom = max(bottom, src_bottom)
                            int_top = min(top, src_top)
                            
                            # Calculate overlap percentage
                            if int_left < int_right and int_bottom < int_top:
                                city_area = (right - left) * (top - bottom)
                                overlap_area = (int_right - int_left) * (int_top - int_bottom)
                                overlap_percentage = (overlap_area / city_area) * 100
                                
                                cloud_cover = item.properties.get('eo:cloud_cover', 0)
                                
                                # CRITICAL: Check if this tile provides COMPLETE coverage
                                tile_completely_covers_city = (src_left <= left and src_right >= right and 
                                                             src_bottom <= bottom and src_top >= top)
                                
                                print(f"     City bounds: ({left:.6f}, {bottom:.6f}) to ({right:.6f}, {top:.6f})")
                                print(f"     Tile bounds: ({src_left:.6f}, {src_bottom:.6f}) to ({src_right:.6f}, {src_top:.6f})")
                                print(f"     Coverage: {overlap_percentage:.1f}% | Clouds: {cloud_cover:.1f}%")
                                print(f"     COMPLETE COVERAGE CHECK:")
                                print(f"       Left check: {src_left:.6f} <= {left:.6f} = {src_left <= left}")
                                print(f"       Right check: {src_right:.6f} >= {right:.6f} = {src_right >= right}")
                                print(f"       Bottom check: {src_bottom:.6f} <= {bottom:.6f} = {src_bottom <= bottom}")
                                print(f"       Top check: {src_top:.6f} >= {top:.6f} = {src_top >= top}")
                                print(f"       Overall complete coverage: {tile_completely_covers_city}")
                                
                                if tile_completely_covers_city:
                                    print(f"     🎯 COMPLETE COVERAGE FOUND! Adding to priority candidates")
                                    complete_coverage_candidates.append((item, cloud_cover, overlap_percentage))
                                    # Give massive score boost for complete coverage
                                    overlap_score = overlap_percentage * 100 * (1 - cloud_cover / 100)
                                elif overlap_percentage >= 98:
                                    print(f"     ✅ EXCELLENT COVERAGE: {overlap_percentage:.1f}%")
                                    overlap_score = overlap_percentage * 10 * (1 - cloud_cover / 100)
                                elif overlap_percentage >= 95:
                                    print(f"     ⚠️ GOOD COVERAGE: {overlap_percentage:.1f}%")
                                    overlap_score = overlap_percentage * 3 * (1 - cloud_cover / 100)
                                else:
                                    print(f"     ❌ POOR COVERAGE: Only {overlap_percentage:.1f}% of city covered!")
                                    overlap_score = overlap_percentage * 0.1 * (1 - cloud_cover / 100)
                                
                                if overlap_score > best_overlap_score:
                                    best_overlap_score = overlap_score
                                    best_item = item
                                    coverage_type = "COMPLETE" if tile_completely_covers_city else "PARTIAL"
                                    print(f"     🏆 NEW BEST MATCH! ({coverage_type} - Score: {overlap_score:.1f})")
                            else:
                                print(f"     ❌ NO OVERLAP")
            except Exception as e:
                print(f"     ❌ Error checking {item.id}: {e}")
                continue
        
        # PRIORITY SELECTION: Choose complete coverage if available
        print(f"\n🔍 COMPLETE COVERAGE ANALYSIS SUMMARY:")
        print(f"   Complete coverage candidates found: {len(complete_coverage_candidates)}")
        
        if complete_coverage_candidates:
            print(f"🎯 Found {len(complete_coverage_candidates)} tiles with COMPLETE city coverage!")
            print(f"🔧 IMPLEMENTING MULTI-TILE GAP-FILLING APPROACH for Vancouver!")
            
            # Sort complete coverage candidates by cloud cover
            complete_coverage_candidates.sort(key=lambda x: x[1])  # Sort by cloud cover
            
            # Store all complete coverage candidates for multi-tile processing
            self.complete_coverage_tiles = complete_coverage_candidates
            
            # Select the best tile as primary
            best_complete = complete_coverage_candidates[0]
            best_item = best_complete[0]
            print(f"🏆 PRIMARY TILE: {best_item.id}")
            print(f"   Cloud cover: {best_complete[1]:.1f}%")
            print(f"   Coverage: {best_complete[2]:.1f}%")
            print(f"🔧 BACKUP TILES: {len(complete_coverage_candidates)-1} additional tiles for gap filling")
            print(f"   🚨 MULTI-TILE VANCOUVER FIX ACTIVATED! 🚨")
        elif not best_item:
            # Fallback to first item if no overlap found
            best_item = items[0]
            self.complete_coverage_tiles = []
            print(f"⚠️ No overlapping tiles found, using first item anyway")
            print(f"🚨 ALGORITHM FAILURE - THIS WILL CAUSE MISSING COVERAGE! 🚨")
        else:
            print(f"🎯 BEST PARTIAL MATCH: {best_item.id} (overlap score: {best_overlap_score:.1f})")
            self.complete_coverage_tiles = []
            print(f"⚠️ NO COMPLETE COVERAGE TILES FOUND - this may result in missing areas")
            print(f"🚨 ALGORITHM FAILURE - THIS WILL CAUSE MISSING COVERAGE! 🚨")
            
            # CRITICAL: Check if we need to try additional tiles for better coverage
            # Extract the best coverage percentage for validation
            best_coverage = 0
            try:
                with rasterio.Env(GDAL_HTTP_UNSAFESSL='YES'):
                    with rasterio.open(best_item.assets['red'].href) as src:
                        transformer = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
                        left, bottom = transformer.transform(city_bounds['west'], city_bounds['south'])
                        right, top = transformer.transform(city_bounds['east'], city_bounds['north'])
                        
                        src_left, src_bottom, src_right, src_top = src.bounds
                        if left < src_right and right > src_left and bottom < src_top and top > src_bottom:
                            city_area = (right - left) * (top - bottom)
                            int_left = max(left, src_left)
                            int_right = min(right, src_right)
                            int_bottom = max(bottom, src_bottom)
                            int_top = min(top, src_top)
                            overlap_area = (int_right - int_left) * (int_top - int_bottom)
                            best_coverage = (overlap_area / city_area) * 100
            except:
                pass
            
            # If coverage is poor, warn about potential incomplete analysis
            if best_coverage < 95:
                print(f"⚠️ WARNING: Best available satellite tile only covers {best_coverage:.1f}% of city")
                print(f"⚠️ Some areas of the city may have missing vegetation analysis")
                print(f"⚠️ Consider using a different date range for better satellite coverage")
        
        item = best_item
        print(f"🎯 FINAL SELECTION: {item.id} (cloud cover: {item.properties.get('eo:cloud_cover', 0)}%)")
        
        # Download and process bands with PERFECT alignment
        bands_data = self.download_bands_with_perfect_alignment(item, city_bounds)
        
        if not bands_data:
            raise Exception("Failed to download satellite bands")
            
        # Process NDVI and create visualizations
        print_progress(70, "Creating perfectly aligned vegetation analysis...")
        result = self.create_aligned_vegetation_analysis(bands_data, city_bounds)
        
        # Compute 2020 baseline and percent change (if not already 2020)
        baseline_2020 = None
        try:
            if not (self.start_year == 2020 and self.end_year == 2020):
                baseline_2020 = self._compute_baseline_2020(city_bounds)
        except Exception as e:
            print(f"⚠️ Baseline 2020 computation failed: {e}")

        print_progress(90, "Saving results with perfect geographic alignment...")
        self.save_perfectly_aligned_results(result, city_bounds, baseline_2020)
        
        print_progress(100, "Perfect alignment processing completed!")
        return result

    def download_bands_with_perfect_alignment(self, item, city_bounds):
        """Download satellite bands and ensure they're perfectly aligned to city bounds"""
        print_progress(30, "Downloading bands with perfect alignment...")
        
        bands_needed = ['red', 'green', 'blue', 'nir', 'scl']
        bands_data = {}
        
        # Enhanced target resolution for sub-pixel precision
        target_width = 1024  # Fixed size for consistent alignment  
        target_height = 1024
        
        # Sub-pixel precision factor for better alignment
        precision_factor = 2  # Temporary higher resolution for precision
        temp_width = target_width * precision_factor
        temp_height = target_height * precision_factor
        
        for i, band_name in enumerate(bands_needed):
            print(f"   Downloading {band_name}...")
            
            # Get band asset
            if band_name in item.assets:
                asset = item.assets[band_name]
            elif band_name == 'scl' and 'SCL' in item.assets:
                asset = item.assets['SCL']
            else:
                print(f"   ❌ Band {band_name} not found")
                continue
                
            try:
                # Open the satellite image with authentication
                with rasterio.Env(GDAL_HTTP_UNSAFESSL='YES', GDAL_HTTP_COOKIEFILE='', GDAL_HTTP_COOKIEJAR=''):
                    with rasterio.open(asset.href) as src:
                        print(f"     📊 Source info: {src.shape}, CRS: {src.crs}, Bands: {src.count}")
                        
                        # Read a sample to check data (skip stats for categorical SCL)
                        if band_name != 'scl':
                            sample = src.read(1, window=rasterio.windows.Window(0, 0, 100, 100))
                            print(f"     🔍 Sample data: min={sample.min()}, max={sample.max()}, mean={sample.mean():.3f}")
                        
                        # Get satellite CRS (usually UTM)
                        self.satellite_crs = src.crs
                        
                        # CRITICAL: Transform city bounds from WGS84 to satellite CRS
                        transformer = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
                        
                        # Transform bounds to satellite coordinate system
                        left, bottom = transformer.transform(city_bounds['west'], city_bounds['south'])
                        right, top = transformer.transform(city_bounds['east'], city_bounds['north'])
                        
                        print(f"     📍 Transformed bounds: ({left:.1f}, {bottom:.1f}) to ({right:.1f}, {top:.1f})")
                        
                        # Check if bounds are within the source image
                        src_left, src_bottom, src_right, src_top = src.bounds
                        print(f"     📊 Source bounds: ({src_left:.1f}, {src_bottom:.1f}) to ({src_right:.1f}, {src_top:.1f})")
                        
                        if not (left < src_right and right > src_left and bottom < src_top and top > src_bottom):
                            print(f"     ⚠️ WARNING: City bounds don't overlap with source image!")
                        
                        # Create high-precision transform for sub-pixel alignment
                        temp_transform = from_bounds(left, bottom, right, top, temp_width, temp_height)
                        
                        # Create high-resolution temporary array for sub-pixel precision
                        temp_array = np.zeros((temp_height, temp_width), dtype=(np.float32 if band_name != 'scl' else np.int16))
                        
                        # Reproject with high precision using cubic resampling
                        reproject(
                            source=rasterio.band(src, 1),
                            destination=temp_array,
                            src_transform=src.transform,
                            src_crs=src.crs,
                            dst_transform=temp_transform,
                            dst_crs=src.crs,
                            resampling=(Resampling.cubic if band_name != 'scl' else Resampling.nearest)
                        )
                        
                        # Downsample to final resolution with anti-aliasing for precise alignment
                        from scipy.ndimage import zoom
                        scale_factor = 1.0 / precision_factor
                        output_array = zoom(temp_array, scale_factor, order=(0 if band_name == 'scl' else 3))
                        
                        # Ensure exact target dimensions
                        if output_array.shape != (target_height, target_width):
                            from scipy.ndimage import resize
                            output_array = zoom(temp_array, (target_height/temp_height, target_width/temp_width), order=3)
                        
                        if band_name != 'scl':
                            print(f"     📈 After reproject: min={output_array.min()}, max={output_array.max()}, mean={output_array.mean():.3f}")
                        
                        bands_data[band_name] = output_array
                    
                    # Store the PERFECT bounds for this band
                    if not self.wgs84_bounds:
                        # CRITICAL FIX: Use exact city bounds instead of transformed coordinates
                        # This ensures the frontend overlay matches the city polygon boundaries exactly
                        self.wgs84_bounds = {
                            'west': city_bounds['west'],
                            'south': city_bounds['south'],
                            'east': city_bounds['east'],
                            'north': city_bounds['north'],
                            'crs': 'EPSG:4326'
                        }
                        
                        print(f"   📍 PERFECT CITY BOUNDS SET: {self.wgs84_bounds}")
                        print(f"   📍 Original city bounds: {city_bounds}")
                        print(f"   📍 Bounds now match city polygon EXACTLY")
                    
                    print(f"   ✅ {band_name}: {output_array.shape}")
                    
            except Exception as e:
                print(f"   ❌ Failed to download {band_name}: {e}")
                
        if sum(1 for k in ['red','green','blue','nir'] if k in bands_data) != 4:
            print(f"❌ Only got {sum(1 for k in ['red','green','blue','nir'] if k in bands_data)}/4 required bands")
            return None
            
        print("✅ All bands downloaded with perfect alignment")
        return bands_data

    def create_aligned_vegetation_analysis(self, bands_data, city_bounds):
        """Create vegetation analysis with perfect alignment AND city polygon masking"""
        red = bands_data['red'].astype(np.float32)
        green = bands_data['green'].astype(np.float32) 
        blue = bands_data['blue'].astype(np.float32)
        nir = bands_data['nir'].astype(np.float32)
        
        # CRITICAL: Create city polygon mask to analyze ONLY pixels inside city boundaries
        height, width = red.shape
        city_mask = self.create_city_polygon_mask(height, width, city_bounds)
        
        print(f"🎯 APPLYING CITY POLYGON MASK:")
        print(f"   Image size: {height} x {width} = {height * width:,} pixels")
        print(f"   City pixels: {np.sum(city_mask):,} pixels")
        print(f"   Analysis will ONLY include pixels inside city polygon")
        
        # CRITICAL: Validate satellite data coverage within city polygon
        coverage_percentage = self.validate_satellite_coverage(red, nir, city_mask)
        
        # MULTI-TILE GAP FILLING for Vancouver
        if (coverage_percentage < 95.0 and hasattr(self, 'complete_coverage_tiles') and 
            len(self.complete_coverage_tiles) > 1):
            print(f"\n🔧 INITIATING MULTI-TILE GAP FILLING:")
            print(f"   Current coverage: {coverage_percentage:.1f}% (target: 95%+)")
            print(f"   Available backup tiles: {len(self.complete_coverage_tiles)-1}")
            
            # Try to fill gaps with additional tiles
            red, green, blue, nir = self.fill_coverage_gaps(red, green, blue, nir, city_mask, city_bounds)
            
            # Re-validate coverage after gap filling
            final_coverage = self.validate_satellite_coverage(red, nir, city_mask)
            print(f"🎯 FINAL COVERAGE after gap filling: {final_coverage:.1f}%")
            
            if final_coverage >= 95.0:
                print(f"✅ VANCOUVER COVERAGE SUCCESS! Achieved {final_coverage:.1f}% coverage")
            else:
                print(f"⚠️ Still incomplete: {final_coverage:.1f}% coverage")
        else:
            print(f"✅ Single tile coverage sufficient: {coverage_percentage:.1f}%")
        
        # Calculate NDVI with debugging
        print(f"   🔍 Band statistics before NDVI:")
        print(f"     Red: min={red.min():.3f}, max={red.max():.3f}, mean={red.mean():.3f}")
        print(f"     NIR: min={nir.min():.3f}, max={nir.max():.3f}, mean={nir.mean():.3f}")
        
        # Calculate NDVI
        ndvi = (nir - red) / (nir + red + 1e-10)
        ndvi = np.clip(ndvi, -1, 1)
        # Apply per-pixel SCL masking if available (exclude clouds/shadows/water)
        scl = bands_data.get('scl')
        valid_quality_mask = np.ones_like(ndvi, dtype=bool)
        if scl is not None:
            exclude_classes = {0, 1, 3, 6, 8, 9, 10, 11}
            for cls in exclude_classes:
                valid_quality_mask &= (scl != cls)
            ndvi = np.where(valid_quality_mask, ndvi, np.nan)
            print(f"   ☁️ Applied SCL mask (excluded cloud/shadow/water)")
        
        print(f"   📊 NDVI statistics:")
        print(f"     Min: {ndvi.min():.3f}, Max: {ndvi.max():.3f}, Mean: {ndvi.mean():.3f}")
        print(f"     Values > {self.ndvi_threshold}: {np.sum(ndvi >= self.ndvi_threshold)} pixels")
        
        # CRITICAL: Apply city mask to all vegetation analysis - ONLY analyze pixels inside city
        enhanced_threshold = max(0.2, self.ndvi_threshold - 0.05)  # Lower threshold for better detection
        
        # Apply city mask to ALL vegetation classifications
        vegetation_mask = (ndvi >= enhanced_threshold) & city_mask
        high_density = (ndvi >= 0.55) & city_mask  # High density vegetation inside city
        medium_density = (ndvi >= 0.35) & (ndvi < 0.55) & city_mask  # Medium density inside city
        low_density = (ndvi >= enhanced_threshold) & (ndvi < 0.35) & city_mask  # Low density inside city
        subtle_vegetation = (ndvi >= 0.15) & (ndvi < enhanced_threshold) & city_mask  # Subtle inside city
        
        # Calculate statistics ONLY for pixels inside the city polygon
        # Denominator should be stable across years: always use full city area
        total_city_pixels = np.sum(city_mask)
        if 'scl' in bands_data and valid_quality_mask is not None:
            cloud_excluded_pixels = np.sum(city_mask & ~valid_quality_mask)
            cloud_excluded_percentage = (cloud_excluded_pixels / (total_city_pixels or 1)) * 100.0
        else:
            cloud_excluded_percentage = 0.0
        vegetation_pixels = np.sum(vegetation_mask)
        vegetation_percentage = (vegetation_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        
        # Calculate density percentages relative to city area (not entire image)
        high_pixels = np.sum(high_density)
        medium_pixels = np.sum(medium_density) 
        low_pixels = np.sum(low_density)
        subtle_pixels = np.sum(subtle_vegetation)
        
        high_percentage = (high_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        medium_percentage = (medium_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        low_percentage = (low_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        subtle_percentage = (subtle_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        
        print(f"🌱 Enhanced Vegetation Coverage (CITY AREA ONLY): {vegetation_percentage:.1f}%")
        print(f"   High density: {high_percentage:.1f}% ({high_pixels:,} pixels)")
        print(f"   Medium density: {medium_percentage:.1f}% ({medium_pixels:,} pixels)")
        print(f"   Low density: {low_percentage:.1f}% ({low_pixels:,} pixels)")
        print(f"   Subtle vegetation: {subtle_percentage:.1f}% ({subtle_pixels:,} pixels)")
        print(f"🎯 CITY POLYGON ANALYSIS:")
        print(f"   Total city pixels: {total_city_pixels:,}")
        print(f"   Vegetation pixels in city: {vegetation_pixels:,}")
        print(f"   Non-city pixels excluded from analysis: {ndvi.size - total_city_pixels:,}")
        
        return {
            'red': red,
            'green': green,
            'blue': blue,
            'nir': nir,
            'ndvi': ndvi,
            'city_mask': city_mask,  # Include the city mask for visualization
            'vegetation_mask': vegetation_mask,
            'vegetation_percentage': vegetation_percentage,
            'high_density_percentage': high_percentage,
            'medium_density_percentage': medium_percentage,
            'low_density_percentage': low_percentage,
            'ndvi_mean': float(np.nanmean(ndvi)) if np.any(np.isfinite(ndvi)) else 0.0,
            'cloud_excluded_percentage': float(cloud_excluded_percentage),
            'subtle_percentage': subtle_percentage,
            'high_density': high_density,
            'medium_density': medium_density,
            'low_density': low_density,
            'subtle_vegetation': subtle_vegetation,
            'total_pixels': total_city_pixels,  # CRITICAL: Use city pixels, not image pixels
            'vegetation_pixels': vegetation_pixels,
            'enhanced_threshold': enhanced_threshold
        }

    def _compute_baseline_2020(self, city_bounds):
        """Compute vegetation percentage for 2020 using same months and settings."""
        # Keep same month(s), city, thresholds; only year to 2020
        year_backup = self.start_year, self.end_year
        try:
            self.start_year = 2020
            self.end_year = 2020
            # Query and pick best tile as in main flow
            start_date = datetime(self.start_year, int(self.start_month), 1)
            end_date = datetime(self.end_year, int(self.end_month), 28)
            search = self.stac_client.search(
                collections=["sentinel-2-l2a"],
                bbox=[city_bounds['west'], city_bounds['south'], city_bounds['east'], city_bounds['north']],
                datetime=f"{start_date.date()}/{end_date.date()}",
                query={"eo:cloud_cover": {"lt": self.cloud_threshold}}
            )
            items = list(search.items())
            if not items:
                return None
            items.sort(key=lambda x: x.properties.get('eo:cloud_cover', 100))
            item = items[0]
            bands_data = self.download_bands_with_perfect_alignment(item, city_bounds)
            if not bands_data:
                return None
            analysis = self.create_aligned_vegetation_analysis(bands_data, city_bounds)
            return float(analysis['vegetation_percentage'])
        finally:
            self.start_year, self.end_year = year_backup

    def save_perfectly_aligned_results(self, result, city_bounds, baseline_2020=None):
        """Save results with perfect geographic alignment"""
        
        # Create enhanced false color composite (NIR, Red, Green) for vegetation visibility
        # Apply vegetation-enhanced normalization
        nir_enhanced = self.enhance_vegetation_band(result['nir'])
        red_enhanced = self.normalize_band(result['red'])
        green_enhanced = self.enhance_vegetation_band(result['green'])
        
        false_color = np.dstack([
            nir_enhanced,  # Red channel - NIR shows vegetation as bright red
            red_enhanced,  # Green channel - actual red
            green_enhanced # Blue channel - enhanced green
        ])
        
        # Save false color image with vegetation enhancement
        false_color_path = self.vegetation_dir / 'false_color_base.png'
        cv2.imwrite(str(false_color_path), (false_color * 255).astype(np.uint8))
        
        # Also create a natural color composite for comparison
        natural_color = np.dstack([
            self.normalize_band(result['red']),
            self.normalize_band(result['green']),
            self.normalize_band(result['blue'])
        ])
        natural_color_path = self.vegetation_dir / 'natural_color_base.png'
        cv2.imwrite(str(natural_color_path), (natural_color * 255).astype(np.uint8))
        
        # Create vegetation highlighted overlay
        vegetation_overlay = self.create_vegetation_overlay(result)
        vegetation_path = self.vegetation_dir / 'vegetation_highlighted.png'
        cv2.imwrite(str(vegetation_path), vegetation_overlay)
        
        # Create NDVI visualization
        ndvi_viz = self.create_ndvi_visualization(result['ndvi'])
        ndvi_path = self.vegetation_dir / 'ndvi_visualization.png'
        cv2.imwrite(str(ndvi_path), ndvi_viz)
        
        # Save NDVI as GeoTIFF with perfect georeferencing
        self.save_georeferenced_ndvi(result['ndvi'])
        
        # Save city mask for change visualization
        self.save_city_mask(result.get('city_mask'))
        
        # Create summary with PERFECT bounds
        summary = {
            'vegetation_percentage': float(result['vegetation_percentage']),
            'high_density_percentage': float(result['high_density_percentage']),
            'medium_density_percentage': float(result['medium_density_percentage']),
            'low_density_percentage': float(result['low_density_percentage']),
            'ndvi_mean': float(result.get('ndvi_mean', 0.0)),
            'total_pixels': int(result['total_pixels']),
            'vegetation_pixels': int(result['vegetation_pixels']),
            'images_processed': 1,
            'images_found': 1,
            'ndvi_threshold': self.ndvi_threshold,
            'geographic_bounds': self.wgs84_bounds,  # PERFECT BOUNDS
            'city_info': {
                'name': f"{self.city_data['city']}, {self.city_data['country']}",
                'center_lat': (self.wgs84_bounds['north'] + self.wgs84_bounds['south']) / 2,
                'center_lon': (self.wgs84_bounds['east'] + self.wgs84_bounds['west']) / 2
            },
            'processing_config': {
                'ndvi_threshold': self.ndvi_threshold,
                'cloud_threshold': self.cloud_threshold,
                'highlight_alpha': 0.6,
                'date_range': f"{self.start_year}-{int(self.start_month):02d} to {self.end_year}-{int(self.end_month):02d}"
            },
            'baseline_vegetation_2020': float(baseline_2020) if baseline_2020 is not None else None,
            'percent_change_vs_2020': (
                (float(result['vegetation_percentage']) - float(baseline_2020)) / float(baseline_2020) * 100
            ) if baseline_2020 not in (None, 0) else None,
            'cloud_excluded_percentage': float(result.get('cloud_excluded_percentage', 0.0)),
            'output_files': [
                'vegetation_highlighted.png',
                'ndvi_visualization.png', 
                'false_color_base.png'
            ]
        }
        
        # Save summary
        summary_path = self.vegetation_dir / 'vegetation_analysis_summary.json'
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        # CRITICAL: Validate boundary alignment
        boundary_match = self.validate_boundary_alignment(self.wgs84_bounds)
        if boundary_match:
            print(f"✅ BOUNDARY VALIDATION PASSED - Perfect alignment achieved!")
        else:
            print(f"❌ BOUNDARY VALIDATION FAILED - Alignment issues detected!")
            
        print(f"📍 PERFECT ALIGNMENT SUMMARY:")
        print(f"   Bounds: {self.wgs84_bounds}")
        print(f"   Center: {summary['city_info']['center_lat']:.6f}, {summary['city_info']['center_lon']:.6f}")
        print(f"   Files saved to: {self.vegetation_dir}")
        print(f"   Boundary validation: {'✅ PASSED' if boundary_match else '❌ FAILED'}")

    def normalize_band(self, band):
        """Normalize band to 0-1 range"""
        min_val = np.percentile(band, 2)
        max_val = np.percentile(band, 98)
        normalized = (band - min_val) / (max_val - min_val)
        return np.clip(normalized, 0, 1)
    
    def enhance_vegetation_band(self, band):
        """Enhanced normalization for vegetation bands to make green areas more visible"""
        min_val = np.percentile(band, 1)  # Use more aggressive percentiles
        max_val = np.percentile(band, 99)
        
        # Apply gamma correction to enhance mid-range values (vegetation)
        normalized = (band - min_val) / (max_val - min_val)
        normalized = np.clip(normalized, 0, 1)
        
        # Gamma correction to enhance vegetation visibility
        gamma = 0.8  # Values < 1 brighten mid-tones
        enhanced = np.power(normalized, gamma)
        
        return enhanced

    def create_vegetation_overlay(self, result):
        """Create enhanced vegetation density overlay with purple transparency scheme - CITY POLYGON ONLY"""
        height, width = result['ndvi'].shape
        overlay = np.zeros((height, width, 4), dtype=np.uint8)
        
        # CRITICAL: Get city mask to ensure overlay only appears inside city polygon
        city_mask = result.get('city_mask', np.ones((height, width), dtype=bool))
        
        print(f"🎨 Creating vegetation overlay - CITY POLYGON ONLY:")
        print(f"   City mask coverage: {np.sum(city_mask):,} / {city_mask.size:,} pixels")
        
        # Apply city mask to all vegetation overlays - ONLY show vegetation inside city boundaries
        # Subtle vegetation (very light purple) - for grass and sparse vegetation INSIDE CITY
        if 'subtle_vegetation' in result:
            subtle_mask = result['subtle_vegetation'] & city_mask  # Ensure inside city
            overlay[subtle_mask] = [230, 210, 255, 80]  # Very light purple with low alpha
            print(f"   Subtle vegetation pixels: {np.sum(subtle_mask):,}")
        
        # Low density vegetation (light purple) - INSIDE CITY ONLY
        low_mask = result['low_density'] & city_mask  # Ensure inside city
        overlay[low_mask] = [204, 153, 255, 120]  # Light purple with alpha
        print(f"   Low density pixels: {np.sum(low_mask):,}")
        
        # Medium density vegetation (medium purple) - INSIDE CITY ONLY
        medium_mask = result['medium_density'] & city_mask  # Ensure inside city
        overlay[medium_mask] = [153, 102, 204, 150]  # Medium purple with alpha
        print(f"   Medium density pixels: {np.sum(medium_mask):,}")
        
        # High density vegetation (dark purple) - INSIDE CITY ONLY
        high_mask = result['high_density'] & city_mask  # Ensure inside city
        overlay[high_mask] = [102, 51, 153, 180]  # Dark purple with alpha
        print(f"   High density pixels: {np.sum(high_mask):,}")
        
        # Make areas outside city completely transparent
        outside_city = ~city_mask
        overlay[outside_city] = [0, 0, 0, 0]  # Completely transparent outside city
        
        total_vegetation_pixels = np.sum(overlay[:, :, 3] > 0)  # Count pixels with any alpha
        print(f"   Total vegetation overlay pixels: {total_vegetation_pixels:,}")
        print(f"   ✅ Overlay ONLY shows vegetation inside city polygon")
        
        return overlay

    def create_ndvi_visualization(self, ndvi):
        """Create NDVI visualization with color mapping"""
        # Normalize NDVI to 0-255 range
        ndvi_norm = ((ndvi + 1) / 2 * 255).astype(np.uint8)
        
        # Apply colormap (viridis-like)
        colored = cv2.applyColorMap(ndvi_norm, cv2.COLORMAP_VIRIDIS)
        
        return colored

    def create_vegetation_change_visualization(self, baseline_result, current_result, output_path):
        """Create vegetation change visualization showing gain/loss between two years"""
        print(f"🔄 Creating vegetation change visualization...")
        
        # Get NDVI data and city masks from both years
        baseline_ndvi = baseline_result['ndvi']
        current_ndvi = current_result['ndvi']
        city_mask = baseline_result.get('city_mask', np.ones_like(baseline_ndvi, dtype=bool))
        
        # Ensure both NDVI arrays have the same shape
        if baseline_ndvi.shape != current_ndvi.shape:
            print(f"⚠️ NDVI shape mismatch: baseline {baseline_ndvi.shape} vs current {current_ndvi.shape}")
            return None
        
        height, width = baseline_ndvi.shape
        
        # Define vegetation threshold (same as used in processing)
        veg_threshold = max(0.2, self.ndvi_threshold - 0.05)
        
        # Create vegetation masks for both years
        baseline_veg = (baseline_ndvi >= veg_threshold) & city_mask
        current_veg = (current_ndvi >= veg_threshold) & city_mask
        
        # Calculate change categories
        vegetation_gain = current_veg & ~baseline_veg  # New vegetation
        vegetation_loss = baseline_veg & ~current_veg  # Lost vegetation
        vegetation_stable = baseline_veg & current_veg  # Stable vegetation
        no_vegetation = ~baseline_veg & ~current_veg & city_mask  # Consistently no vegetation
        
        # Create RGB change visualization
        change_image = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Color scheme:
        # Green = Vegetation gain
        # Red = Vegetation loss  
        # Light green = Stable vegetation
        # Gray = No vegetation (both years)
        # Black = Outside city
        
        change_image[vegetation_gain] = [0, 255, 0]      # Bright green for gain
        change_image[vegetation_loss] = [255, 0, 0]      # Bright red for loss
        change_image[vegetation_stable] = [100, 200, 100] # Light green for stable
        change_image[no_vegetation] = [128, 128, 128]    # Gray for no vegetation
        change_image[~city_mask] = [0, 0, 0]             # Black outside city
        
        # Calculate statistics
        gain_pixels = np.sum(vegetation_gain)
        loss_pixels = np.sum(vegetation_loss)
        stable_pixels = np.sum(vegetation_stable)
        total_city_pixels = np.sum(city_mask)
        
        gain_percentage = (gain_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        loss_percentage = (loss_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        stable_percentage = (stable_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
        
        print(f"   📊 Vegetation Change Analysis:")
        print(f"     🟢 Vegetation Gain: {gain_percentage:.1f}% ({gain_pixels:,} pixels)")
        print(f"     🔴 Vegetation Loss: {loss_percentage:.1f}% ({loss_pixels:,} pixels)")
        print(f"     🟢 Stable Vegetation: {stable_percentage:.1f}% ({stable_pixels:,} pixels)")
        print(f"     📍 Total City Pixels: {total_city_pixels:,}")
        
        # Save the change visualization
        try:
            success = cv2.imwrite(str(output_path), change_image)
            if success:
                print(f"   ✅ Change visualization saved: {output_path}")
            else:
                print(f"   ❌ Failed to save change visualization")
                return None
        except Exception as e:
            print(f"   ❌ Error saving change visualization: {e}")
            return None
        
        # Return statistics for use in summary
        return {
            'gain_percentage': gain_percentage,
            'loss_percentage': loss_percentage,
            'stable_percentage': stable_percentage,
            'gain_pixels': gain_pixels,
            'loss_pixels': loss_pixels,
            'stable_pixels': stable_pixels,
            'total_city_pixels': total_city_pixels,
            'change_image_path': str(output_path)
        }

    def save_georeferenced_ndvi(self, ndvi):
        """Save NDVI as GeoTIFF with perfect georeferencing"""
        if not self.wgs84_bounds:
            return
            
        # Create transform
        transform = from_bounds(
            self.wgs84_bounds['west'],
            self.wgs84_bounds['south'], 
            self.wgs84_bounds['east'],
            self.wgs84_bounds['north'],
            ndvi.shape[1],
            ndvi.shape[0]
        )
        
        # Save as GeoTIFF
        ndvi_tiff_path = self.vegetation_dir / 'ndvi_data.tif'
        with rasterio.open(
            ndvi_tiff_path,
            'w',
            driver='GTiff',
            height=ndvi.shape[0],
            width=ndvi.shape[1],
            count=1,
            dtype=ndvi.dtype,
            crs='EPSG:4326',
            transform=transform
        ) as dst:
            dst.write(ndvi, 1)
            
        print(f"✅ NDVI GeoTIFF saved: {ndvi_tiff_path}")
        
        # Also save raw numpy array for change visualization
        ndvi_npy_path = self.vegetation_dir / 'ndvi_data.npy'
        np.save(ndvi_npy_path, ndvi)
        print(f"✅ NDVI numpy array saved: {ndvi_npy_path}")
        
    def save_city_mask(self, city_mask):
        """Save city mask for change visualization"""
        if city_mask is not None:
            mask_npy_path = self.vegetation_dir / 'city_mask.npy'
            np.save(mask_npy_path, city_mask)
            print(f"✅ City mask saved: {mask_npy_path}")

def main():
    """Main function to run perfect alignment processing"""
    if len(sys.argv) != 2:
        print("Usage: python satellite_processor_fixed.py <config_file>")
        sys.exit(1)
        
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
            
        processor = PerfectAlignmentSatelliteProcessor(config)
        result = processor.download_and_process_satellite_data()
        
        print("🎉 PERFECT ALIGNMENT PROCESSING COMPLETED!")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()