# 🌱 Greenspace Detection Web App

A Next.js web application for analyzing satellite imagery to detect and visualize vegetation in cities worldwide using NDVI (Normalized Difference Vegetation Index) analysis.

## Features

- **🏙️ City Selection**: Choose from 50+ cities worldwide with predefined boundaries
- **🛰️ Satellite Data Processing**: Automated download and processing of Sentinel-1 and Sentinel-2 imagery
- **☁️ Cloud Removal**: Advanced cloud detection and removal algorithms
- **🌿 Vegetation Analysis**: Configurable NDVI thresholds for vegetation detection
- **🎨 Visualization**: False color infrared images with vegetation highlighting
- **📊 Real-time Progress**: Live updates during processing with detailed status tracking
- **📈 Analytics**: Comprehensive vegetation coverage statistics and insights

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.8+** - [Download](https://python.org/)
- **GDAL** - Required for satellite image processing

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd greenspace-detection-app
   ```

2. **Run the setup script:**
   ```bash
   ./setup.sh
   ```
   
   Or manually:
   ```bash
   # Install Node.js dependencies
   npm install
   
   # Create Python virtual environment
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install Python dependencies
   pip install -r python_scripts/requirements.txt
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🖥️ Desktop Application

### Building Standalone Desktop Apps

The application can be packaged as standalone desktop applications for macOS and Windows, eliminating the need for browser access or manual server setup.

#### Prerequisites for Desktop Build
- **Node.js 18+** and **Python 3.8+** (same as web version)
- **ImageMagick** (optional, for creating app icons): `brew install imagemagick` (macOS)

#### Build Desktop Applications

1. **Quick Build (Current Platform):**
   ```bash
   ./build.sh
   ```

2. **Test Desktop App (Development):**
   ```bash
   ./test-electron.sh
   ```

#### What the Build Process Does

1. **Creates Python Executables**: Uses PyInstaller to create standalone Python executables
2. **Builds Next.js App**: Optimizes the web interface for desktop packaging
3. **Packages with Electron**: Bundles everything into native desktop applications
4. **Generates Installers**: Creates DMG files for macOS and EXE installers for Windows

#### Generated Files

After running `./build.sh`, you'll find:
- **macOS**: `dist/Greenspace Detection-*.dmg` 
- **Windows**: `dist/Greenspace Detection Setup *.exe`
- **Linux**: `dist/Greenspace Detection-*.AppImage`

#### Desktop App Features

✅ **No Browser Required**: Runs in its own native window  
✅ **No Manual Setup**: All dependencies bundled  
✅ **Offline Capable**: Works without internet (except for satellite data downloads)  
✅ **Native Look**: Integrates with OS window management  
✅ **Auto-Updates**: Can be configured for automatic updates  
✅ **File Associations**: Can be set to open specific file types  

#### Installation

- **macOS**: Double-click the DMG file and drag to Applications
- **Windows**: Run the EXE installer and follow the setup wizard
- **Linux**: Make the AppImage executable and run it

#### Development Commands

```bash
# Test Electron app in development
npm run electron

# Build for current platform only
npm run electron:dist

# Build desktop apps (all platforms)
./build.sh
```

## Technology Stack

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **React Hooks** for state management

### Backend
- **Next.js API Routes** for RESTful endpoints
- **Python Scripts** for satellite data processing
- **Sharp** for image processing and format conversion

### Python Processing Pipeline
- **rasterio** for geospatial raster processing
- **STAC Client** for satellite data discovery
- **OpenCV** for image processing
- **NumPy** for numerical computations
- **Shapely** for geometric operations

## Installation

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd greenspace-app
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Install Python Dependencies
```bash
cd python_scripts
pip install -r requirements.txt
cd ..
```

### 4. Environment Setup
Make sure Python 3 is available as `python3` in your system PATH.

## Usage

### 1. Start the Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### 2. Select a City
- Use the search bar to find cities
- Filter by country
- Click on a city to select it

### 3. Configure Processing Parameters
- **Start/End Month**: Time period for satellite data
- **NDVI Threshold**: Sensitivity for vegetation detection (0.0 - 1.0)
- **Cloud Coverage**: Maximum acceptable cloud coverage percentage
- **Advanced Options**: Enable additional vegetation indices and processing features

### 4. Start Processing
Click "🚀 Start Processing" to begin the analysis. The process includes:
1. **Downloading** satellite images from AWS/STAC
2. **Preprocessing** cloud removal and image compositing  
3. **Processing** NDVI calculation and vegetation highlighting

### 5. View Results
- **Statistics**: Vegetation coverage percentage and analysis metrics
- **Visualizations**: False color infrared images with vegetation highlighting
- **Downloads**: Access processed images and data files

## API Endpoints

### POST `/api/process`
Start a new processing job.

**Request Body:**
```json
{
  "city": { /* City object */ },
  "startMonth": "2024-06",
  "endMonth": "2024-07", 
  "ndviThreshold": 0.2,
  "cloudCoverageThreshold": 30,
  "enableVegetationIndices": true,
  "enableAdvancedCloudDetection": false
}
```

**Response:**
```json
{
  "processingId": "uuid"
}
```

### GET `/api/status/[id]`
Get processing status and progress.

**Response:**
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 75,
  "message": "Calculating NDVI...",
  "startTime": "2024-01-01T00:00:00Z",
  "result": {
    "downloadedImages": 15,
    "processedComposites": 3,
    "vegetationPercentage": 45.2,
    "outputFiles": ["path/to/file1.png"]
  }
}
```

### GET `/api/download?file=path`
Download processed files.

### GET `/api/preview?file=path`
Preview images with automatic format conversion for web display.

## Configuration

### Processing Configuration
The application supports various processing configurations:

- **Date Range**: Monthly time periods for satellite data acquisition
- **NDVI Threshold**: 0.0 (no vegetation) to 1.0 (dense vegetation)
- **Cloud Coverage**: 0-100% maximum acceptable cloud coverage
- **Vegetation Indices**: Enable additional indices (EVI, GNDVI, BSI, MSAVI2)
- **Cloud Detection**: Basic or advanced cloud detection algorithms

### City Data
Cities are defined in the repository root `cities.json` and served via the app API at `/api/cities` with:
- Geographic boundaries (GeoJSON polygons)
- Coordinate information
- Administrative details

## Processing Pipeline

### 1. Data Discovery
- Query STAC catalogs for Sentinel-2 L2A imagery (10 m)
- Filter by date range, location, and cloud coverage (scene-level)
- Select optimal images for processing (best available per month)

### 2. Download & Preprocessing  
- Download essential spectral bands (B02, B03, B04, B08, B11, SCL)
- Resample bands to consistent 10m resolution
- Apply radiometric corrections

### 3. Cloud Detection & Removal
- Use Scene Classification Layer (SCL) per-pixel masking for clouds, shadows, water (exclude SCL classes 0,1,3,6,8,9,10,11)
- Scene-level cloud limit to fetch candidates; per-pixel SCL enforces quality during analysis
- Monthly median compositing from valid pixels when multiple items available

### 4. Vegetation Analysis
- Calculate NDVI from red (B04) and NIR (B08) bands
- Apply configurable NDVI thresholds and report multiple density ranges (low/medium/high)
- Exclude water pixels via SCL (class 6) in all statistics
- Compute percent change vs 2020 baseline: if the selected year != 2020, compute vegetation % for the same month(s) in 2020 and report ((current-2020)/2020)*100

### 5. Visualization
- Create false color infrared composites
- Apply vegetation highlighting with transparency
- Generate web-optimized output formats

## File Structure

```
greenspace-app/
├── src/
│   ├── app/
│   │   ├── api/          # API routes
│   │   │   ├── process/  # Start processing
│   │   │   ├── status/   # Get status  
│   │   │   ├── download/ # Download files
│   │   │   └── preview/  # Preview images
│   │   └── page.tsx      # Main application page
│   ├── components/       # React components
│   │   ├── CitySelector.tsx
│   │   ├── ConfigurationPanel.tsx
│   │   ├── ProcessingPanel.tsx
│   │   └── ResultsPanel.tsx
│   └── types/           # TypeScript definitions
├── python_scripts/     # Python processing pipeline
│   ├── download_satellite_images.py
│   ├── preprocess_satellite_images.py
│   ├── vegetation_highlighter.py
│   └── requirements.txt
├── public/
│   ├── cities.json     # City data
│   └── outputs/        # Generated processing outputs
└── README.md
```

## Troubleshooting

### Common Issues

**Python Dependencies**
```bash
# Install missing packages
pip install rasterio numpy opencv-python shapely pystac-client

# On macOS, you might need:
brew install gdal
```

**Memory Issues**
- Large satellite images require significant RAM
- Consider reducing processing area or image count
- Monitor system resources during processing

**Network Issues**
- Satellite data downloads require stable internet
- Some regions may have slower STAC API access
- Processing will retry failed downloads automatically

### Performance Optimization

- **Concurrent Processing**: Adjust worker counts based on system capabilities
- **Image Downsampling**: Enable for faster processing of large areas
- **Band Selection**: Process only essential spectral bands
- **Caching**: Processed composites are cached for reuse

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgments

- **Sentinel Data**: European Space Agency Copernicus Programme
- **STAC**: SpatioTemporal Asset Catalog ecosystem
- **Element 84**: Earth Search STAC API
- **UN**: Sustainable Development Goals inspiration
