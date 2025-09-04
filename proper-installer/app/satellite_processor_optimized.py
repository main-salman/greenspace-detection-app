#!/usr/bin/env python3
"""
Optimized Satellite Processor for Greenspace Web App
Based on satellite_processing_combined.ipynb and vegetation_highlighter.ipynb
Implements proper NDVI calculation and vegetation highlighting with geospatial accuracy
"""

import os
import sys
import json
import numpy as np
import requests
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import cv2
from datetime import datetime
from pathlib import Path
from shapely.geometry import Polygon
from pystac_client import Client
import time
import warnings
warnings.filterwarnings('ignore')

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

class OptimizedSatelliteProcessor:
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
        
        # Vegetation highlighting configuration
        self.highlight_color = [0, 255, 0]  # Green for vegetation
        self.highlight_alpha = 0.6
        
        # Create output directories
        self.vegetation_dir = self.output_dir / 'vegetation_analysis'
        self.vegetation_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize STAC client
        self.stac_client = Client.open("https://earth-search.aws.element84.com/v1")
        
        # Create HTTP session with proper headers
        self.session = self._create_session()
        
        # Store geographic bounds for accurate overlay
        self.geographic_bounds = None
        self.city_polygon_bounds = None
        
        print(f"🚀 Enhanced Satellite Processor")
        print(f"📍 {self.city_data['city']}, {self.city_data['country']}")
        print(f"📅 {self.start_month}/{self.start_year} to {self.end_month}/{self.end_year}")
        print(f"🌱 NDVI Threshold: {self.ndvi_threshold}")
        print(f"☁️ Cloud Threshold: {self.cloud_threshold}%")

    def _create_session(self):
        """Create HTTP session with proper configuration"""
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'EnhancedSatelliteProcessor/2.0',
            'Connection': 'keep-alive'
        })
        return session

    def _s3_to_https(self, url):
        """Convert S3 URLs to HTTPS for direct access"""
        if url.startswith('s3://'):
            return url.replace('s3://', 'https://').replace('/', '.s3.amazonaws.com/', 1)
        return url

    def _download_band_with_metadata(self, url, band_name):
        """Download band with geospatial metadata preservation"""
        try:
            url = self._s3_to_https(url)
            print(f"       Downloading {band_name}: {url[:80]}...")
            
            response = self.session.get(url, timeout=60)
            response.raise_for_status()
            
            with rasterio.MemoryFile(response.content) as memfile:
                with memfile.open() as src:
                    # Get transform and CRS for later use
                    transform = src.transform
                    crs = src.crs
                    bounds = src.bounds
                    
                    # Read with moderate downsampling for balance of speed and quality
                    downsample_factor = 3  # Every 3rd pixel for better quality than before
                    data = src.read(1, out_shape=(src.height // downsample_factor, src.width // downsample_factor))
                    data = data.astype(np.float32)
                    
                    # Store bounds if this is the first band
                    if self.geographic_bounds is None:
                        self.geographic_bounds = {
                            'north': bounds.top,
                            'south': bounds.bottom,
                            'east': bounds.right,
                            'west': bounds.left,
                            'transform': list(transform)[:6],  # Convert to JSON-serializable list
                            'crs': str(crs),  # Convert CRS to string representation
                            'original_shape': (int(src.height), int(src.width)),
                            'processed_shape': (int(data.shape[0]), int(data.shape[1]))
                        }
                        print(f"       📍 SATELLITE BOUNDS SET: N={bounds.top:.6f}, S={bounds.bottom:.6f}, E={bounds.right:.6f}, W={bounds.left:.6f}")
                    
                    print(f"       ✅ {band_name}: {data.shape}, bounds: {bounds}")
                    return data
                    
        except Exception as e:
            print(f"       ❌ Failed to download {band_name}: {e}")
            return None

    def _get_city_bounds(self):
        """Get city bounds with improved accuracy from polygon or coordinates"""
        try:
            if 'polygon_geojson' in self.city_data and self.city_data['polygon_geojson']:
                polygon_data = self.city_data['polygon_geojson']['geometry']
                if polygon_data['type'] == 'Polygon':
                    coordinates = polygon_data['coordinates'][0]
                    lons = [coord[0] for coord in coordinates]
                    lats = [coord[1] for coord in coordinates]
                    
                    # Add padding to ensure satellite coverage
                    lat_range = max(lats) - min(lats)
                    lon_range = max(lons) - min(lons)
                    padding = max(lat_range, lon_range, 0.05) * 0.2  # 20% padding, minimum 0.01°
                    
                    bounds = {
                        'min_lat': min(lats) - padding, 'max_lat': max(lats) + padding,
                        'min_lon': min(lons) - padding, 'max_lon': max(lons) + padding
                    }
                    
                    # Store city polygon bounds WITHOUT padding for accurate overlay positioning
                    self.city_polygon_bounds = {
                        'north': max(lats),
                        'south': min(lats), 
                        'east': max(lons),
                        'west': min(lons)
                    }
                    
                    polygon = Polygon(coordinates)
                    area_km_sq = polygon.area * 111.0 * 111.0  # Rough conversion to km²
                    
                    print(f"📍 Using polygon bounds with padding: {bounds}")
                    print(f"📍 City polygon bounds (for overlay): {self.city_polygon_bounds}")
                    print(f"📏 Area: ~{area_km_sq:.1f} km²")
                    return bounds
        except Exception as e:
            print(f"⚠️ Error with polygon: {e}")
        
        # Fallback to city coordinates with adaptive buffer
        lat = float(self.city_data['latitude'])
        lon = float(self.city_data['longitude'])
        buffer = 0.08  # Larger buffer for better satellite coverage
        
        bounds = {
            'min_lat': lat - buffer, 'max_lat': lat + buffer,
            'min_lon': lon - buffer, 'max_lon': lon + buffer
        }
        
        # Store city coordinate bounds WITHOUT buffer for overlay positioning
        small_buffer = 0.01  # Small area around city center for overlay
        self.city_polygon_bounds = {
            'north': lat + small_buffer,
            'south': lat - small_buffer, 
            'east': lon + small_buffer,
            'west': lon - small_buffer
        }
        
        print(f"📍 Using coordinate bounds with buffer: {bounds}")
        print(f"📍 City coordinate bounds (for overlay): {self.city_polygon_bounds}")
        return bounds

    def _process_item(self, item, item_index, total_items):
        """Process single item with improved asset mapping and metadata preservation"""
        try:
            print(f"   📡 Processing item {item_index + 1}/{total_items}: {item.id}")
            
            # Check available assets
            available_assets = list(item.assets.keys())
            print(f"     Available assets: {available_assets[:10]}...")
            
            # Enhanced asset mapping with more fallbacks
            asset_mapping = {
                'red': ['B04', 'red', 'B4', 'RED'],
                'green': ['B03', 'green', 'B3', 'GREEN'], 
                'blue': ['B02', 'blue', 'B2', 'BLUE'],
                'nir': ['B08', 'nir', 'B8', 'NIR']
            }
            
            bands = {}
            
            # Download required bands with enhanced metadata
            for band_name, possible_names in asset_mapping.items():
                found = False
                for asset_name in possible_names:
                    if asset_name in item.assets:
                        print(f"     Found {asset_name} for {band_name}")
                        data = self._download_band_with_metadata(item.assets[asset_name].href, band_name)
                        if data is not None:
                            bands[band_name] = data
                            found = True
                            break
                
                if not found:
                    print(f"     ❌ Missing asset for {band_name}")
            
            # Need all 4 bands for NDVI calculation
            if len(bands) == 4:
                # Ensure all bands have the same shape for processing
                shapes = [b.shape for b in bands.values()]
                min_h = min(s[0] for s in shapes)
                min_w = min(s[1] for s in shapes)
                
                for name in bands:
                    if bands[name].shape != (min_h, min_w):
                        bands[name] = cv2.resize(bands[name], (min_w, min_h), interpolation=cv2.INTER_LINEAR)
                
                print(f"     ✅ Successfully processed {item.id} - Shape: {min_h}x{min_w}")
                return bands
            else:
                print(f"     ❌ Only got {len(bands)}/4 required bands")
                return None
                
        except Exception as e:
            print(f"     ❌ Error processing {item.id}: {e}")
            return None

    def _create_composite(self, all_bands):
        """Create enhanced composite with better handling"""
        if not all_bands:
            return None
        
        print(f"   🌥️ Creating composite from {len(all_bands)} valid images...")
        
        composite = {}
        for band_name in ['red', 'green', 'blue', 'nir']:
            band_stack = [bands[band_name] for bands in all_bands if band_name in bands]
            if band_stack:
                # Use median for better cloud/noise handling
                composite[band_name] = np.median(band_stack, axis=0).astype(np.float32)
                
                # Basic outlier removal
                valid_mask = ~np.isnan(composite[band_name])
                if np.any(valid_mask):
                    # Clip extreme values (likely clouds or errors)
                    p1, p99 = np.percentile(composite[band_name][valid_mask], [1, 99])
                    composite[band_name] = np.clip(composite[band_name], p1, p99)
                
                print(f"     ✅ {band_name} composite: {composite[band_name].shape}, range: {np.nanmin(composite[band_name]):.0f}-{np.nanmax(composite[band_name]):.0f}")
        
        return composite if len(composite) == 4 else None

    def _create_false_color_infrared(self, red, green, blue, nir):
        """Create enhanced false color infrared image (NIR-Red-Green) based on notebooks"""
        try:
            # False color infrared: NIR as Red channel, Red as Green channel, Green as Blue channel
            false_color = np.stack([nir, red, green], axis=-1)
            
            # Handle NaN values
            valid_mask = ~np.isnan(false_color).any(axis=2)
            if not np.any(valid_mask):
                return None
            
            # Enhanced normalization using Sentinel-2 reflectance values
            # Sentinel-2 values are typically 0-10000 for reflectance
            false_color_normalized = np.clip(false_color / 3000.0, 0, 1)  # More conservative scaling
            
            # Apply enhanced contrast stretching per channel
            false_color_enhanced = np.zeros_like(false_color_normalized, dtype=np.float32)
            
            for i in range(3):
                channel_data = false_color_normalized[:, :, i]
                valid_data = channel_data[valid_mask]
                
                if len(valid_data) > 0:
                    # Use wider percentile range for better contrast
                    p2, p98 = np.percentile(valid_data, [2, 98])
                    if p98 > p2:
                        stretched = (channel_data - p2) / (p98 - p2)
                        false_color_enhanced[:, :, i] = np.clip(stretched, 0, 1)
                    else:
                        false_color_enhanced[:, :, i] = channel_data
            
            # Apply gamma correction for better visual appearance
            gamma = 0.8  # Slight gamma correction
            false_color_gamma = np.power(false_color_enhanced, gamma)
            
            # Convert to 8-bit
            false_color_8bit = (false_color_gamma * 255).astype(np.uint8)
            
            return false_color_8bit
            
        except Exception as e:
            print(f"❌ Error creating false color image: {e}")
            return None

    def _detect_vegetation_enhanced(self, red, green, blue, nir):
        """Enhanced vegetation detection with multiple density levels"""
        try:
            eps = 1e-8
            
            # Calculate NDVI with proper handling
            ndvi = (nir - red) / (nir + red + eps)
            
            # Additional vegetation indices for better classification
            # Enhanced Vegetation Index (EVI)
            evi = 2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1 + eps)
            evi = np.clip(evi, -1, 1)
            
            # Green Normalized Difference Vegetation Index (GNDVI)
            gndvi = (nir - green) / (nir + green + eps)
            gndvi = np.clip(gndvi, -1, 1)
            
            # Combine indices for more robust vegetation detection
            # Use NDVI as primary, EVI and GNDVI as confirmation
            combined_vegetation_score = (ndvi + evi + gndvi) / 3
            
            # Define vegetation density levels with more sophisticated thresholds
            high_density_mask = (ndvi > 0.7) & (evi > 0.5) & (combined_vegetation_score > 0.6)
            medium_density_mask = (ndvi >= 0.5) & (ndvi <= 0.7) & (evi > 0.3) & (~high_density_mask)
            low_density_mask = (ndvi >= self.ndvi_threshold) & (ndvi < 0.5) & (~high_density_mask) & (~medium_density_mask)
            
            # Calculate comprehensive statistics
            total_pixels = ndvi.size
            high_pixels = np.sum(high_density_mask)
            medium_pixels = np.sum(medium_density_mask)
            low_pixels = np.sum(low_density_mask)
            vegetation_pixels = high_pixels + medium_pixels + low_pixels
            
            vegetation_percentage = (vegetation_pixels / total_pixels) * 100
            high_percentage = (high_pixels / total_pixels) * 100
            medium_percentage = (medium_pixels / total_pixels) * 100
            low_percentage = (low_pixels / total_pixels) * 100
            
            print(f"    Enhanced vegetation analysis:")
            print(f"      NDVI range: {np.nanmin(ndvi):.3f} to {np.nanmax(ndvi):.3f}")
            print(f"      EVI range: {np.nanmin(evi):.3f} to {np.nanmax(evi):.3f}")
            print(f"      Total vegetation: {vegetation_pixels} pixels ({vegetation_percentage:.1f}%)")
            print(f"      🟢 High density: {high_pixels} pixels ({high_percentage:.1f}%)")
            print(f"      🟡 Medium density: {medium_pixels} pixels ({medium_percentage:.1f}%)")
            print(f"      🟣 Low density: {low_pixels} pixels ({low_percentage:.1f}%)")
            
            return {
                'ndvi': ndvi,
                'evi': evi,
                'gndvi': gndvi,
                'high_density_mask': high_density_mask,
                'medium_density_mask': medium_density_mask,
                'low_density_mask': low_density_mask,
                'vegetation_percentage': vegetation_percentage,
                'high_percentage': high_percentage,
                'medium_percentage': medium_percentage,
                'low_percentage': low_percentage,
                'total_pixels': total_pixels,
                'vegetation_pixels': vegetation_pixels
            }
            
        except Exception as e:
            print(f"❌ Error in vegetation detection: {e}")
            return None

    def _apply_vegetation_highlighting(self, false_color_image, vegetation_data):
        """Apply enhanced vegetation highlighting with proper alpha blending"""
        try:
            highlighted_image = false_color_image.copy()
            
            # Get vegetation masks
            high_mask = vegetation_data['high_density_mask']
            medium_mask = vegetation_data['medium_density_mask']
            low_mask = vegetation_data['low_density_mask']
            
            # Apply color coding with different intensities and alpha blending
            if np.any(high_mask):
                # Bright green for high density
                overlay = np.zeros_like(highlighted_image)
                overlay[high_mask] = [0, 255, 0]  # Bright green
                highlighted_image[high_mask] = cv2.addWeighted(
                    highlighted_image[high_mask], 
                    1 - self.highlight_alpha,
                    overlay[high_mask],
                    self.highlight_alpha, 
                    0
                )
            
            if np.any(medium_mask):
                # Yellow for medium density
                overlay = np.zeros_like(highlighted_image)
                overlay[medium_mask] = [255, 255, 0]  # Yellow
                highlighted_image[medium_mask] = cv2.addWeighted(
                    highlighted_image[medium_mask], 
                    1 - (self.highlight_alpha * 0.8),  # Slightly less alpha
                    overlay[medium_mask],
                    self.highlight_alpha * 0.8, 
                    0
                )
            
            if np.any(low_mask):
                # Light green for low density
                overlay = np.zeros_like(highlighted_image)
                overlay[low_mask] = [128, 255, 128]  # Light green
                highlighted_image[low_mask] = cv2.addWeighted(
                    highlighted_image[low_mask], 
                    1 - (self.highlight_alpha * 0.6),  # Even less alpha
                    overlay[low_mask],
                    self.highlight_alpha * 0.6, 
                    0
                )
            
            return highlighted_image
            
        except Exception as e:
            print(f"❌ Error applying vegetation highlighting: {e}")
            return false_color_image

    def _create_ndvi_visualization(self, ndvi):
        """Create enhanced NDVI visualization using colormap"""
        try:
            # Normalize NDVI to 0-255 range
            ndvi_normalized = np.clip((ndvi + 1) / 2, 0, 1)  # Convert from [-1,1] to [0,1]
            ndvi_8bit = (ndvi_normalized * 255).astype(np.uint8)
            
            # Apply enhanced colormap (VIRIDIS is good for NDVI)
            ndvi_colored = cv2.applyColorMap(ndvi_8bit, cv2.COLORMAP_VIRIDIS)
            
            return ndvi_colored
            
        except Exception as e:
            print(f"❌ Error creating NDVI visualization: {e}")
            return None

    def _create_vegetation_visualization(self, bands):
        """Create comprehensive vegetation visualization with enhanced methods"""
        try:
            red, green, blue, nir = bands['red'], bands['green'], bands['blue'], bands['nir']
            
            print(f"   🎨 Creating enhanced vegetation visualization...")
            
            # Create false color infrared image
            false_color_image = self._create_false_color_infrared(red, green, blue, nir)
            if false_color_image is None:
                print(f"   ❌ Failed to create false color image")
                return None
            
            # Enhanced vegetation detection
            vegetation_data = self._detect_vegetation_enhanced(red, green, blue, nir)
            if vegetation_data is None:
                print(f"   ❌ Failed to detect vegetation")
                return None
            
            # Apply vegetation highlighting
            highlighted_image = self._apply_vegetation_highlighting(false_color_image, vegetation_data)
            
            # Create NDVI visualization
            ndvi_visualization = self._create_ndvi_visualization(vegetation_data['ndvi'])
            
            print(f"   ✅ Vegetation visualization completed successfully")
            
            return {
                'vegetation_highlighted': highlighted_image,
                'ndvi_visualization': ndvi_visualization,
                'false_color_base': false_color_image,
                'ndvi_array': vegetation_data['ndvi'],
                'vegetation_percentage': vegetation_data['vegetation_percentage'],
                'high_density_percentage': vegetation_data['high_percentage'],
                'medium_density_percentage': vegetation_data['medium_percentage'],
                'low_density_percentage': vegetation_data['low_percentage'],
                'total_pixels': vegetation_data['total_pixels'],
                'vegetation_pixels': vegetation_data['vegetation_pixels']
            }
            
        except Exception as e:
            print(f"❌ Error creating vegetation visualization: {e}")
            return None

    def _save_results_with_georeference(self, result):
        """Save results with proper georeferencing for accurate map overlay"""
        saved_files = []
        
        try:
            # Save vegetation highlighted image
            veg_path = self.vegetation_dir / 'vegetation_highlighted.png'
            success = cv2.imwrite(str(veg_path), result['vegetation_highlighted'][..., ::-1])  # RGB to BGR
            if success:
                saved_files.append(str(veg_path.relative_to(self.output_dir.parent)))
                print(f"✅ Saved vegetation highlighted: {veg_path}")
            
            # Save NDVI visualization
            if result['ndvi_visualization'] is not None:
                ndvi_path = self.vegetation_dir / 'ndvi_visualization.png'
                success = cv2.imwrite(str(ndvi_path), result['ndvi_visualization'])
                if success:
                    saved_files.append(str(ndvi_path.relative_to(self.output_dir.parent)))
                    print(f"✅ Saved NDVI visualization: {ndvi_path}")
            
            # Save false color base image for reference
            if result['false_color_base'] is not None:
                false_color_path = self.vegetation_dir / 'false_color_base.png'
                success = cv2.imwrite(str(false_color_path), result['false_color_base'][..., ::-1])  # RGB to BGR
                if success:
                    saved_files.append(str(false_color_path.relative_to(self.output_dir.parent)))
                    print(f"✅ Saved false color base: {false_color_path}")
            
            # Save NDVI as GeoTIFF if we have geospatial info
            if self.geographic_bounds and result['ndvi_array'] is not None:
                try:
                    ndvi_geotiff_path = self.vegetation_dir / 'ndvi_data.tif'
                    
                    # Calculate transform for the processed image
                    bounds = self.geographic_bounds
                    height, width = result['ndvi_array'].shape
                    
                    transform = from_bounds(
                        bounds['west'], bounds['south'], 
                        bounds['east'], bounds['north'], 
                        width, height
                    )
                    
                    # Save as GeoTIFF
                    with rasterio.open(
                        ndvi_geotiff_path, 'w',
                        driver='GTiff',
                        height=height, width=width,
                        count=1, dtype=np.float32,
                        crs=CRS.from_epsg(4326),  # WGS84
                        transform=transform,
                        compress='lzw'
                    ) as dst:
                        dst.write(result['ndvi_array'].astype(np.float32), 1)
                        dst.set_band_description(1, 'NDVI')
                    
                    print(f"✅ Saved NDVI GeoTIFF: {ndvi_geotiff_path}")
                    
                except Exception as e:
                    print(f"⚠️ Could not save GeoTIFF: {e}")
                
        except Exception as e:
            print(f"❌ Error saving results: {e}")
        
        return saved_files

    def process(self):
        """Enhanced main processing pipeline"""
        start_time = time.time()
        
        print_progress(5, "Getting city bounds...")
        
        # Get city bounds with improved accuracy
        bounds = self._get_city_bounds()
        
        print_progress(10, "Querying satellite data...")
        
        # Format date range
        start_date = datetime(self.start_year, int(self.start_month), 1)
        if int(self.end_month) == 12:
            end_date = datetime(self.end_year + 1, 1, 1)
        else:
            end_date = datetime(self.end_year, int(self.end_month) + 1, 1)
        
        # Query STAC API with expanded search
        bbox = [bounds['min_lon'], bounds['min_lat'], bounds['max_lon'], bounds['max_lat']]
        
        print(f"🔍 Querying Sentinel-2 data...")
        print(f"  📅 Date range: {start_date.date()} to {end_date.date()}")
        print(f"  📦 Bbox: {bbox}")
        print(f"  ☁️ Cloud cover: < {self.cloud_threshold}%")
        
        search = self.stac_client.search(
            collections=["sentinel-2-l2a"],
            datetime=f"{start_date.isoformat()}/{end_date.isoformat()}",
            bbox=bbox,
            query={"eo:cloud_cover": {"lt": self.cloud_threshold}},
            limit=15  # Increased limit for better composite
        )
        
        items = list(search.items())
        print(f"📡 Found {len(items)} satellite images")
        
        if not items:
            print("❌ No satellite images found for the specified criteria")
            return self._create_empty_result()
        
        print_progress(20, f"Processing {len(items)} satellite images...")
        
        # Process items with improved handling
        valid_results = []
        max_items_to_process = min(8, len(items))  # Process more items for better composite
        
        for i, item in enumerate(items[:max_items_to_process]):
            progress = 20 + int((i / max_items_to_process) * 50)
            print_progress(progress, f"Processing image {i+1}/{max_items_to_process}")
            
            result = self._process_item(item, i, max_items_to_process)
            if result is not None:
                valid_results.append(result)
        
        print(f"✅ Successfully processed {len(valid_results)}/{max_items_to_process} images")
        
        if not valid_results:
            print("❌ No valid satellite images could be processed")
            return self._create_empty_result()
        
        print_progress(70, "Creating enhanced composite...")
        
        # Create enhanced composite
        composite = self._create_composite(valid_results)
        if not composite:
            print("❌ Failed to create composite image")
            return self._create_empty_result()
        
        print_progress(80, "Generating enhanced vegetation analysis...")
        
        # Create enhanced vegetation visualization
        result = self._create_vegetation_visualization(composite)
        if not result:
            print("❌ Failed to create vegetation visualization")
            return self._create_empty_result()
        
        print_progress(90, "Saving results with geospatial accuracy...")
        
        # Save results with georeferencing
        saved_files = self._save_results_with_georeference(result)
        
        # Create comprehensive summary with geographic bounds
        # CRITICAL FIX: Use actual satellite image bounds for overlay positioning instead of city bounds
        # Convert UTM coordinates to WGS84 for frontend compatibility
        if self.geographic_bounds and 'crs' in self.geographic_bounds:
            try:
                # Convert UTM bounds to WGS84 for frontend use
                from pyproj import Transformer
                
                # Create transformer from satellite CRS to WGS84
                source_crs = self.geographic_bounds['crs']
                transformer = Transformer.from_crs(source_crs, 'EPSG:4326', always_xy=True)
                
                # Convert corner coordinates
                west_wgs84, south_wgs84 = transformer.transform(
                    self.geographic_bounds['west'], self.geographic_bounds['south']
                )
                east_wgs84, north_wgs84 = transformer.transform(
                    self.geographic_bounds['east'], self.geographic_bounds['north']
                )
                
                # RAW satellite bounds (entire UTM tile)
                raw_satellite_bounds = {
                    'north': north_wgs84,
                    'south': south_wgs84,
                    'east': east_wgs84,
                    'west': west_wgs84
                }
                
                # INTERSECTION FIX: Crop satellite bounds to city polygon area
                if self.city_polygon_bounds:
                    # Use intersection of satellite bounds and city bounds
                    cropped_bounds = {
                        'north': min(north_wgs84, self.city_polygon_bounds['north'] + 0.02),  # Small buffer
                        'south': max(south_wgs84, self.city_polygon_bounds['south'] - 0.02),
                        'east': min(east_wgs84, self.city_polygon_bounds['east'] + 0.02),
                        'west': max(west_wgs84, self.city_polygon_bounds['west'] - 0.02)
                    }
                    
                    # Ensure valid intersection
                    if (cropped_bounds['north'] > cropped_bounds['south'] and 
                        cropped_bounds['east'] > cropped_bounds['west']):
                        
                        overlay_bounds = cropped_bounds
                        print(f"   🎯 CROPPED SATELLITE BOUNDS to city area:")
                        print(f"   Original: N={north_wgs84:.6f}, S={south_wgs84:.6f}")
                        print(f"   Cropped:  N={cropped_bounds['north']:.6f}, S={cropped_bounds['south']:.6f}")
                        
                        # Calculate area reduction
                        orig_area = (north_wgs84 - south_wgs84) * (east_wgs84 - west_wgs84) * 111 * 111
                        crop_area = ((cropped_bounds['north'] - cropped_bounds['south']) * 
                                   (cropped_bounds['east'] - cropped_bounds['west']) * 111 * 111)
                        reduction = ((orig_area - crop_area) / orig_area) * 100
                        print(f"   Area reduced by {reduction:.1f}% ({orig_area:.0f} -> {crop_area:.0f} km²)")
                        
                    else:
                        overlay_bounds = raw_satellite_bounds
                        print(f"   ⚠️ Invalid intersection, using raw satellite bounds")
                else:
                    overlay_bounds = raw_satellite_bounds
                    print(f"   ⚠️ No city bounds for cropping, using raw satellite bounds")
                
                center_lat = (overlay_bounds['north'] + overlay_bounds['south']) / 2
                center_lon = (overlay_bounds['east'] + overlay_bounds['west']) / 2
                
                print(f"   📍 COORDINATE CONVERSION: {source_crs} -> WGS84")
                print(f"   UTM bounds: N={self.geographic_bounds['north']}, S={self.geographic_bounds['south']}")
                print(f"   WGS84 bounds: N={north_wgs84:.6f}, S={south_wgs84:.6f}")
                
                # Update for summary - use cropped bounds
                wgs84_bounds = overlay_bounds.copy()
                wgs84_bounds['crs'] = 'EPSG:4326'
                
            except Exception as e:
                print(f"   ⚠️ Coordinate conversion failed: {e}")
                # Fallback to city bounds
                overlay_bounds = self.city_polygon_bounds if self.city_polygon_bounds else {
                    'north': bounds['max_lat'],
                    'south': bounds['min_lat'],
                    'east': bounds['max_lon'],
                    'west': bounds['min_lon']
                }
                center_lat = (overlay_bounds['north'] + overlay_bounds['south']) / 2
                center_lon = (overlay_bounds['east'] + overlay_bounds['west']) / 2
                wgs84_bounds = overlay_bounds
        else:
            # Fallback to city bounds if no satellite bounds available
            overlay_bounds = self.city_polygon_bounds if self.city_polygon_bounds else {
                'north': bounds['max_lat'],
                'south': bounds['min_lat'],
                'east': bounds['max_lon'],
                'west': bounds['min_lon']
            }
            center_lat = (overlay_bounds['north'] + overlay_bounds['south']) / 2
            center_lon = (overlay_bounds['east'] + overlay_bounds['west']) / 2
            wgs84_bounds = overlay_bounds

        summary = {
            'vegetation_percentage': result['vegetation_percentage'],
            'high_density_percentage': result['high_density_percentage'],
            'medium_density_percentage': result['medium_density_percentage'],
            'low_density_percentage': result['low_density_percentage'],
            'total_pixels': int(result['total_pixels']),
            'vegetation_pixels': int(result['vegetation_pixels']),
            'images_processed': len(valid_results),
            'images_found': len(items),
            'ndvi_threshold': self.ndvi_threshold,
            'geographic_bounds': wgs84_bounds if 'wgs84_bounds' in locals() else overlay_bounds,  # FIXED: Use converted WGS84 bounds
            'city_info': {
                'name': f"{self.city_data['city']}, {self.city_data['country']}",
                'center_lat': center_lat,
                'center_lon': center_lon
            },
            'processing_config': {
                'ndvi_threshold': self.ndvi_threshold,
                'cloud_threshold': self.cloud_threshold,
                'highlight_alpha': self.highlight_alpha,
                'date_range': f"{start_date.date()} to {end_date.date()}"
            },
            'output_files': saved_files
        }
        
        # Save enhanced summary
        summary_path = self.vegetation_dir / 'vegetation_analysis_summary.json'
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        elapsed = time.time() - start_time
        
        print_progress(100, "Enhanced processing completed!")
        
        print(f"✅ Enhanced processing completed successfully!")
        print(f"🌱 Total vegetation coverage: {result['vegetation_percentage']:.1f}%")
        print(f"🟢 High density (>0.7 NDVI): {result['high_density_percentage']:.1f}%")
        print(f"🟡 Medium density (0.5-0.7): {result['medium_density_percentage']:.1f}%") 
        print(f"🟣 Low density ({self.ndvi_threshold}-0.5): {result['low_density_percentage']:.1f}%")
        print(f"📊 Processed {len(valid_results)} of {len(items)} available images")
        print(f"⚡ Completed in {elapsed:.1f} seconds")
        
        # Debug coordinate alignment - FIXED to use WGS84 coordinates
        print(f"\n📍 COORDINATE DEBUG:")
        if self.city_polygon_bounds:
            city_center_lat = (self.city_polygon_bounds['north'] + self.city_polygon_bounds['south']) / 2
            city_center_lon = (self.city_polygon_bounds['east'] + self.city_polygon_bounds['west']) / 2
            print(f"   City polygon center: {city_center_lat:.6f}, {city_center_lon:.6f}")
        
        # Use converted WGS84 bounds instead of UTM bounds for accurate distance calculation
        if 'wgs84_bounds' in locals():
            sat_center_lat = (wgs84_bounds['north'] + wgs84_bounds['south']) / 2
            sat_center_lon = (wgs84_bounds['east'] + wgs84_bounds['west']) / 2
            print(f"   Satellite image center (WGS84): {sat_center_lat:.6f}, {sat_center_lon:.6f}")
            
            if self.city_polygon_bounds:
                lat_diff = abs(city_center_lat - sat_center_lat)
                lon_diff = abs(city_center_lon - sat_center_lon) 
                distance_km = ((lat_diff**2 + lon_diff**2)**0.5) * 111
                print(f"   Distance between centers: {distance_km:.1f} km")
                print(f"   Using satellite bounds for overlay positioning (ALIGNMENT FIX)")
                
                if distance_km < 20:
                    print(f"   ✅ EXCELLENT ALIGNMENT: {distance_km:.1f} km offset")
                elif distance_km < 50:
                    print(f"   ⚠️ MODERATE ALIGNMENT: {distance_km:.1f} km offset")
                else:
                    print(f"   ❌ POOR ALIGNMENT: {distance_km:.1f} km offset")
        else:
            print(f"   ⚠️ No satellite bounds captured - using city bounds fallback")
        
        return summary

    def _create_empty_result(self):
        """Create empty result when processing fails"""
        return {
            'vegetation_percentage': 0.0,
            'high_density_percentage': 0.0,
            'medium_density_percentage': 0.0,
            'low_density_percentage': 0.0,
            'total_pixels': 0,
            'vegetation_pixels': 0,
            'images_processed': 0,
            'images_found': 0,
            'ndvi_threshold': self.ndvi_threshold,
            'output_files': []
        }

def main():
    if len(sys.argv) != 2:
        print("Usage: python satellite_processor_optimized.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        print("="*60)
        print("ENHANCED SATELLITE PROCESSING")
        print("="*60)
        
        processor = OptimizedSatelliteProcessor(config)
        result = processor.process()
        
        print("🎉 Enhanced satellite processing completed successfully!")
        
    except Exception as e:
        print(f"❌ Error in satellite processing: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main() 