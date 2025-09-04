#!/usr/bin/env python3
"""
Satellite Image Preprocessing for Greenspace Web App
Simplified version focused on cloud removal and compositing
"""

import os
import sys
import json
import gc
import numpy as np
import rasterio
from pathlib import Path
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing as mp
from typing import List, Dict, Tuple, Optional
import time
import cv2
warnings.filterwarnings('ignore')

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

# Essential bands only for web app
ESSENTIAL_BANDS = ['blue', 'green', 'red', 'nir', 'swir16']
SCL_INVALID = [0, 1, 8, 9, 10, 11]

def read_raster(file_path: Path) -> Optional[np.ndarray]:
    """Read raster with optimizations"""
    try:
        with rasterio.open(file_path) as src:
            data = src.read(1)
            
            # Convert to float32 efficiently
            if data.dtype != np.float32:
                data = data.astype(np.float32)
            
            # Handle nodata efficiently
            if src.nodata is not None:
                data[data == src.nodata] = np.nan
            
            return data
    except Exception:
        return None

def detect_clouds(scl_data: np.ndarray) -> Tuple[np.ndarray, float]:
    """Basic cloud detection using SCL"""
    try:
        cloud_mask = np.isin(scl_data, SCL_INVALID)
        quality_score = np.sum(~cloud_mask) / cloud_mask.size
        return cloud_mask, quality_score
    except Exception:
        return np.zeros_like(scl_data, dtype=bool), 0.0

def compute_ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Compute NDVI"""
    eps = 1e-8
    ndvi = (nir - red) / (nir + red + eps)
    return np.clip(ndvi, -1, 1)

def gap_fill_simple(data: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Simple gap filling using nearby pixels"""
    if not np.any(mask):
        return data
    
    try:
        result = data.copy()
        kernel = np.ones((3, 3), dtype=np.float32) / 9
        filled = cv2.filter2D(data, -1, kernel)
        result[mask] = filled[mask]
        return result
    except Exception:
        return data

