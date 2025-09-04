# 📦 Greenspace Detection App - Distribution Guide

## 🎯 GitHub-Compatible Distribution (21MB)

### For End Users

#### **Download & Install**
1. **Download**: Get `greenspace-detection-web-installer.zip` (21MB) from [GitHub Releases](your-repo-url/releases)
2. **Extract**: Unzip the file anywhere on your computer
3. **Install**: 
   - **Mac/Linux**: Run `./install.sh`
   - **Windows**: Run `install.bat`
4. **Launch**: Click the desktop shortcut created during installation

#### **System Requirements**
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.8+** - [Download](https://python.org/)
- **Internet connection** - For satellite data downloads

### For Developers

#### **Building the Web Installer**
```bash
# Create the 21MB web installer
./create-web-installer.sh

# Output: dist-web/greenspace-detection-web-installer.zip (21MB)
```

#### **Building Desktop Apps (Larger)**
```bash
# Build optimized Electron apps (~150MB)
./build-optimized.sh

# Build full-featured Electron apps (~350MB) 
./build-original.sh
```

#### **Distribution Options**

| Option | Size | GitHub Compatible | User Setup |
|--------|------|-------------------|------------|
| **Web Installer** | 21MB | ✅ YES | Automated |
| **Optimized Desktop** | 150MB | ❌ No | None |
| **Full Desktop** | 350MB | ❌ No | None |

### 🚀 Recommended Distribution Strategy

#### **Option 1: GitHub Releases (Recommended)**
1. Keep source code in main repository
2. Use GitHub Releases to distribute the 21MB web installer
3. Users download from Releases page
4. Professional installation experience

#### **Option 2: External Hosting**
1. Host larger desktop apps (150MB+) on external services
2. Provide download links in README
3. GitHub repo contains source code only

#### **Option 3: Git LFS**
1. Use Git Large File Storage for large binaries
2. Requires LFS setup for users
3. More complex but keeps everything in one repo

## 🎉 Success Metrics

✅ **21MB web installer** - 79% under GitHub's 100MB limit  
✅ **Professional installation** - Automated setup with desktop shortcuts  
✅ **Cross-platform support** - Mac, Windows, Linux  
✅ **Full functionality** - Same satellite processing capabilities as desktop apps  
✅ **Zero technical setup** - Users just download, extract, and run installer  

The **21MB web installer** provides the perfect balance of GitHub compatibility and professional user experience!
