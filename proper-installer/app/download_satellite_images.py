#!/usr/bin/env python3
"""
Satellite Image Downloader for Greenspace Web App
Adapted from the original Jupyter notebook
"""

import os
import sys
import json
import requests
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from shapely.geometry import Polygon
from pystac_client import Client
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import warnings
warnings.filterwarnings('ignore')

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

class SatelliteDownloader:
    def __init__(self, config):
        self.config = config
        self.city_data = config['city']
        self.start_month = config.get('startMonth', '01')
        self.start_year = config.get('startYear', 2023)
        self.end_month = config.get('endMonth', '12')
        self.end_year = config.get('endYear', 2023)
        self.cloud_threshold = config.get('cloudCoverageThreshold', 20)
        self.output_dir = config['outputDir']
        
        # Create output directories
        self.raw_dir = os.path.join(self.output_dir, 'satellite_data', 'raw')
        self.processed_dir = os.path.join(self.output_dir, 'satellite_data', 'processed')
        os.makedirs(self.raw_dir, exist_ok=True)
        os.makedirs(self.processed_dir, exist_ok=True)
        
        # Initialize STAC client
        self.stac_client = Client.open("https://earth-search.aws.element84.com/v1")
        
        # Setup session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        print(f"Download configuration:")
        print(f"  City: {self.city_data['city']}, {self.city_data['country']}")
        print(f"  Date range: {self.start_month}/{self.start_year} to {self.end_month}/{self.end_year}")
        print(f"  Cloud threshold: {self.cloud_threshold}%")
        print(f"  Output directory: {self.output_dir}")

    def get_city_bounds_and_polygon(self):
        """Get city bounds and polygon from polygon data with enhanced area calculation"""
        try:
            polygon_data = self.city_data['polygon_geojson']['geometry']
            
            if polygon_data['type'] == 'Polygon':
                coordinates = polygon_data['coordinates'][0]
                # Create shapely polygon for area calculation
                polygon = Polygon(coordinates)
                
                # Get bounds
                lons = [coord[0] for coord in coordinates]
                lats = [coord[1] for coord in coordinates]
                
                bounds = {
                    'min_lat': min(lats), 
                    'max_lat': max(lats),
                    'min_lon': min(lons), 
                    'max_lon': max(lons)
                }
                
                # Calculate area in square kilometers
                # Use a simple approximation for small areas
                area_deg_sq = polygon.area
                # Convert to approximate km² (rough approximation)
                lat_center = (bounds['min_lat'] + bounds['max_lat']) / 2
                km_per_deg_lat = 111.0
                km_per_deg_lon = 111.0 * np.cos(np.radians(lat_center))
                area_km_sq = area_deg_sq * km_per_deg_lat * km_per_deg_lon
                
                print(f"City polygon area: ~{area_km_sq:.1f} km²")
                print(f"Bounds: {bounds}")
                
                return bounds, polygon, area_km_sq
                
        except Exception as e:
            print(f"Error processing polygon data: {e}")
            
        # Fallback to a small area around the city center
        print("Using fallback: small area around city center")
        lat = float(self.city_data['latitude'])
        lon = float(self.city_data['longitude'])
        
        # Create a 10km x 10km box around the city center
        offset = 0.05  # approximately 5-6 km depending on latitude
        bounds = {
            'min_lat': lat - offset, 
            'max_lat': lat + offset,
            'min_lon': lon - offset, 
            'max_lon': lon + offset
        }
        
        # Create simple rectangular polygon
        polygon = Polygon([
            [bounds['min_lon'], bounds['min_lat']],
            [bounds['max_lon'], bounds['min_lat']],
            [bounds['max_lon'], bounds['max_lat']],
            [bounds['min_lon'], bounds['max_lat']],
            [bounds['min_lon'], bounds['min_lat']]
        ])
        
        return bounds, polygon, 100.0  # 100 km² fallback area

    def format_date_range(self):
        """Format date range for STAC query"""
        try:
            # Create start date (first day of start month/year)
            start_date = datetime(self.start_year, int(self.start_month), 1)
            
            # Create end date (last day of end month/year)
            if int(self.end_month) == 12:
                end_date = datetime(self.end_year + 1, 1, 1) - timedelta(days=1)
            else:
                end_date = datetime(self.end_year, int(self.end_month) + 1, 1) - timedelta(days=1)
            
            start_str = start_date.strftime('%Y-%m-%d')
            end_str = end_date.strftime('%Y-%m-%d')
            
            print(f"Query date range: {start_str} to {end_str}")
            return f"{start_str}/{end_str}"
            
        except Exception as e:
            print(f"Error formatting date range: {e}")
            return "2023-01-01/2023-12-31"  # Fallback

    def query_sentinel_data(self, collection, bounds):
        """Query Sentinel satellite data using STAC API"""
        try:
            bbox = [bounds['min_lon'], bounds['min_lat'], 
                   bounds['max_lon'], bounds['max_lat']]
            
            datetime_range = self.format_date_range()
            
            print(f"Querying {collection} collection...")
            print(f"  Bbox: {bbox}")
            print(f"  DateTime: {datetime_range}")
            print(f"  Cloud cover: < {self.cloud_threshold}%")
            
            search = self.stac_client.search(
                collections=[collection],
                bbox=bbox,
                datetime=datetime_range,
                max_items=100,
                query={
                    "eo:cloud_cover": {"lt": self.cloud_threshold}
                } if collection == "sentinel-2-l2a" else {}
            )
            
            items = list(search.items())
            print(f"Found {len(items)} items for {collection}")
            
            return items
            
        except Exception as e:
            print(f"Error querying {collection}: {e}")
            return []

    def download_item(self, item, collection, item_index):
        """Download individual satellite item"""
        try:
            item_id = item.id
            item_dir = os.path.join(self.raw_dir, 'images', collection, item_id)
            os.makedirs(item_dir, exist_ok=True)
            
            # Save item metadata
            metadata_path = os.path.join(item_dir, 'metadata.json')
            with open(metadata_path, 'w') as f:
                json.dump(item.to_dict(), f, indent=2)
            
            # Define bands to download based on collection
            if collection == "sentinel-2-l2a":
                # Use the correct asset names from Earth Search API
                assets_to_download = {
                    'blue': 'blue.tif',      # Blue band (B02)
                    'green': 'green.tif',    # Green band (B03)
                    'red': 'red.tif',        # Red band (B04)
                    'nir': 'nir.tif',        # NIR band (B08)
                    'scl': 'scl.tif'         # Scene Classification
                }
            else:  # sentinel-1-grd
                assets_to_download = {
                    'vh': 'vh.tif',
                    'vv': 'vv.tif'
                }
            
            downloaded_count = 0
            for asset_key, filename in assets_to_download.items():
                if asset_key in item.assets:
                    asset_url = item.assets[asset_key].href
                    file_path = os.path.join(item_dir, filename)
                    
                    if not os.path.exists(file_path):
                        try:
                            print(f"  Downloading {asset_key} from {asset_url[:100]}...")
                            response = self.session.get(asset_url, timeout=120)
                            response.raise_for_status()
                            
                            with open(file_path, 'wb') as f:
                                f.write(response.content)
                            downloaded_count += 1
                            print(f"  ✅ Saved {filename} ({len(response.content)} bytes)")
                            
                        except Exception as e:
                            print(f"  ❌ Failed to download {asset_key} for {item_id}: {e}")
                    else:
                        downloaded_count += 1  # Already exists
                        print(f"  ✅ {filename} already exists")
                else:
                    print(f"  ⚠️ Asset {asset_key} not found in item {item_id}")
            
            print(f"Downloaded {item_id}: {downloaded_count}/{len(assets_to_download)} assets")
            return True
            
        except Exception as e:
            print(f"Error downloading item {item.id}: {e}")
            return False

    def download_items_concurrently(self, items, collection):
        """Download items with controlled concurrency"""
        if not items:
            return 0
        
        print(f"Starting concurrent download of {len(items)} {collection} items...")
        
        # Limit concurrent downloads to avoid overwhelming the server
        MAX_WORKERS = min(8, len(items))
        successful_downloads = 0
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit download tasks
            future_to_item = {
                executor.submit(self.download_item, item, collection, i): (item, i) 
                for i, item in enumerate(items)
            }
            
            completed = 0
            for future in as_completed(future_to_item):
                completed += 1
                item, item_index = future_to_item[future]
                
                try:
                    success = future.result()
                    if success:
                        successful_downloads += 1
                except Exception as e:
                    print(f"Download task failed: {e}")
                
                # Update progress
                if collection == "sentinel-2-l2a":
                    base_progress = 20
                    progress_range = 50
                else:  # sentinel-1-grd
                    base_progress = 70
                    progress_range = 20
                
                progress = base_progress + int((completed / len(items)) * progress_range)
                print_progress(progress, f"Downloaded {completed}/{len(items)} {collection} items")
        
        print(f"Successfully downloaded {successful_downloads}/{len(items)} {collection} items")
        return successful_downloads

    def download_satellite_data(self):
        """Main download orchestration with polygon-based area of interest"""
        try:
            print_progress(5, "Initializing download...")
            
            # Get city bounds and polygon (ensures we use the polygon boundaries)
            bounds, polygon, area_km_sq = self.get_city_bounds_and_polygon()
            
            print_progress(10, "Querying available satellite data...")
            
            # Query Sentinel-2 data (optical)
            s2_items = self.query_sentinel_data("sentinel-2-l2a", bounds)
            
            # Query Sentinel-1 data (SAR) - optional for additional analysis
            s1_items = self.query_sentinel_data("sentinel-1-grd", bounds)
            
            print_progress(15, f"Found {len(s2_items)} Sentinel-2 and {len(s1_items)} Sentinel-1 items")
            
            # Limit items for web app performance (prioritize recent data)
            max_items_per_collection = 20
            if len(s2_items) > max_items_per_collection:
                # Sort by date and take most recent
                s2_items = sorted(s2_items, key=lambda x: x.datetime, reverse=True)[:max_items_per_collection]
                print(f"Limited to {max_items_per_collection} most recent Sentinel-2 items")
            
            if len(s1_items) > max_items_per_collection:
                s1_items = sorted(s1_items, key=lambda x: x.datetime, reverse=True)[:max_items_per_collection]
                print(f"Limited to {max_items_per_collection} most recent Sentinel-1 items")
            
            total_items = len(s2_items) + len(s1_items)
            
            if total_items == 0:
                print("No satellite data found for the specified criteria")
                return {
                    'sentinel1_items': 0,
                    'sentinel2_items': 0,
                    'total_downloaded': 0,
                    'area_km_sq': area_km_sq,
                    'bounds': bounds
                }
            
            print_progress(20, f"Starting download of {total_items} items...")
            
            # Download Sentinel-2 data (priority for vegetation analysis)
            s2_downloaded = 0
            if s2_items:
                print_progress(20, "Downloading Sentinel-2 data...")
                s2_downloaded = self.download_items_concurrently(s2_items, "sentinel-2-l2a")
            
            # Download Sentinel-1 data
            s1_downloaded = 0
            if s1_items:
                print_progress(70, "Downloading Sentinel-1 data...")
                s1_downloaded = self.download_items_concurrently(s1_items, "sentinel-1-grd")
            
            print_progress(90, "Finalizing download summary...")
            
            # Create download summary
            summary = {
                'sentinel1_items': len(s1_items),
                'sentinel2_items': len(s2_items),
                'sentinel1_downloaded': s1_downloaded,
                'sentinel2_downloaded': s2_downloaded,
                'total_downloaded': s1_downloaded + s2_downloaded,
                'area_km_sq': area_km_sq,
                'bounds': bounds,
                'date_range': self.format_date_range(),
                'cloud_threshold': self.cloud_threshold
            }
            
            # Save summary
            summary_path = os.path.join(self.raw_dir, 'download_summary.json')
            with open(summary_path, 'w') as f:
                json.dump(summary, f, indent=2)
            
            print(f"Download Summary:")
            print(f"  Area: ~{area_km_sq:.1f} km² (polygon-based)")
            print(f"  Sentinel-2: {s2_downloaded}/{len(s2_items)} items")
            print(f"  Sentinel-1: {s1_downloaded}/{len(s1_items)} items")
            print(f"  Total: {s2_downloaded + s1_downloaded}/{total_items} items")
            
            return summary
            
        except Exception as e:
            print(f"Error in satellite data download: {e}")
            raise

def main():
    if len(sys.argv) != 2:
        print("Usage: python download_satellite_images.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        print("="*50)
        print("SATELLITE DATA DOWNLOAD")
        print("="*50)
        print(f"City: {config['city']['city']}, {config['city']['country']}")
        print(f"Date range: {config.get('startMonth', '01')}/{config.get('startYear', 2023)} to {config.get('endMonth', '12')}/{config.get('endYear', 2023)}")
        print(f"Config file: {config_file}")
        
        downloader = SatelliteDownloader(config)
        summary = downloader.download_satellite_data()
        
        print("Satellite data download completed successfully!")
        print(f"Downloaded {summary['total_downloaded']} items covering ~{summary['area_km_sq']:.1f} km²")
        
    except Exception as e:
        print(f"Error in satellite download: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main() 