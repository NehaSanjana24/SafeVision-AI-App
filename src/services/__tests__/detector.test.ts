import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detector } from '../detector';
import { DEFAULT_SETTINGS } from '../storage';

describe('PPE Detector Service (services/detector.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates direct violation classes and missing required PPE items', () => {
    const detections = [
      { class_name: 'person', confidence: 0.94, bbox: [10, 10, 150, 300] as [number, number, number, number] },
      { class_name: 'vest', confidence: 0.88, bbox: [30, 80, 120, 200] as [number, number, number, number] },
      { class_name: 'NO-Helmet', confidence: 0.91, bbox: [40, 15, 110, 75] as [number, number, number, number] },
    ];

    const res = detector.evaluateViolations(detections, DEFAULT_SETTINGS, {
      scanId: 'scan_1',
      fileName: 'zone_a.jpg',
      sourceType: 'image',
    });

    expect(res.totalPersons).toBe(1);
    expect(res.violations.length).toBe(1);
    expect(res.violations[0].type).toBe('NO-HELMET');
    expect(res.compliancePct).toBeLessThan(100);
  });

  it('flags missing required helmet and vest when only person box is detected', () => {
    const detections = [
      { class_name: 'person', confidence: 0.96, bbox: [20, 20, 200, 400] as [number, number, number, number] },
    ];

    const res = detector.evaluateViolations(detections, DEFAULT_SETTINGS, {
      scanId: 'scan_2',
      fileName: 'zone_b.jpg',
      sourceType: 'image',
    });

    const types = res.violations.map((v) => v.type);
    expect(types).toContain('NO-Helmet');
    expect(types).toContain('NO-Vest');
  });

  it('falls back cleanly when YOLO returns malformed schema and /api/detect/gemini returns valid result', async () => {
    const fetchMock = vi.fn()
      // 1st call: YOLOv8 endpoint returns malformed schema
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ badField: true }),
      } as any)
      // 2nd call: Gemini endpoint succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          detections: [{ class_name: 'helmet', confidence: 0.93, bbox: [10, 10, 50, 50] }],
          image_width: 640,
          image_height: 480,
          source: 'gemini-fallback',
        }),
      } as any);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {},
    });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 640;
        naturalHeight = 480;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
    );

    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    const result = await detector.detectYOLOv8(blob, 0.4, 'https://mock-yolo.local');

    expect(result.detections.length).toBe(1);
    expect(result.detections[0].class_name).toBe('helmet');
    expect(result.warning).toContain('fallback');
  });
});
