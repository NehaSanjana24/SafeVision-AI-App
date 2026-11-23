import { computeIntelligenceBundle, WorkerAnalyticsRequest } from '../workers/analytics.worker';

export const WORKER_THRESHOLD_RECORDS = 5000;

/**
 * Offloads heavy analytics aggregation to a dedicated Web Worker whenever stored
 * scans + violations exceed 5,000 records, otherwise computes synchronously without worker overhead.
 */
export async function computeIntelligenceOffloaded(
  payload: WorkerAnalyticsRequest
): Promise<ReturnType<typeof computeIntelligenceBundle> & { usedWorker: boolean }> {
  const totalRecords = payload.scans.length + payload.violations.length;

  if (totalRecords > WORKER_THRESHOLD_RECORDS && typeof Worker !== 'undefined') {
    try {
      const result = await new Promise<ReturnType<typeof computeIntelligenceBundle>>((resolve, reject) => {
        const worker = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), {
          type: 'module',
        });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('Analytics worker timed out'));
        }, 12000);

        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(event.data);
        };

        worker.onerror = (err) => {
          clearTimeout(timer);
          worker.terminate();
          reject(err);
        };

        worker.postMessage(payload);
      });
      return { ...result, usedWorker: true };
    } catch {
      // Graceful fallback to synchronous computation
    }
  }

  return { ...computeIntelligenceBundle(payload), usedWorker: false };
}
