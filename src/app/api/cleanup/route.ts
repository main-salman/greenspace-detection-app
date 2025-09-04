import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Cleans up old output directories to prevent disk space accumulation.
 * Removes all directories in /public/outputs/ that are older than the specified age.
 * @param maxAgeHours - Maximum age in hours before deletion (default: 0 hours = immediate cleanup)
 * @param outputsPath - Path to outputs directory (default: public/outputs)
 * @returns Promise<{ deletedCount: number, errors: string[] }>
 */
async function cleanupOldOutputs(
  maxAgeHours: number = 0,
  outputsPath?: string
): Promise<{ deletedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let deletedCount = 0;

  try {
    const outputsDir = outputsPath || path.join(process.cwd(), 'public', 'outputs');
    
    // Check if outputs directory exists
    try {
      await fs.access(outputsDir);
    } catch {
      console.log('Outputs directory does not exist, skipping cleanup');
      return { deletedCount: 0, errors: [] };
    }

    const entries = await fs.readdir(outputsDir, { withFileTypes: true });
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(outputsDir, entry.name);
        
        try {
          const stats = await fs.stat(dirPath);
          
          // Delete directories older than the cutoff time
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.rm(dirPath, { recursive: true, force: true });
            deletedCount++;
            console.log(`Cleaned up old output directory: ${entry.name}`);
          }
        } catch (error) {
          const errorMsg = `Failed to process directory ${entry.name}: ${error}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
    }

    console.log(`Cleanup completed. Deleted ${deletedCount} old output directories.`);
    return { deletedCount, errors };

  } catch (error) {
    const errorMsg = `Failed to cleanup outputs directory: ${error}`;
    errors.push(errorMsg);
    console.error(errorMsg);
    return { deletedCount, errors };
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const maxAgeHours = parseInt(url.searchParams.get('maxAgeHours') || '0');
    
    console.log(`Starting cleanup of old output directories (older than ${maxAgeHours} hours)...`);
    const result = await cleanupOldOutputs(maxAgeHours);
    
    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      errors: result.errors,
      message: `Successfully cleaned up ${result.deletedCount} old output directories`
    });
  } catch (error) {
    console.error('Cleanup API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup old outputs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also allow GET for manual cleanup trigger
export async function GET(request: Request) {
  return POST(request);
}
