import { NextRequest } from 'next/server';
import { getProcessingJob } from '@/lib/processing-store';
import path from 'path';
import { promises as fs } from 'fs';

async function readFileBackedStatus(processingId: string) {
  try {
    const statusPath = path.join(process.cwd(), 'public', 'outputs', processingId, 'status.json');
    const exists = await fs.access(statusPath).then(() => true).catch(() => false);
    if (!exists) return undefined;
    const content = await fs.readFile(statusPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function toSSE(data: any) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `data: ${payload}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const processingId = params.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastSent = '';

      async function snapshot() {
        const inMemory = getProcessingJob(processingId);
        const fileStatus = await readFileBackedStatus(processingId);
        return inMemory || fileStatus || null;
      }

      async function send(data: any) {
        const payload = JSON.stringify(data);
        if (payload !== lastSent) {
          lastSent = payload;
          controller.enqueue(encoder.encode(toSSE(payload)));
        }
      }

      // Send initial event
      const initial = await snapshot();
      if (initial) await send(initial);
      else controller.enqueue(encoder.encode(': waiting for status\n\n'));

      const interval = setInterval(async () => {
        try {
          const s = await snapshot();
          if (s) {
            await send(s);
            if (s.status === 'completed' || s.status === 'failed') {
              controller.enqueue(encoder.encode(': closing\n\n'));
              clearInterval(interval);
              controller.close();
            }
          } else {
            controller.enqueue(encoder.encode(': no-status\n\n'));
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`: error ${String(e)}\n\n`));
        }
      }, 1500);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Allow static export builds to proceed by declaring no pre-rendered params
export function generateStaticParams() {
  return [] as { id: string }[];
}

// Force Node.js runtime for SSE streaming
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;



