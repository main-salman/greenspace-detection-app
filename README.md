# 🌱 Greenspace Detection App

A professional desktop application for analyzing satellite imagery to detect and visualize vegetation in cities worldwide using NDVI (Normalized Difference Vegetation Index) analysis.

## 🚀 Quick Start (Clone & Run)

Use the one-click scripts to install everything and launch the app.

### macOS
```bash
git clone https://github.com/main-salman/greenspace-detection-app.git
cd greenspace-detection-app
chmod +x ./run-app-mac.sh
./run-app-mac.sh
```
This will:
- Install Node dependencies
- Create a Python virtual environment and install `python_scripts/requirements.txt`
- Start the Next.js dev server and open `http://localhost:3000`

### Windows
```bat
git clone https://github.com/main-salman/greenspace-detection-app.git
cd greenspace-detection-app
run-app-windows.bat
```

### Manual (if you prefer)
```bash
npm install
python3 -m venv venv && source venv/bin/activate  # Windows: python -m venv venv && venv\Scripts\activate
pip install -r python_scripts/requirements.txt
npm run dev
# open http://localhost:3000
```

Troubleshooting:
- If Python packages are missing, run: `pip install -r python_scripts/requirements.txt`.
- To stop the background server started by scripts: `kill $(cat .dev_pid) && rm -f .dev_pid` (macOS) or close the dev window / kill the PID in `.dev_pid` (Windows).

## Features

- **🏙️ City Selection**: Choose from 50+ cities worldwide with predefined boundaries
- **🛰️ Satellite Data Processing**: Automated download and processing of Sentinel-1 and Sentinel-2 imagery
- **☁️ Cloud Removal**: Advanced cloud detection and removal algorithms
- **🌿 Vegetation Analysis**: Configurable NDVI thresholds for vegetation detection
- **🎨 Visualization**: False color infrared images with vegetation highlighting
- **📊 Real-time Progress**: Live updates during processing with detailed status tracking
- **📈 Analytics**: Comprehensive vegetation coverage statistics and insights
- **🖥️ Desktop Application**: Native desktop app for Mac and Windows (no browser required)

## 🔬 Scientific Methodology

This app follows the same scientific approach described in the Greenspace Detection Platform, adapted for local development and an API-key-free workflow.

### 🛰️ Satellite Data & Quality
- Source: Sentinel-2 Level-2A (surface reflectance)
- Access: Microsoft Planetary Computer STAC endpoint (public)
- Resolution: 10m per pixel (RGB + NIR)
- Quality control: Cloud and shadow masking; water exclusion

### 🌿 NDVI Calculation

Normalized Difference Vegetation Index:

```text
NDVI = (NIR - Red) / (NIR + Red)
```

Baseline thresholds and enhanced sensitivity used for classification:

```text
enhanced_threshold = max(0.2, base_threshold - 0.05)
high_density       = NDVI >= 0.55
medium_density     = 0.35 <= NDVI < 0.55
low_density        = 0.25 <= NDVI < 0.35
subtle_vegetation  = 0.15 <= NDVI < 0.25
```

### 📅 Temporal Analysis (Annual)
Selects the best low‑cloud scene per month and averages vegetation across months. As of 2025‑10‑08, the annual comparison methodology was improved to avoid bias from failed/over‑cloudy months (details below).

```text
for month in 1..12:
  scene = select_best_scene(year, month, cloud_threshold=20%)
  ndvi  = calculate_ndvi(scene.red, scene.nir)
  veg%  = vegetation_percentage(ndvi, city_polygon)
  monthly_results.append(veg%)

annual_vegetation = average(monthly_results)
```

### 🔁 Change Analysis (Baseline vs Comparison)
Uses the same temporal method for both years to ensure apples‑to‑apples comparisons:

```text
baseline_composite  = annual_composite(baseline_year)   # avg of 12 months
comparison_composite = annual_composite(comparison_year)

vegetation_gain   = (comparison_composite >= 0.3) & ~(baseline_composite >= 0.3)
vegetation_loss   = (baseline_composite >= 0.3) & ~(comparison_composite >= 0.3)
stable_vegetation = (baseline_composite >= 0.3) & (comparison_composite >= 0.3)
```

