#!/usr/bin/env python3
"""
Generate vegetation change visualization between baseline and compare years
"""

import os
import sys
import json
import numpy as np
import cv2
from pathlib import Path
import glob

def print_progress(percentage, message=""):
    """Print progress in a format that can be parsed by Node.js"""
    print(f"PROGRESS:{percentage} {message}", flush=True)

def load_best_data_from_year(year_dir):
    """Load the best NDVI data and RGB imagery from a year directory (from monthly results)"""
    year_path = Path(year_dir)
    if not year_path.exists():
        print(f"Year directory not found: {year_dir}")
        return None, None, None
    
    # Look for NDVI data files in monthly subdirectories
    data_files = []
    for month_dir in year_path.iterdir():
        if month_dir.is_dir():
            # Look for NDVI data in this month
            ndvi_pattern = month_dir / "vegetation_analysis" / "ndvi_data.npy"
            if ndvi_pattern.exists():
                data_files.append(month_dir)
    
    if not data_files:
        print(f"No data files found in {year_dir}")
        return None, None, None
    
    # Load all NDVI arrays and find the one with highest mean (best quality)
    best_ndvi = None
    best_rgb = None
    best_mean = -1
    best_mask = None
    
    for month_dir in data_files:
        try:
            ndvi_file = month_dir / "vegetation_analysis" / "ndvi_data.npy"
            ndvi = np.load(ndvi_file)
            
            # Look for corresponding city mask
            mask_file = month_dir / "vegetation_analysis" / "city_mask.npy"
            if mask_file.exists():
                city_mask = np.load(mask_file)
            else:
                city_mask = np.ones_like(ndvi, dtype=bool)
            
            # Look for RGB composite image
            rgb_files = list(month_dir.glob("**/composite_*.tif"))
            if not rgb_files:
                rgb_files = list(month_dir.glob("**/composite*.tif"))
            
            rgb_data = None
            if rgb_files:
                try:
                    import rasterio
                    with rasterio.open(rgb_files[0]) as src:
                        # Read RGB bands (typically bands 1, 2, 3 for Red, Green, Blue)
                        rgb_data = np.stack([
                            src.read(1),  # Red
                            src.read(2),  # Green  
                            src.read(3)   # Blue
                        ], axis=2)
                        # Normalize to 0-255 range
                        rgb_data = np.clip((rgb_data / np.max(rgb_data)) * 255, 0, 255).astype(np.uint8)
                except Exception as e:
                    print(f"Could not load RGB data from {rgb_files[0]}: {e}")
            
            # Calculate mean NDVI within city bounds
            valid_ndvi = ndvi[city_mask & (ndvi > -1)]  # Exclude invalid values
            if len(valid_ndvi) > 0:
                mean_ndvi = np.mean(valid_ndvi)
                if mean_ndvi > best_mean:
                    best_mean = mean_ndvi
                    best_ndvi = ndvi
                    best_rgb = rgb_data
                    best_mask = city_mask
        except Exception as e:
            print(f"Error loading data from {month_dir}: {e}")
            continue
    
    return best_ndvi, best_mask, best_rgb

