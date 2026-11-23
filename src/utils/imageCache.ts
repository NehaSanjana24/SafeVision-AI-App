import { DetectionResult } from '../types';

const detectionCache = new Map<string, DetectionResult>();
const MAX_CACHE_ENTRIES = 25;

/**
 * Downscales oversized images to at most maxDimension (default 1280px) before upload/inference,
 * saving network bandwidth and memory while keeping JPEG fidelity.
 */
export async function downscaleImageBlob(blob: Blob, maxDimension = 1280): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return blob;
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    if (width <= maxDimension && height <= maxDimension) {
      bitmap.close();
      return blob;
    }

    const scale = maxDimension / Math.max(width, height);
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (resized) => resolve(resized || blob),
        blob.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.88
      );
    });
  } catch {
    return blob;
  }
}

export async function computeBlobKey(blob: Blob, conf: number): Promise<string> {
  try {
    const slice = await blob.slice(0, 8192).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', slice);
    const hex = Array.from(new Uint8Array(digest))
      .slice(0, 12)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex}_${blob.size}_${conf.toFixed(2)}`;
  } catch {
    return `${blob.size}_${conf.toFixed(2)}`;
  }
}

export function getCachedDetection(key: string): DetectionResult | undefined {
  return detectionCache.get(key);
}

export function setCachedDetection(key: string, result: DetectionResult): void {
  if (detectionCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = detectionCache.keys().next().value;
    if (oldest) detectionCache.delete(oldest);
  }
  detectionCache.set(key, result);
}
