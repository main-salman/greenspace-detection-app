import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file');

    if (!filePath) {
      return NextResponse.json(
        { error: 'File parameter is required' },
        { status: 400 }
      );
    }

    // Security check: ensure file is within public directory
    const fullPath = path.join(process.cwd(), 'public', filePath);
    const publicDir = path.join(process.cwd(), 'public');
    
    if (!fullPath.startsWith(publicDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const ext = path.extname(fullPath).toLowerCase();
    
    // For TIFF files, convert to PNG for web preview
    if (ext === '.tif' || ext === '.tiff') {
      try {
        const imageBuffer = await sharp(fullPath)
          .png()
          .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
        
        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      } catch (error) {
        console.error('Error converting TIFF:', error);
        // Fallback to direct file serving
      }
    }

    // For other image formats, serve directly with optional resizing
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      try {
        const imageBuffer = await sharp(fullPath)
          .resize(1200, 900, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
        
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
        
        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }

    // Fallback: serve file directly
    const fileBuffer = await fs.readFile(fullPath);
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.png': contentType = 'image/png'; break;
      case '.jpg':
      case '.jpeg': contentType = 'image/jpeg'; break;
      case '.tif':
      case '.tiff': contentType = 'image/tiff'; break;
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error previewing file:', error);
    return NextResponse.json(
      { error: 'Failed to preview file' },
      { status: 500 }
    );
  }
} 