import { z } from 'zod';
import { DetectionBox } from '../types';

/**
 * Normalizes inconsistent YOLO / Gemini Vision class names into canonical SafeVision labels.
 */
export function normalizePPEClass(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (s === 'no-helmet' || s === 'no-hardhat' || s === 'missing-helmet' || s === 'without-helmet') {
    return 'NO-Helmet';
  }
  if (s === 'no-vest' || s === 'missing-vest' || s === 'no-safety-vest' || s === 'without-vest') {
    return 'NO-Vest';
  }
  if (s === 'no-gloves' || s === 'missing-gloves' || s === 'no-glove' || s === 'without-gloves') {
    return 'Missing Gloves';
  }
  if (s === 'no-goggles' || s === 'missing-goggles' || s === 'no-glasses' || s === 'without-goggles') {
    return 'NO-Goggles';
  }
  if (s === 'no-mask' || s === 'missing-mask' || s === 'without-mask') {
    return 'NO-Mask';
  }
  if (s === 'hardhat' || s === 'helmet' || s === 'safety-helmet') return 'helmet';
  if (s === 'vest' || s === 'safety-vest' || s === 'hi-vis') return 'vest';
  if (s === 'gloves' || s === 'glove') return 'gloves';
  if (s === 'goggles' || s === 'safety-glasses') return 'goggles';
  if (s === 'mask' || s === 'respirator') return 'mask';
  if (s === 'person' || s === 'worker') return 'person';
  return raw.trim();
}

export function isViolationClass(className: string): boolean {
  const norm = normalizePPEClass(className).toLowerCase();
  return norm.startsWith('no-') || norm.startsWith('missing');
}

/**
 * Computes Intersection over Union (IoU) for two [x1, y1, x2, y2] bounding boxes.
 */
export function computeBBoxIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  if (interArea === 0) return 0;

  const boxAArea = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const boxBArea = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);

  const unionArea = boxAArea + boxBArea - interArea;
  return unionArea > 0 ? Math.round((interArea / unionArea) * 1000) / 1000 : 0;
}

/**
 * Computes overlap ratio of inner box (e.g. helmet) inside outer box (e.g. person).
 */
export function computeBoxOverlapRatio(
  inner: [number, number, number, number],
  outer: [number, number, number, number]
): number {
  const xA = Math.max(inner[0], outer[0]);
  const yA = Math.max(inner[1], outer[1]);
  const xB = Math.min(inner[2], outer[2]);
  const yB = Math.min(inner[3], outer[3]);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const innerArea = Math.max(1, (inner[2] - inner[0]) * (inner[3] - inner[1]));
  return Math.min(1, Math.round((interArea / innerArea) * 1000) / 1000);
}

/**
 * Parses natural-language relative time expressions ("this morning", "yesterday", "last week")
 * relative to a reference timestamp.
 */
export function parseRelativeTimeWindow(
  text: string,
  referenceDate: Date = new Date()
): { label: string; start: Date; end: Date } | null {
  const lower = text.toLowerCase();
  const end = new Date(referenceDate);

  if (lower.includes('this morning') || lower.includes('today')) {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    if (lower.includes('this morning')) {
      const morningEnd = new Date(referenceDate);
      morningEnd.setHours(12, 0, 0, 0);
      return { label: 'this morning', start, end: morningEnd };
    }
    return { label: 'today', start, end };
  }

  if (lower.includes('yesterday')) {
    const start = new Date(referenceDate);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const yEnd = new Date(start);
    yEnd.setHours(23, 59, 59, 999);
    return { label: 'yesterday', start, end: yEnd };
  }

  if (lower.includes('last week') || lower.includes('this week') || lower.includes('past 7 days')) {
    const start = new Date(referenceDate.getTime() - 7 * 24 * 3600 * 1000);
    return { label: 'last 7 days', start, end };
  }

  if (lower.includes('last month') || lower.includes('30 days')) {
    const start = new Date(referenceDate.getTime() - 30 * 24 * 3600 * 1000);
    return { label: 'last 30 days', start, end };
  }

  return null;
}

/**
 * Zod validation schemas for external inference & report API responses.
 */
export const DetectionBoxSchema = z.object({
  class_name: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const DetectionResultSchema = z.object({
  detections: z.array(DetectionBoxSchema),
  image_width: z.number().positive(),
  image_height: z.number().positive(),
  source: z.string().optional(),
  warning: z.string().optional(),
});

export const AISummaryResponseSchema = z.object({
  summary: z.string().min(10),
  recommendations: z.array(z.string()).default([]),
});

export function validateDetectionResponse(payload: unknown): {
  valid: boolean;
  data?: { detections: DetectionBox[]; image_width: number; image_height: number };
  error?: string;
} {
  const parsed = DetectionResultSchema.safeParse(payload);
  if (!parsed.success) {
    return { valid: false, error: parsed.error.message };
  }
  return { valid: true, data: parsed.data };
}