class SatelliteProcessor:
    def __init__(self, config):
        self.config = config
        self.input_dir = Path(config['outputDir']) / "satellite_data"
        self.output_dir = self.input_dir / "processed"
        self.cloud_free_dir = self.output_dir / "monthly_cloud_free"
        self.median_dir = self.output_dir / "monthly_median"
        
        # Create output directories
        self.cloud_free_dir.mkdir(parents=True, exist_ok=True)
        self.median_dir.mkdir(parents=True, exist_ok=True)
    
    def discover_data(self) -> Dict[str, Dict]:
        """Discover satellite data"""
        print("🔍 Discovering satellite data...")
        print_progress(5, "Scanning for satellite images...")
        
        monthly_data = {}
        
        # Focus on Sentinel-2 for web app - check the actual download structure
        base_path = self.input_dir / "raw" / "images" / "sentinel-2-l2a"
        if not base_path.exists():
            print(f"Base path does not exist: {base_path}")
            return monthly_data
        
        print(f"Scanning directory: {base_path}")
        
        try:
            with os.scandir(base_path) as entries:
                for entry in entries:
                    if not entry.is_dir():
                        continue
                    
                    # Parse Sentinel-2 item names (e.g., S2B_17TPJ_20200730_0_L2A)
                    name_parts = entry.name.split('_')
                    try:
                        if len(name_parts) >= 3 and name_parts[0].startswith('S2'):
                            # Extract date from item name (YYYYMMDD format)
                            date_str = name_parts[2]  # Should be like "20200730"
                            if len(date_str) >= 8 and date_str[:8].isdigit():
                                year_month = f"{date_str[:4]}_{date_str[4:6]}"
                                
                                if year_month not in monthly_data:
                                    monthly_data[year_month] = {'s2_items': []}
                                
                                monthly_data[year_month]['s2_items'].append(Path(entry.path))
                                print(f"   Found item: {entry.name} -> {year_month}")
                            else:
                                print(f"   Invalid date format in: {entry.name}")
                        else:
                            print(f"   Skipping non-S2 item: {entry.name}")
                    except (IndexError, ValueError) as e:
                        print(f"   Error parsing item name {entry.name}: {e}")
                        continue
        except OSError as e:
            print(f"Error scanning directory: {e}")
            return monthly_data
        
        total_items = sum(len(data['s2_items']) for data in monthly_data.values())
        print(f"   📊 Found {total_items} Sentinel-2 items, {len(monthly_data)} months")
        return monthly_data
    
    def load_s2_item(self, item_dir: Path) -> Tuple[str, Optional[Dict]]:
        """Load S2 item with essential bands only"""
        try:
            bands = {}
            
            # Efficient file discovery - match actual downloaded filenames
            band_files = {}
            
            # Map the actual downloaded filenames to band names
            file_mapping = {
                'blue.tif': 'blue',
                'green.tif': 'green', 
                'red.tif': 'red',
                'nir.tif': 'nir',
                'scl.tif': 'scl'
            }
            
            try:
                with os.scandir(item_dir) as entries:
                    for entry in entries:
                        if entry.name in file_mapping:
                            band_name = file_mapping[entry.name]
                            band_files[band_name] = Path(entry.path)
                            print(f"     Found band: {entry.name} -> {band_name}")
            except OSError:
                print(f"   Error reading directory: {item_dir}")
                return item_dir.name, None
            
            # Load essential bands
            reference_shape = None
            for band_name in ['blue', 'green', 'red', 'nir']:  # Essential bands
                if band_name in band_files:
                    data = read_raster(band_files[band_name])
                    if data is not None:
                        if reference_shape is None:
                            reference_shape = data.shape
                        elif data.shape != reference_shape:
                            data = cv2.resize(data, (reference_shape[1], reference_shape[0]), 
                                            interpolation=cv2.INTER_NEAREST)
                        bands[band_name] = data
                        print(f"     Loaded {band_name}: {data.shape}")
                    else:
                        print(f"     Failed to read {band_name}")
            
            if len(bands) < 3:
                print(f"   Insufficient bands ({len(bands)}) for processing")
                return item_dir.name, None
            
            # Add NDVI if we have red and NIR
            if 'red' in bands and 'nir' in bands:
                bands['NDVI'] = compute_ndvi(bands['red'], bands['nir'])
                print(f"     Computed NDVI")
            
            # Cloud detection
            cloud_mask = None
            cloud_cover_percent = 0
            
            if 'scl' in band_files:
                scl_data = read_raster(band_files['scl'])
                if scl_data is not None:
                    if scl_data.shape != reference_shape:
                        scl_data = cv2.resize(scl_data, (reference_shape[1], reference_shape[0]), 
                                            interpolation=cv2.INTER_NEAREST)
                    
                    cloud_mask = np.isin(scl_data, SCL_INVALID)
                    cloud_cover_percent = (np.sum(cloud_mask) / cloud_mask.size) * 100
                    print(f"   Cloud cover: {cloud_cover_percent:.1f}%")
                else:
                    print("   Failed to read SCL data")
            else:
                print("   No SCL data available")
            
            return item_dir.name, {
                'bands': bands,
                'cloud_mask': cloud_mask,
                'cloud_cover_percent': cloud_cover_percent,
                'valid_pixels': np.sum(~np.isnan(bands['red'])) if 'red' in bands else 0
            }
            
        except Exception as e:
            print(f"   Error loading S2 item {item_dir}: {e}")
            return item_dir.name, None
    
    def create_cloud_free_composite(self, s2_items: List[Tuple]) -> Optional[Dict]:
        """Create cloud-free composite"""
        valid_items = [(item_id, data) for item_id, data in s2_items if data is not None]
        
        if not valid_items:
            return None
        
        # Select best quality image (least clouds)
        reference_item = min(valid_items, 
                           key=lambda x: x[1].get('cloud_cover_percent', 100))
        
        ref_id, ref_data = reference_item
        ref_bands = ref_data['bands'].copy()
        
        # Apply cloud mask
        if ref_data.get('cloud_mask') is not None:
            cloud_mask = ref_data['cloud_mask']
            for band_name in ref_bands:
                ref_bands[band_name] = np.where(cloud_mask, np.nan, ref_bands[band_name])
        
        composite_bands = {}
        
        for band_name, ref_band in ref_bands.items():
            result = ref_band.copy()
            
            # Simple gap filling
            missing_mask = np.isnan(result)
            if np.any(missing_mask):
                # Try to fill from other images
                for item_id, data in valid_items:
                    if (item_id != ref_id and 'bands' in data and 
                        band_name in data['bands'] and
                        data['bands'][band_name].shape == result.shape):
                        
                        fill_data = data['bands'][band_name].copy()
                        
                        # Apply cloud mask to fill data
                        if data.get('cloud_mask') is not None:
                            fill_data = np.where(data['cloud_mask'], np.nan, fill_data)
                        
                        # Fill missing pixels
                        fill_mask = missing_mask & ~np.isnan(fill_data)
                        result[fill_mask] = fill_data[fill_mask]
                        missing_mask = np.isnan(result)
                        
                        if not np.any(missing_mask):
                            break
                
                # Apply simple gap filling for remaining missing pixels
                if np.any(missing_mask):
                    result = gap_fill_simple(result, missing_mask)
            
            composite_bands[band_name] = result
        
        if len(composite_bands) >= 3:
            return {
                'bands': composite_bands,
                'metadata': {
                    'reference_image': ref_id,
                    'num_source_images': len(valid_items),
                    'processing_method': 'cloud_free'
                }
            }
        
        return None
    
    def create_median_composite(self, s2_items: List[Tuple]) -> Optional[Dict]:
        """Create median composite"""
        valid_s2 = [(item_id, data) for item_id, data in s2_items if data is not None]
        
        if not valid_s2:
            return None
        
        # Get reference shape
        reference_shape = None
        for _, data in valid_s2:
            if 'bands' in data and data['bands']:
                reference_shape = next(iter(data['bands'].values())).shape
                break
        
        if not reference_shape:
            return None
        
        all_bands = {}
        target_bands = ESSENTIAL_BANDS + ['NDVI']
        
        for band_name in target_bands:
            band_stack = []
            
            for _, data in valid_s2:
                if ('bands' in data and band_name in data['bands']):
                    band_data = data['bands'][band_name]
                    
                    # Apply cloud mask
                    if data.get('cloud_mask') is not None:
                        band_data = np.where(data['cloud_mask'], np.nan, band_data)
                    
                    if (band_data.shape == reference_shape and np.any(~np.isnan(band_data))):
                        band_stack.append(band_data)
            
            if len(band_stack) >= 1:
                if len(band_stack) == 1:
                    result = band_stack[0].astype(np.float32)
                else:
                    # Ensure all arrays have the same shape
                    ref_shape = band_stack[0].shape
                    aligned_stack = []
                    for band_data in band_stack:
                        if band_data.shape == ref_shape:
                            aligned_stack.append(band_data)
                        else:
                            resized = cv2.resize(band_data, (ref_shape[1], ref_shape[0]), 
                                               interpolation=cv2.INTER_LINEAR)
                            aligned_stack.append(resized)
                    
                    if len(aligned_stack) >= 1:
                        result = np.nanmedian(aligned_stack, axis=0).astype(np.float32)
                    else:
                        continue
                
                all_bands[band_name] = result
        
        if len(all_bands) >= 3:
            return {
                'bands': all_bands,
                'metadata': {
                    'num_s2_images': len([x for x in s2_items if x[1] is not None]),
                    'processing_method': 'median'
                }
            }
        
        return None
    
    def save_composite(self, data: Dict, output_path: Path) -> bool:
        """Save composite"""
        try:
            bands = data['bands']
            band_names = sorted(bands.keys())
            first_band = list(bands.values())[0]
            height, width = first_band.shape
            
            profile = {
                'driver': 'GTiff',
                'count': len(band_names),
                'height': height,
                'width': width,
                'dtype': 'float32',
                'compress': 'lzw',
                'tiled': True
            }
            
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with rasterio.open(output_path, 'w', **profile) as dst:
                for i, band_name in enumerate(band_names, 1):
                    band_data = bands[band_name]
                    dst.write(band_data.astype(np.float32), i)
                    dst.set_band_description(i, band_name)
                
                # Add metadata
                dst.update_tags(**data['metadata'])
            
            return True
            
        except Exception as e:
            print(f"Error saving composite: {e}")
            return False
    
    def process(self):
        """Main processing pipeline"""
        print(f"🚀 Satellite Preprocessor")
        print_progress(10, "Starting preprocessing...")
        
        monthly_data = self.discover_data()
        
        if not monthly_data:
            print("❌ No data found")
            return
        
        processed_count = 0
        total_months = len(monthly_data)
        
        for month_idx, year_month in enumerate(sorted(monthly_data.keys()), 1):
            progress = 10 + int((month_idx / total_months) * 80)
            print_progress(progress, f"Processing {year_month} ({month_idx}/{total_months})")
            
            print(f"📅 {month_idx}/{total_months}: {year_month}", end=' ')
            
            cloud_free_path = self.cloud_free_dir / f"{year_month}_cloud_free.tif"
            median_path = self.median_dir / f"{year_month}_median.tif"
            
            if cloud_free_path.exists() and median_path.exists():
                print("(both exist)")
                continue
            
            month_data = monthly_data[year_month]
            s2_count = len(month_data['s2_items'])
            
            if s2_count == 0:
                print("(no S2)")
                continue
            
            # Load S2 data
            max_s2_items = min(s2_count, 5)  # Limit for web app performance
            
            with ThreadPoolExecutor(max_workers=4) as executor:
                s2_futures = [executor.submit(self.load_s2_item, item_dir) 
                             for item_dir in month_data['s2_items'][:max_s2_items]]
                s2_items = [f.result() for f in s2_futures]
            
            valid_s2 = sum(1 for _, data in s2_items if data is not None)
            if valid_s2 == 0:
                print("(no valid S2)")
                continue
            
            # Create and save composites
            success_count = 0
            
            if not cloud_free_path.exists():
                cf_composite = self.create_cloud_free_composite(s2_items)
                if cf_composite and self.save_composite(cf_composite, cloud_free_path):
                    success_count += 1
            else:
                success_count += 1
            
            if not median_path.exists():
                med_composite = self.create_median_composite(s2_items)
                if med_composite and self.save_composite(med_composite, median_path):
                    success_count += 1
            else:
                success_count += 1
            
            print(f"({success_count}/2 saved)")
            processed_count += 1
            
            # Memory cleanup
            del s2_items
            if processed_count % 3 == 0:
                gc.collect()
        
        print_progress(95, "Finalizing preprocessing...")
        
        print(f"\n🎉 Preprocessing complete!")
        print(f"   📊 Processed: {processed_count} months")
        print(f"   📁 Cloud-free composites: {self.cloud_free_dir}")
        print(f"   📁 Median composites: {self.median_dir}")
        
        print_progress(100, "Preprocessing completed successfully!")

def main():
    """Main execution function"""
    if len(sys.argv) != 2:
        print("Usage: python preprocess_satellite_images.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        print(f"🚀 Satellite Preprocessor")
        print(f"📍 Processing images for: {config['city']['city']}")
        
        processor = SatelliteProcessor(config)
        processor.process()
        
        print("✅ Preprocessing completed successfully!")
        
    except Exception as e:
        print(f"❌ Error in preprocessing: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main() 