Guaranteed equation balance (mathematical consistency):

```text
final_vegetation_% = baseline_vegetation_% - loss_% + gain_%
```

### ✅ Annual Comparison Methodology Update (2025‑10‑08)

In batch (multi‑city) mode, we now compute annual averages and percent change using only valid months and optional cloud filtering:

- **Valid‑month averaging**: Months that fail to process no longer count as 0%. We average only over months that produced a valid vegetation result.
- **Cloud filtering (optional)**: Months with excessive cloud/shadow/water masking are excluded from the annual average if their cloud‑excluded share exceeds a threshold (default 80%).
- **Minimum months requirement**: Percent change is computed only if both years have at least a minimum number of valid months (default 3). Otherwise, the UI warns that data is insufficient.
- **Diagnostics surfaced**: The summary table shows month counts next to baseline/compare values (e.g., "10.1% 7 mo") and displays a banner when months are below the minimum.

Environment variables (server‑side) control these behaviors:

```bash
# Exclude months where cloud_excluded_percentage > this value (percent)
GREENSPACE_MAX_CLOUD_FOR_AVG=80

# Require at least this many valid months in each year to compute percent change
GREENSPACE_MIN_VALID_MONTHS=3
```

Rationale: Previously, failed months were averaged as zeros, which could depress baselines (e.g., 2020) and inflate the reported change. The updated approach yields more robust, interpretable annual comparisons.

### 🎯 Geographic Precision & CRS
- Input: WGS84 (EPSG:4326) city polygons
- Processing: UTM zone chosen by city latitude/longitude for metric accuracy
- Output: WGS84 for web mapping
- Alignment: Validates satellite bounds to match city polygon; sub‑pixel accuracy targeted

### 🧭 Boundary Processing
- Boundary source: OpenStreetMap (Nominatim/Overpass)
- Format: GeoJSON polygon; validated against satellite coverage
- Statistics and overlays are masked to the exact city polygon (not a rectangle)

### 📡 STAC Integration
- Public, no‑auth access to Sentinel‑2 via Microsoft Planetary Computer
- Cloud filtering at scene‑level; per‑pixel SCL masking during processing

These methods mirror the platform write‑up and are optimized for reliability and clarity in this app.

## 📦 Installation Options

### Option 1: Desktop Application (Recommended for End Users)

#### **For Mac Users** 🍎

1. **Download the installer:**
   - Download `greenspace-detection-web-installer.zip` (132KB) from [GitHub](../../tree/main/dist-web)

2. **Install (Super Easy!):**
   ```bash
   # Extract the installer
   unzip greenspace-detection-web-installer.zip
   
   # Double-click install.command (no Terminal needed!)
   # Or for advanced users: ./install.sh
   ```

3. **Launch:**
   - Click the "Greenspace Detection" icon on your desktop, or
   - Run from Applications folder

#### **For Windows Users** 🪟

1. **Download the installer:**
   - Download `greenspace-detection-web-installer.zip` (39MB) from [GitHub Releases](../../releases)

2. **Install:**
   ```cmd
   # Extract the installer to a folder
   # Right-click → Extract All → Choose destination
   
   # Open Command Prompt in the extracted folder
   # Run the installation script
   install.bat
   ```

3. **Launch:**
   - Click the "Greenspace Detection" desktop shortcut, or
   - Run from Start Menu

#### **What the Desktop Installer Does:**
- ✅ **Checks system requirements** (Node.js, Python)
- ✅ **Installs missing dependencies** automatically
- ✅ **Sets up Python environment** with required packages
- ✅ **Creates desktop shortcuts** for easy access
- ✅ **Configures the application** for optimal performance
- ✅ **Launches native desktop window** (no browser needed)

### Option 2: Development Setup (For Developers)

