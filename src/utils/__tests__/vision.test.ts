import { describe, it, expect } from 'vitest';
import {
  normalizePPEClass,
  isViolationClass,
  computeBBoxIoU,
  parseRelativeTimeWindow,
  validateDetectionResponse,
} from '../vision';
import { validateUploadedFile, sanitizeFilename } from '../security';
import { redactSecrets } from '../logger';

describe('Vision, Security & Logger Utilities', () => {
  it('normalizes inconsistent YOLO / Gemini PPE class names', () => {
    expect(normalizePPEClass('no_hardhat')).toBe('NO-Helmet');
    expect(normalizePPEClass('without helmet')).toBe('NO-Helmet');
    expect(normalizePPEClass('no-safety-vest')).toBe('NO-Vest');
    expect(normalizePPEClass('missing-gloves')).toBe('Missing Gloves');
    expect(normalizePPEClass('hardhat')).toBe('helmet');
    expect(normalizePPEClass('hi-vis')).toBe('vest');
  });

  it('identifies violation classes accurately', () => {
    expect(isViolationClass('NO-Helmet')).toBe(true);
    expect(isViolationClass('missing-gloves')).toBe(true);
    expect(isViolationClass('helmet')).toBe(false);
    expect(isViolationClass('person')).toBe(false);
  });

  it('computes accurate bounding-box IoU', () => {
    expect(computeBBoxIoU([0, 0, 100, 100], [0, 0, 100, 100])).toBe(1);
    expect(computeBBoxIoU([0, 0, 50, 50], [100, 100, 150, 150])).toBe(0);
    // 50x50 overlap over (100x100 + 100x100 - 2500) = 2500 / 17500 ≈ 0.143
    expect(computeBBoxIoU([0, 0, 100, 100], [50, 50, 150, 150])).toBeCloseTo(0.143, 2);
  });

  it('parses natural-language relative time windows', () => {
    const ref = new Date('2026-04-10T14:30:00Z');
    const morning = parseRelativeTimeWindow('violations this morning', ref);
    expect(morning?.label).toBe('this morning');
    expect(morning?.start.getHours()).toBe(0);
    expect(morning?.end.getHours()).toBe(12);

    const week = parseRelativeTimeWindow('summary for past 7 days', ref);
    expect(week?.label).toBe('last 7 days');
    expect(week).not.toBeNull();
    if (week) {
      expect(week.end.getTime() - week.start.getTime()).toBe(7 * 24 * 3600 * 1000);
    }
  });

  it('validates external inference payloads with Zod', () => {
    const valid = validateDetectionResponse({
      detections: [{ class_name: 'NO-Helmet', confidence: 0.91, bbox: [10, 20, 110, 120] }],
      image_width: 800,
      image_height: 600,
    });
    expect(valid.valid).toBe(true);

    const invalid = validateDetectionResponse({
      detections: [{ class_name: 'NO-Helmet', confidence: 1.8, bbox: [10, 20] }],
      image_width: -10,
    });
    expect(invalid.valid).toBe(false);
  });

  it('validates file uploads, sanitizes filenames, and checks magic bytes', async () => {
    expect(sanitizeFilename('../../../etc/passwd?bad*name.pdf')).toBe('._._._etc_passwd_bad_name.pdf');

    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
    const emptyRes = await validateUploadedFile(emptyFile, 'image');
    expect(emptyRes.valid).toBe(false);

    const badExt = new File(['hello'], 'payload.exe', { type: 'application/octet-stream' });
    const badRes = await validateUploadedFile(badExt, 'document');
    expect(badRes.valid).toBe(false);

    // Valid JPEG magic header (FFD8FF)
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validJpg = new File([jpegBytes], 'site.jpg', { type: 'image/jpeg' });
    const okRes = await validateUploadedFile(validJpg, 'image');
    expect(okRes.valid).toBe(true);
    expect(okRes.detectedType).toBe('image/jpeg');

    // Spoofed PDF extension with PNG bytes
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const spoofedPdf = new File([pngBytes], 'manual.pdf', { type: 'application/pdf' });
    const spoofRes = await validateUploadedFile(spoofedPdf, 'document');
    expect(spoofRes.valid).toBe(false);
  });

  it('redacts API keys, Bearer tokens, and credentials in logs', () => {
    const sample = 'Error connecting with AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123 and Bearer my.jwt.token password="secret123"';
    const redacted = redactSecrets(sample);
    expect(redacted).not.toContain('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123');
    expect(redacted).not.toContain('my.jwt.token');
    expect(redacted).not.toContain('secret123');
    expect(redacted).toContain('[REDACTED_SECRET]');
    expect(redacted).toContain('Bearer [REDACTED]');
  });
});