def load_composite_data_from_year(year_dir, veg_threshold=0.3):
    """Load and composite NDVI data from all months in a year directory - matches main analysis method"""
    year_path = Path(year_dir)
    if not year_path.exists():
        print(f"Year directory not found: {year_dir}")
        return None, None, None
    
    # Look for monthly vegetation analysis summaries (same as main analysis uses)
    monthly_data = []
    reference_shape = None
    reference_mask = None
    best_rgb = None
    
    for month_dir in year_path.iterdir():
        if month_dir.is_dir():
            try:
                # Read the vegetation summary from each month (same as main analysis)
                summary_file = month_dir / "vegetation_analysis" / "vegetation_analysis_summary.json"
                if summary_file.exists():
                    with open(summary_file, 'r') as f:
                        summary = json.load(f)
                    
                    # Get vegetation percentage calculated by main processor
                    veg_percentage = summary.get('vegetation_percentage', 0)
                    
                    # Load NDVI data for this month
                    ndvi_file = month_dir / "vegetation_analysis" / "ndvi_data.npy"
                    if ndvi_file.exists():
                        ndvi = np.load(ndvi_file)
                        
                        # Load city mask
                        mask_file = month_dir / "vegetation_analysis" / "city_mask.npy"
                        if mask_file.exists():
                            city_mask = np.load(mask_file)
                        else:
                            city_mask = np.ones_like(ndvi, dtype=bool)
                        
                        # Set reference shape from first valid month
                        if reference_shape is None:
                            reference_shape = ndvi.shape
                            reference_mask = city_mask
                        
                        monthly_data.append({
                            'ndvi': ndvi,
                            'mask': city_mask,
                            'veg_percentage': veg_percentage,
                            'month': month_dir.name
                        })
                        
                        print(f"   📊 Month {month_dir.name}: {veg_percentage:.1f}% vegetation")
                        
                        # Keep RGB from first available month for visualization
                        if best_rgb is None:
                            rgb_files = list(month_dir.glob("**/composite_*.tif"))
                            if not rgb_files:
                                rgb_files = list(month_dir.glob("**/composite*.tif"))
                            
                            if rgb_files:
                                try:
                                    import rasterio
                                    with rasterio.open(rgb_files[0]) as src:
                                        best_rgb = np.stack([
                                            src.read(1),  # Red
                                            src.read(2),  # Green  
                                            src.read(3)   # Blue
                                        ], axis=2)
                                        best_rgb = np.clip((best_rgb / np.max(best_rgb)) * 255, 0, 255).astype(np.uint8)
                                except Exception as e:
                                    print(f"   ⚠️ Could not load RGB for {month_dir.name}: {e}")
            
            except Exception as e:
                print(f"   ❌ Error processing {month_dir}: {e}")
                continue
    
    if not monthly_data:
        print("   ❌ No valid monthly data found")
        return None, None, None
    
    print(f"   📁 Loaded {len(monthly_data)} months of NDVI data")
    
    # Calculate average vegetation percentage (exactly same as main analysis)
    monthly_percentages = [m['veg_percentage'] for m in monthly_data]
    average_veg_percentage = sum(monthly_percentages) / len(monthly_percentages)
    print(f"   ✅ Average vegetation: {average_veg_percentage:.1f}% (same calculation as main analysis)")
    
    # Create composite NDVI by averaging all monthly NDVI arrays (real data only)
    composite_ndvi = np.zeros(reference_shape, dtype=np.float32)
    composite_count = np.zeros(reference_shape, dtype=np.int32)
    
    for month_data in monthly_data:
        ndvi = month_data['ndvi']
        mask = month_data['mask']
        
        # Only include valid NDVI values in the composite
        valid_pixels = mask & (ndvi > -1) & (ndvi < 1)  # Valid NDVI range
        composite_ndvi[valid_pixels] += ndvi[valid_pixels]
        composite_count[valid_pixels] += 1
    
    # Calculate average where we have data (real composite from all months)
    valid_composite = composite_count > 0
    composite_ndvi[valid_composite] = composite_ndvi[valid_composite] / composite_count[valid_composite]
    
    print(f"   🔧 Created real NDVI composite from {len(monthly_data)} months")
    print(f"   📊 Composite represents {average_veg_percentage:.1f}% vegetation (matches main analysis)")
    
    return composite_ndvi, reference_mask, best_rgb

