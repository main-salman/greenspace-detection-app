#!/usr/bin/env python3
"""
Vegetation Highlighter for Greenspace Web App
Creates false color images with vegetation highlighting based on NDVI
"""

import json
import sys
import os
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling
import cv2
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

class VegetationHighlighter:
    def __init__(self, config):
        self.config = config
        self.input_dir = os.path.join(config['outputDir'], 'satellite_data', 'processed')
        self.output_dir = os.path.join(config['outputDir'], 'vegetation_analysis')
        self.ndvi_threshold = config.get('ndviThreshold', 0.3)
        
        # Create output directory
        os.makedirs(self.output_dir, exist_ok=True)
        
        print(f"Input directory: {self.input_dir}")
        print(f"Output directory: {self.output_dir}")
        print(f"NDVI threshold: {self.ndvi_threshold}")
    
    def read_composite_bands(self, image_path):
        """Read composite bands and identify them correctly"""
        try:
            with rasterio.open(image_path) as src:
                bands = {}
                
                # Read band descriptions to map bands correctly
                band_descriptions = [src.descriptions[i] for i in range(src.count)]
                print(f"Band descriptions: {band_descriptions}")
                
                # Map bands by description
                for i, desc in enumerate(band_descriptions, 1):
                    if desc:
                        desc_lower = desc.lower()
                        if 'blue' in desc_lower or 'b02' in desc_lower:
                            bands['blue'] = src.read(i).astype(np.float32)
                        elif 'green' in desc_lower or 'b03' in desc_lower:
                            bands['green'] = src.read(i).astype(np.float32)
                        elif 'red' in desc_lower or 'b04' in desc_lower:
                            bands['red'] = src.read(i).astype(np.float32)
                        elif 'nir' in desc_lower or 'b08' in desc_lower:
                            bands['nir'] = src.read(i).astype(np.float32)
                        elif 'ndvi' in desc_lower:
                            bands['ndvi'] = src.read(i).astype(np.float32)
                
                # If we don't have NDVI, compute it from NIR and Red
                if 'ndvi' not in bands and 'nir' in bands and 'red' in bands:
                    nir = bands['nir']
                    red = bands['red']
                    # Avoid division by zero
                    denominator = nir + red
                    ndvi = np.where(denominator != 0, (nir - red) / denominator, 0)
                    bands['ndvi'] = ndvi
                    print("Computed NDVI from NIR and Red bands")
                
                print(f"Available bands: {list(bands.keys())}")
                return bands, src.profile
                
        except Exception as e:
            print(f"Error reading bands from {image_path}: {e}")
            return None, None
    
    def detect_vegetation_with_density_levels(self, ndvi, threshold=0.3):
        """Detect vegetation with multiple density levels and return detailed statistics"""
        # Create masks for different vegetation density levels
        high_density_mask = ndvi > 0.6     # Green
        medium_density_mask = (ndvi >= 0.4) & (ndvi <= 0.6)  # Yellow
        low_density_mask = (ndvi >= 0.2) & (ndvi < 0.4)      # Purple
        
        # Overall vegetation mask (above threshold)
        vegetation_mask = ndvi > threshold
        
        # Calculate statistics
        total_pixels = ndvi.size
        vegetation_pixels = np.sum(vegetation_mask)
        high_density_pixels = np.sum(high_density_mask)
        medium_density_pixels = np.sum(medium_density_mask)
        low_density_pixels = np.sum(low_density_mask)
        
        vegetation_percentage = (vegetation_pixels / total_pixels) * 100
        high_density_percentage = (high_density_pixels / total_pixels) * 100
        medium_density_percentage = (medium_density_pixels / total_pixels) * 100
        low_density_percentage = (low_density_pixels / total_pixels) * 100
        
        # Calculate NDVI range
        valid_ndvi = ndvi[np.isfinite(ndvi)]
        ndvi_range = [float(np.min(valid_ndvi)), float(np.max(valid_ndvi))] if len(valid_ndvi) > 0 else [0, 1]
        
        return {
            'vegetation_mask': vegetation_mask,
            'high_density_mask': high_density_mask,
            'medium_density_mask': medium_density_mask,
            'low_density_mask': low_density_mask,
            'ndvi_range': ndvi_range,
            'vegetation_pixels': int(vegetation_pixels),
            'total_pixels': int(total_pixels),
            'vegetation_percentage': vegetation_percentage,
            'high_density_percentage': high_density_percentage,
            'medium_density_percentage': medium_density_percentage,
            'low_density_percentage': low_density_percentage
        }
    
    def create_false_color_highlighted_image(self, bands, vegetation_result):
        """Create false color image with vegetation highlighted in specific colors"""
        if not all(band in bands for band in ['red', 'green', 'blue']):
            print("Missing RGB bands for false color image")
            return None
        
        red = bands['red']
        green = bands['green']
        blue = bands['blue']
        
        # Normalize bands to 0-255
        def normalize_band(band):
            band_clean = np.nan_to_num(band, nan=0)
            if np.max(band_clean) > np.min(band_clean):
                return ((band_clean - np.min(band_clean)) / (np.max(band_clean) - np.min(band_clean)) * 255).astype(np.uint8)
            return np.zeros_like(band_clean, dtype=np.uint8)
        
        red_norm = normalize_band(red)
        green_norm = normalize_band(green)
        blue_norm = normalize_band(blue)
        
        # Create RGB image
        rgb_image = np.stack([red_norm, green_norm, blue_norm], axis=2)
        
        # Apply vegetation highlighting with specific colors
        highlighted_image = rgb_image.copy()
        
        # High density vegetation - Green
        high_mask = vegetation_result['high_density_mask']
        highlighted_image[high_mask] = [0, 255, 0]  # Bright green
        
        # Medium density vegetation - Yellow
        medium_mask = vegetation_result['medium_density_mask']
        highlighted_image[medium_mask] = [255, 255, 0]  # Yellow
        
        # Low density vegetation - Purple
        low_mask = vegetation_result['low_density_mask']
        highlighted_image[low_mask] = [128, 0, 128]  # Purple
        
        return highlighted_image
    
    def create_ndvi_visualization(self, ndvi):
        """Create a color-mapped NDVI visualization"""
        # Normalize NDVI to 0-255
        ndvi_clean = np.nan_to_num(ndvi, nan=0)
        ndvi_normalized = np.clip((ndvi_clean + 1) * 127.5, 0, 255).astype(np.uint8)
        
        # Apply colormap (use cv2.COLORMAP_RdYlGn for red-yellow-green)
        ndvi_colored = cv2.applyColorMap(ndvi_normalized, cv2.COLORMAP_RdYlGn)
        
        return ndvi_colored
    
    def process_image(self, image_path):
        """Process a single image and return statistics"""
        try:
            print(f"Processing: {image_path}")
            
            # Read bands
            bands, profile = self.read_composite_bands(image_path)
            if bands is None or 'ndvi' not in bands:
                print(f"Could not read NDVI from {image_path}")
                return None
            
            # Detect vegetation with density levels
            vegetation_result = self.detect_vegetation_with_density_levels(
                bands['ndvi'], self.ndvi_threshold
            )
            
            # Create highlighted false color image
            highlighted_image = self.create_false_color_highlighted_image(bands, vegetation_result)
            
            # Create NDVI visualization
            ndvi_visualization = self.create_ndvi_visualization(bands['ndvi'])
            
            # Save highlighted image
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            if highlighted_image is not None:
                highlighted_path = os.path.join(self.output_dir, f'{base_name}_vegetation_highlighted.png')
                cv2.imwrite(highlighted_path, cv2.cvtColor(highlighted_image, cv2.COLOR_RGB2BGR))
                print(f"Saved highlighted image: {highlighted_path}")
            
            # Save NDVI visualization
            ndvi_vis_path = os.path.join(self.output_dir, f'{base_name}_ndvi_visualization.png')
            cv2.imwrite(ndvi_vis_path, ndvi_visualization)
            print(f"Saved NDVI visualization: {ndvi_vis_path}")
            
            # Save geographic bounds metadata for web app
            if profile:
                bounds_data = {
                    'image_name': base_name,
                    'bounds': {
                        'left': profile['transform'].c,
                        'bottom': profile['transform'].f + profile['transform'].e * profile['height'],
                        'right': profile['transform'].c + profile['transform'].a * profile['width'],
                        'top': profile['transform'].f
                    },
                    'width': profile['width'],
                    'height': profile['height'],
                    'crs': str(profile['crs']) if profile['crs'] else 'EPSG:4326'
                }
                bounds_path = os.path.join(self.output_dir, f'{base_name}_bounds.json')
                with open(bounds_path, 'w') as f:
                    json.dump(bounds_data, f, indent=2)
                print(f"Saved bounds metadata: {bounds_path}")
            
            # Return statistics for this image
            return {
                'image_name': base_name,
                'vegetation_percentage': vegetation_result['vegetation_percentage'],
                'high_density_percentage': vegetation_result['high_density_percentage'],
                'medium_density_percentage': vegetation_result['medium_density_percentage'],
                'low_density_percentage': vegetation_result['low_density_percentage'],
                'ndvi_range': vegetation_result['ndvi_range'],
                'total_pixels': vegetation_result['total_pixels']
            }
            
        except Exception as e:
            print(f"Error processing {image_path}: {e}")
            return None
    
    def run_parallel(self):
        """Process all images in parallel and generate summary statistics"""
        print("Starting vegetation highlighting...")
        
        # Find all composite images
        composite_images = []
        for root, dirs, files in os.walk(self.input_dir):
            for file in files:
                if file.endswith(('.tif', '.tiff')) and 'composite' in file.lower():
                    composite_images.append(os.path.join(root, file))
        
        if not composite_images:
            print("No composite images found for processing")
            return
        
        print(f"Found {len(composite_images)} composite images to process")
        
        # Process images
        all_stats = []
        max_workers = min(4, len(composite_images), multiprocessing.cpu_count())
        
        for i, image_path in enumerate(composite_images):
            print_progress(int((i / len(composite_images)) * 90), f"Processing image {i+1}/{len(composite_images)}")
            stats = self.process_image(image_path)
            if stats:
                all_stats.append(stats)
        
        print_progress(95, "Calculating overall statistics...")
        
        # Calculate overall statistics
        if all_stats:
            total_pixels = sum(stat['total_pixels'] for stat in all_stats)
            weighted_vegetation = sum(stat['vegetation_percentage'] * stat['total_pixels'] for stat in all_stats)
            weighted_high_density = sum(stat['high_density_percentage'] * stat['total_pixels'] for stat in all_stats)
            weighted_medium_density = sum(stat['medium_density_percentage'] * stat['total_pixels'] for stat in all_stats)
            weighted_low_density = sum(stat['low_density_percentage'] * stat['total_pixels'] for stat in all_stats)
            
            overall_stats = {
                'total_images_processed': len(all_stats),
                'overall_vegetation_percentage': weighted_vegetation / total_pixels if total_pixels > 0 else 0,
                'overall_high_density_percentage': weighted_high_density / total_pixels if total_pixels > 0 else 0,
                'overall_medium_density_percentage': weighted_medium_density / total_pixels if total_pixels > 0 else 0,
                'overall_low_density_percentage': weighted_low_density / total_pixels if total_pixels > 0 else 0,
                'ndvi_threshold_used': self.ndvi_threshold,
                'individual_image_stats': all_stats,
                'color_coding': {
                    'high_density': 'Green (NDVI > 0.6)',
                    'medium_density': 'Yellow (NDVI 0.4-0.6)',
                    'low_density': 'Purple (NDVI 0.2-0.4)'
                }
            }
            
            # Save summary
            summary_path = os.path.join(self.output_dir, 'vegetation_analysis_summary.json')
            with open(summary_path, 'w') as f:
                json.dump(overall_stats, f, indent=2)
            
            print(f"Overall vegetation coverage: {overall_stats['overall_vegetation_percentage']:.2f}%")
            print(f"High density vegetation: {overall_stats['overall_high_density_percentage']:.2f}%")
            print(f"Medium density vegetation: {overall_stats['overall_medium_density_percentage']:.2f}%")
            print(f"Low density vegetation: {overall_stats['overall_low_density_percentage']:.2f}%")
            print(f"Saved summary: {summary_path}")
        
        print_progress(100, "Vegetation highlighting completed!")

def main():
    if len(sys.argv) != 2:
        print("Usage: python vegetation_highlighter.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        print("="*50)
        print("VEGETATION HIGHLIGHTING")
        print("="*50)
        print(f"City: {config['city']['city']}, {config['city']['country']}")
        print(f"NDVI Threshold: {config.get('ndviThreshold', 0.3)}")
        print(f"Config file: {config_file}")
        
        generator = VegetationHighlighter(config)
        generator.run_parallel()
        
        print("Vegetation highlighting completed successfully!")
        
    except Exception as e:
        print(f"Error in vegetation highlighting: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main() 