import { ProcessingStatus } from '@/types';
import { safeParseDate } from './utils';

// Global processing jobs storage
// Using a module-level Map to persist across hot reloads
const globalProcessingJobs = new Map<string, ProcessingStatus>();

export function getProcessingJob(id: string): ProcessingStatus | undefined {
  return globalProcessingJobs.get(id);
}

export function setProcessingJob(id: string, status: ProcessingStatus): void {
  globalProcessingJobs.set(id, status);
}

export function updateProcessingJob(id: string, updates: Partial<ProcessingStatus>): void {
  const currentStatus = globalProcessingJobs.get(id);
  if (currentStatus) {
    const newStatus = { ...currentStatus, ...updates } as ProcessingStatus;
    // Normalize date fields defensively when updates arrive
    if (updates.startTime !== undefined) {
      const d = safeParseDate(updates.startTime as any);
      if (d) newStatus.startTime = d; // keep invalid as-is to avoid losing info
    }
    if (updates.endTime !== undefined) {
      const d = safeParseDate(updates.endTime as any);
      if (d) newStatus.endTime = d;
    }
    globalProcessingJobs.set(id, newStatus);
    console.log(`Updated status for ${id}:`, updates);
  } else {
    console.error(`Processing job ${id} not found when updating status`);
  }
}

export function getAllProcessingJobIds(): string[] {
  return Array.from(globalProcessingJobs.keys());
}

export function deleteProcessingJob(id: string): boolean {
  return globalProcessingJobs.delete(id);
}

// Cleanup old jobs (older than 24 hours)
export function cleanupOldJobs(): void {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const [id, status] of globalProcessingJobs.entries()) {
    if (status.startTime < oneDayAgo) {
      globalProcessingJobs.delete(id);
      console.log(`Cleaned up old job: ${id}`);
    }
  }
} 