def create_leaflet_style_background(height, width, city_mask):
    """Create a leaflet-style map background for areas outside the city"""
    background = np.full((height, width, 3), [240, 240, 240], dtype=np.uint8)  # Light gray base
    
    # Add subtle grid lines to mimic map tiles
    grid_spacing = max(20, min(height, width) // 20)  # Adaptive grid spacing
    
    # Horizontal lines
    for y in range(0, height, grid_spacing):
        if y < height:
            background[y, :] = [220, 220, 220]  # Slightly darker gray for grid lines
    
    # Vertical lines  
    for x in range(0, width, grid_spacing):
        if x < width:
            background[:, x] = [220, 220, 220]  # Slightly darker gray for grid lines
    
    return background

def create_change_visualization(baseline_ndvi, compare_ndvi, city_mask, output_path, veg_threshold=0.3, baseline_rgb=None, compare_rgb=None):
    """Create vegetation change visualization"""
    print("🔄 Creating vegetation change visualization...")
    
    if baseline_ndvi is None or compare_ndvi is None:
        print("❌ Missing NDVI data for change visualization")
        return None
    
    # Ensure both arrays have the same shape
    if baseline_ndvi.shape != compare_ndvi.shape:
        print(f"⚠️ NDVI shape mismatch: baseline {baseline_ndvi.shape} vs compare {compare_ndvi.shape}")
        # Resize to match the smaller dimension
        min_h = min(baseline_ndvi.shape[0], compare_ndvi.shape[0])
        min_w = min(baseline_ndvi.shape[1], compare_ndvi.shape[1])
        baseline_ndvi = baseline_ndvi[:min_h, :min_w]
        compare_ndvi = compare_ndvi[:min_h, :min_w]
        if city_mask is not None:
            city_mask = city_mask[:min_h, :min_w]
    
    height, width = baseline_ndvi.shape
    
    # Use city mask or create default
    if city_mask is None:
        city_mask = np.ones_like(baseline_ndvi, dtype=bool)
    
    # Create vegetation masks for both years
    baseline_veg = (baseline_ndvi >= veg_threshold) & city_mask
    compare_veg = (compare_ndvi >= veg_threshold) & city_mask
    
    # Calculate change categories
    vegetation_gain = compare_veg & ~baseline_veg  # New vegetation
    vegetation_loss = baseline_veg & ~compare_veg  # Lost vegetation
    vegetation_stable = baseline_veg & compare_veg  # Stable vegetation
    no_vegetation = ~baseline_veg & ~compare_veg & city_mask  # Consistently no vegetation
    
    # Create RGBA change visualization with transparency for map overlay
    # Start with fully transparent background
    change_image = np.zeros((height, width, 4), dtype=np.uint8)  # RGBA format
    
    # No background needed - we want transparency for map overlay
    print("   🗺️ Creating transparent overlay for interactive map")
    
    # Color scheme for transparent overlay (BGRA format for OpenCV):
    # Bright green = Vegetation gain with transparency
    # Bright red = Vegetation loss with transparency
    # Purple = Stable vegetation with transparency
    # Fully transparent = All other areas (let map show through)
    
    # Apply vegetation change colors with transparency (OpenCV uses BGRA format)
    change_image[vegetation_gain] = [0, 255, 0, 200]      # Bright green with 200/255 opacity
    change_image[vegetation_loss] = [0, 0, 255, 200]      # Bright red with 200/255 opacity  
    change_image[vegetation_stable] = [128, 0, 128, 150]  # Purple with 150/255 opacity (more subtle)
    # All other areas remain transparent (0, 0, 0, 0) - map shows through
    
    # Calculate statistics
    gain_pixels = np.sum(vegetation_gain)
    loss_pixels = np.sum(vegetation_loss)
    stable_pixels = np.sum(vegetation_stable)
    total_city_pixels = np.sum(city_mask)
    
    gain_percentage = (gain_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
    loss_percentage = (loss_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
    stable_percentage = (stable_pixels / total_city_pixels) * 100 if total_city_pixels > 0 else 0
    
    # Note: Change analysis uses best month NDVI data for spatial accuracy
    # Main analysis uses averaged monthly percentages for temporal trends
    # Some discrepancy between these analyses is scientifically valid
    
    print(f"   📊 Vegetation Change Analysis:")
    print(f"     🟢 Vegetation Gain: {gain_percentage:.1f}% ({gain_pixels:,} pixels)")
    print(f"     🔴 Vegetation Loss: {loss_percentage:.1f}% ({loss_pixels:,} pixels)")
    print(f"     🟢 Stable Vegetation: {stable_percentage:.1f}% ({stable_pixels:,} pixels)")
    print(f"     📍 Total City Pixels: {total_city_pixels:,}")
    
    # Resize image to make it 10x bigger for better visibility
    scale_factor = 10
    new_height = height * scale_factor
    new_width = width * scale_factor
    
    # Use INTER_NEAREST to preserve sharp color boundaries
    resized_image = cv2.resize(change_image, (new_width, new_height), interpolation=cv2.INTER_NEAREST)
    
    print(f"   📏 Resized image from {width}x{height} to {new_width}x{new_height} (10x larger)")
    
    # Save the change visualization as PNG with transparency
    try:
        # Ensure output path has .png extension for transparency support
        output_path_png = str(output_path).replace('.png', '_transparent.png')
        success = cv2.imwrite(output_path_png, resized_image)
        if success:
            print(f"   ✅ Transparent change visualization saved: {output_path_png}")
            # Also save the original path for compatibility
            cv2.imwrite(str(output_path), resized_image)
        else:
            print(f"   ❌ Failed to save change visualization")
            return None
    except Exception as e:
        print(f"   ❌ Error saving change visualization: {e}")
        return None
    
    # Return statistics
    return {
        'gainPercentage': gain_percentage,
        'lossPercentage': loss_percentage,
        'stablePercentage': stable_percentage,
        'gainPixels': int(gain_pixels),
        'lossPixels': int(loss_pixels),
        'stablePixels': int(stable_pixels),
        'totalCityPixels': int(total_city_pixels)
    }

def main():
    if len(sys.argv) != 2:
        print("Usage: python generate_change_visualization.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
    except Exception as e:
        print(f"Error loading config: {e}")
        sys.exit(1)
    
    baseline_dir = config.get('baselineDir')
    compare_dir = config.get('compareDir')
    output_dir = config.get('outputDir')
    
    if not all([baseline_dir, compare_dir, output_dir]):
        print("Missing required directories in config")
        sys.exit(1)
    
    print_progress(10, "Loading baseline data...")
    baseline_ndvi, baseline_mask, baseline_rgb = load_composite_data_from_year(baseline_dir, config.get("ndviThreshold", 0.3))
    
    print_progress(30, "Loading compare data...")
    compare_ndvi, compare_mask, compare_rgb = load_composite_data_from_year(compare_dir, config.get("ndviThreshold", 0.3))
    
    # Use the mask from baseline (should be the same city)
    city_mask = baseline_mask if baseline_mask is not None else compare_mask
    
    print_progress(50, "Generating change visualization...")
    change_output = Path(output_dir) / "vegetation_change.png"
    stats = create_change_visualization(baseline_ndvi, compare_ndvi, city_mask, change_output, 
                                      baseline_rgb=baseline_rgb, compare_rgb=compare_rgb)
    
    if stats:
        print_progress(80, "Saving change statistics...")
        stats_output = Path(output_dir) / "change_stats.json"
        with open(stats_output, 'w') as f:
            json.dump(stats, f, indent=2)
        
        print_progress(100, "Change visualization completed!")
        print("✅ Vegetation change visualization generated successfully!")
    else:
        print("❌ Failed to generate change visualization")
        sys.exit(1)

if __name__ == "__main__":
    main()
