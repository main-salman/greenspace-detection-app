#!/bin/bash

# Create basic app icons for Greenspace Detection App
echo "🎨 Creating app icons..."

# Create a simple SVG icon
cat > electron/icons/icon.svg << 'EOF'
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="#4CAF50" stroke="#2E7D32" stroke-width="8"/>
  
  <!-- Earth/Globe representation -->
  <circle cx="256" cy="256" r="180" fill="#81C784" stroke="#388E3C" stroke-width="4"/>
  
  <!-- Vegetation/leaves -->
  <path d="M200 180 Q220 160 240 180 Q260 160 280 180 Q300 160 320 180" 
        stroke="#2E7D32" stroke-width="6" fill="none"/>
  <path d="M180 220 Q200 200 220 220 Q240 200 260 220 Q280 200 300 220 Q320 200 340 220" 
        stroke="#2E7D32" stroke-width="6" fill="none"/>
  <path d="M200 260 Q220 240 240 260 Q260 240 280 260 Q300 240 320 260" 
        stroke="#2E7D32" stroke-width="6" fill="none"/>
  
  <!-- Satellite representation -->
  <rect x="340" y="120" width="40" height="20" fill="#FFC107" rx="4"/>
  <path d="M320 130 L340 130 M380 130 L400 130" stroke="#FFC107" stroke-width="3"/>
  <path d="M360 100 L360 120 M360 140 L360 160" stroke="#FFC107" stroke-width="3"/>
  
  <!-- Title text -->
  <text x="256" y="380" font-family="Arial, sans-serif" font-size="32" font-weight="bold" 
        text-anchor="middle" fill="#1B5E20">GREENSPACE</text>
  <text x="256" y="420" font-family="Arial, sans-serif" font-size="24" 
        text-anchor="middle" fill="#2E7D32">DETECTION</text>
</svg>
EOF

# Create PNG version (if ImageMagick is available)
if command -v convert &> /dev/null; then
    echo "Converting SVG to PNG formats..."
    convert electron/icons/icon.svg -resize 512x512 electron/icons/icon.png
    convert electron/icons/icon.svg -resize 256x256 electron/icons/icon-256.png
    convert electron/icons/icon.svg -resize 128x128 electron/icons/icon-128.png
    convert electron/icons/icon.svg -resize 64x64 electron/icons/icon-64.png
    convert electron/icons/icon.svg -resize 32x32 electron/icons/icon-32.png
    convert electron/icons/icon.svg -resize 16x16 electron/icons/icon-16.png
    
    # Create ICO for Windows (if available)
    if command -v magick &> /dev/null; then
        magick electron/icons/icon.png electron/icons/icon-256.png electron/icons/icon-128.png \
               electron/icons/icon-64.png electron/icons/icon-32.png electron/icons/icon-16.png \
               electron/icons/icon.ico
    fi
    
    # Create ICNS for macOS (if iconutil is available - macOS only)
    if command -v iconutil &> /dev/null; then
        mkdir -p electron/icons/icon.iconset
        convert electron/icons/icon.svg -resize 16x16 electron/icons/icon.iconset/icon_16x16.png
        convert electron/icons/icon.svg -resize 32x32 electron/icons/icon.iconset/icon_16x16@2x.png
        convert electron/icons/icon.svg -resize 32x32 electron/icons/icon.iconset/icon_32x32.png
        convert electron/icons/icon.svg -resize 64x64 electron/icons/icon.iconset/icon_32x32@2x.png
        convert electron/icons/icon.svg -resize 128x128 electron/icons/icon.iconset/icon_128x128.png
        convert electron/icons/icon.svg -resize 256x256 electron/icons/icon.iconset/icon_128x128@2x.png
        convert electron/icons/icon.svg -resize 256x256 electron/icons/icon.iconset/icon_256x256.png
        convert electron/icons/icon.svg -resize 512x512 electron/icons/icon.iconset/icon_256x256@2x.png
        convert electron/icons/icon.svg -resize 512x512 electron/icons/icon.iconset/icon_512x512.png
        convert electron/icons/icon.svg -resize 1024x1024 electron/icons/icon.iconset/icon_512x512@2x.png
        
        iconutil -c icns electron/icons/icon.iconset -o electron/icons/icon.icns
        rm -rf electron/icons/icon.iconset
    fi
    
    echo "✅ Icons created successfully!"
else
    echo "⚠️  ImageMagick not found. Creating placeholder files..."
    # Create placeholder files
    touch electron/icons/icon.png
    touch electron/icons/icon.ico
    touch electron/icons/icon.icns
    
    echo "📝 To create proper icons:"
    echo "1. Install ImageMagick: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)"
    echo "2. Run this script again"
    echo "3. Or manually replace the files in electron/icons/ with proper icon files"
fi

echo "🎨 Icon creation completed!"
