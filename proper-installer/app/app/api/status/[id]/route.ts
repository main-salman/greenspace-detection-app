import { NextRequest, NextResponse } from 'next/server';
import { getProcessingJob, getAllProcessingJobIds } from '@/lib/processing-store';
import path from 'path';
import { promises as fs } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const processingId = params.id;
    console.log(`Status request for ID: ${processingId}`);
    console.log(`Available job IDs: ${getAllProcessingJobIds().join(', ')}`);
    
    let status = getProcessingJob(processingId);

    if (!status) {
      // Fallback: try file-backed status from output directory
      try {
        const statusPath = path.join(process.cwd(), 'public', 'outputs', processingId, 'status.json');
        const exists = await fs.access(statusPath).then(() => true).catch(() => false);
        if (exists) {
          const content = await fs.readFile(statusPath, 'utf-8');
          status = JSON.parse(content);
          console.log(`Loaded file-backed status for ${processingId}`);
        }
      } catch (e) {
        console.error('Error reading file-backed status:', e);
      }
    }

    if (!status) {
      console.log(`Processing job ${processingId} not found`);
      return NextResponse.json(
        { error: 'Processing job not found' },
        { status: 404 }
      );
    }

    console.log(`Returning status for ${processingId}:`, status);
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error getting status:', error);
    return NextResponse.json(
      { error: 'Failed to get processing status' },
      { status: 500 }
    );
  }
} 

// Allow static export builds to proceed by declaring no pre-rendered params
export function generateStaticParams() {
  return [] as { id: string }[];
}

// Ensure Node.js runtime for file system access and SSE compatibility
export const runtime = 'nodejs';
// Disable caching/static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;