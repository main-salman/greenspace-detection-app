# 🌱 Greenspace Detection Demo Guide

This guide walks you through testing the Greenspace Detection Web App with a sample city.

## Quick Setup

1. **Install Dependencies**
```bash
npm install
npm run setup  # Installs Python dependencies
```

2. **Start the Application**
```bash
npm run dev
```

3. **Open Browser**
Navigate to `http://localhost:3000`

## Demo Walkthrough

### Step 1: Select a City
1. **Search for "Toronto"** in the city search box
2. **Click on Toronto, Ontario, Canada** to select it
3. Notice the city details appear with coordinates

### Step 2: Configure Processing
1. **Set Date Range**: Use `2024-06` to `2024-07` (summer months for better vegetation)
2. **Adjust NDVI Threshold**: Try `0.2` (default) for general vegetation detection
3. **Cloud Coverage**: Keep at `30%` maximum
4. **Advanced Options**: Leave vegetation indices enabled for richer analysis

### Step 3: Start Processing
1. **Click "🚀 Start Processing"**
2. **Monitor Progress**: Watch the real-time status updates
   - Downloading satellite images (10-40%)
   - Preprocessing and cloud removal (40-70%)  
   - NDVI calculation and highlighting (70-100%)

### Step 4: View Results
Once processing completes, you'll see:
- **Vegetation Coverage Percentage** for the selected area
- **Statistics**: Downloaded images, processed composites
- **Generated Files**: False color images with vegetation highlighting
- **Analysis Insights**: Recommendations based on vegetation coverage

## Expected Processing Time

- **Small cities**: 5-15 minutes
- **Large cities**: 15-45 minutes
- **Network dependent**: Satellite data download speed varies

## Sample Results

For Toronto in summer months, you should expect:
- **Vegetation Coverage**: ~40-60% (Toronto has many parks and trees)
- **Generated Files**: 
  - False color infrared images
  - NDVI visualizations
  - Monthly composite images

## Testing Different Scenarios

### High Vegetation City
- **Try**: Vancouver, Canada (lots of forests and parks)
- **Expected**: 50-70% vegetation coverage

### Desert City  
- **Try**: Riyadh, Saudi Arabia
- **Expected**: 5-20% vegetation coverage

### Dense Urban Area
- **Try**: Tokyo (Shibuya), Japan
- **Expected**: 15-35% vegetation coverage

## Troubleshooting

### Processing Stuck at Download
- **Issue**: Slow or failed satellite data download
- **Solution**: Check internet connection, try a smaller city

### Python Errors
- **Issue**: Missing Python dependencies
- **Solution**: Run `npm run setup` again, ensure Python 3.8+ installed

### Memory Issues
- **Issue**: Process killed or out of memory
- **Solution**: Try shorter date ranges, close other applications

### No Results Generated
- **Issue**: Empty results after processing
- **Solution**: Try different date ranges, check for cloud-free periods

## Understanding the Results

### Vegetation Percentage
- **0-25%**: Limited green space (dense urban or arid areas)
- **25-50%**: Moderate green space (typical suburban areas)  
- **50%+**: High green space (cities with parks, forests)

### NDVI Values
- **-1 to 0**: Water, built surfaces, rocks
- **0 to 0.2**: Bare soil, sparse vegetation
- **0.2 to 0.5**: Moderate vegetation  
- **0.5 to 1.0**: Dense, healthy vegetation

### File Types
- **PNG Files**: Web-optimized visualization images
- **TIF Files**: High-resolution geospatial data
- **JSON Files**: Analysis statistics and metadata

## Advanced Testing

### Custom NDVI Thresholds
- **Low (0.1)**: Detect sparse vegetation and stressed plants
- **Medium (0.2)**: Standard vegetation detection  
- **High (0.4)**: Only dense, healthy vegetation

### Seasonal Comparison
Compare the same city across seasons:
- **Summer**: Higher vegetation (growing season)
- **Winter**: Lower vegetation (dormant period)
- **Spring**: Moderate vegetation (growth beginning)

### Urban vs Rural
- **Urban Centers**: Lower overall vegetation, concentrated in parks
- **Suburban Areas**: Higher vegetation, more distributed
- **Rural Areas**: Very high vegetation if agricultural

## Performance Tips

1. **Start Small**: Test with smaller cities first
2. **Check Dates**: Use recent dates for better data availability
3. **Monitor Resources**: Watch CPU and memory usage
4. **Stable Connection**: Ensure reliable internet for downloads

## Next Steps

After successful demo:
1. **Try Multiple Cities**: Compare vegetation across different regions
2. **Experiment with Settings**: Test various NDVI thresholds
3. **Analyze Patterns**: Look for seasonal and geographic trends
4. **Export Data**: Download results for further analysis

## Support

If you encounter issues:
1. Check the console for error messages
2. Verify Python and Node.js installations
3. Ensure all dependencies are installed
4. Try with a different city or date range 