#### **Prerequisites**
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.8+** - [Download](https://python.org/)
- **GDAL** - Required for satellite image processing

#### **Development Installation**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/main-salman/greenspace-detection-app.git
   cd greenspace-detection-app
   ```

2. **Run the setup script:**
   
   **Mac/Linux:**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```
   
   **Windows:**
   ```cmd
   # Install Node.js dependencies
   npm install
   
   # Create Python virtual environment
   python -m venv venv
   venv\Scripts\activate
   
   # Install Python dependencies
   pip install -r python_scripts\requirements.txt
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 💻 System Requirements

### **Minimum Requirements:**
- **Operating System**: macOS 10.15+, Windows 10+, or Linux
- **Memory (RAM)**: 8GB minimum, 16GB recommended
- **Storage**: 2GB free space (for application and temporary processing files)
- **Internet**: Broadband connection (for satellite data downloads)
- **Node.js**: Version 18.0 or higher
- **Python**: Version 3.8 or higher

### **Recommended for Optimal Performance:**
- **Memory (RAM)**: 32GB for processing large cities
- **Storage**: 10GB+ free space for multiple processing sessions
- **CPU**: Multi-core processor (8+ cores recommended)
- **Internet**: High-speed connection for faster satellite data downloads

## 🛠️ Troubleshooting

### **Common Issues:**

#### **"Python environment not ready"** 
- **Solution**: Run the installer script again: `./install.sh` (Mac) or `install.bat` (Windows)
- **Alternative**: Manually install Python dependencies:
  ```bash
  pip install -r python_scripts/requirements.txt
  ```

#### **"Could not find a production build"**
- **Solution**: The app is trying to run in production mode without a build
- **Fix**: Use development mode or build first:
  ```bash
  npm run dev  # Development mode
  # OR
  npm run build && npm start  # Production mode
  ```

#### **"Module not found" errors**
- **Solution**: Reinstall dependencies:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

#### **Satellite data download fails**
- **Check**: Internet connection and firewall settings
- **Try**: Different time periods or smaller geographic areas
- **Note**: Some regions may have limited satellite coverage

### **Getting Help:**
- **Issues**: Report bugs on [GitHub Issues](../../issues)
- **Documentation**: Check the [DISTRIBUTION.md](DISTRIBUTION.md) guide
- **Logs**: Check console output for detailed error messages

## 🖥️ Desktop Application

### Building Standalone Desktop Apps

The application can be packaged as standalone desktop applications for macOS and Windows, eliminating the need for browser access or manual server setup.

#### Prerequisites for Desktop Build
- **Node.js 18+** and **Python 3.8+** (same as web version)
- **ImageMagick** (optional, for creating app icons): `brew install imagemagick` (macOS)

#### Build Desktop Applications

1. **Optimized Desktop Build:**
   ```bash
   ./build-optimized.sh
   ```
   - Creates 146-160MB DMG installers
   - Professional native desktop applications

2. **Web-Based Installer (GitHub Distribution):**
   ```bash
   ./create-web-installer.sh
   ```
   - Creates 39MB web installer (GitHub-compatible)
   - Downloads dependencies on first run

3. **Test Desktop App (Development):**
   ```bash
   npm run electron
   ```

#### What the Build Process Does

1. **Creates Python Executables**: Uses PyInstaller to create standalone Python executables
2. **Builds Next.js App**: Optimizes the web interface for desktop packaging
3. **Packages with Electron**: Bundles everything into native desktop applications
4. **Generates Installers**: Creates DMG files for macOS and EXE installers for Windows

#### Generated Files

**Optimized Build** (`./build-optimized.sh`):
- **macOS Intel**: `dist/Greenspace Detection-0.1.0.dmg` (160MB)
- **macOS Apple Silicon**: `dist/Greenspace Detection-0.1.0-arm64.dmg` (146MB)
- **Windows**: `dist/Greenspace Detection Setup 0.1.0.exe` (planned)

**Web Installer** (`./create-web-installer.sh`):
- **All Platforms**: `dist-web/greenspace-detection-web-installer.zip` (39MB)

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
