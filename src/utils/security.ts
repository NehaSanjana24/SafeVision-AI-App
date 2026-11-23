/**
 * Security hardening utilities:
 * - Strict file upload validation (extension, size cap, magic-number byte signature check)
 * - Safe filename sanitization
 * - Batch upload limits
 */

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
export const MAX_DOC_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_BATCH_UPLOAD_FILES = 10;

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.\.+/g, '.').trim();
  return base.slice(0, 120) || 'unnamed_file';
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
}

/**
 * Inspects file header bytes (magic numbers) to validate true binary type.
 */
export async function checkMagicBytes(file: Blob): Promise<string> {
  try {
    const slice = file.slice(0, 8);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');

    if (hex.startsWith('FFD8FF')) return 'image/jpeg';
    if (hex.startsWith('89504E47')) return 'image/png';
    if (hex.startsWith('47494638')) return 'image/gif';
    if (hex.startsWith('52494646')) return 'image/webp';
    if (hex.startsWith('25504446')) return 'application/pdf';
    if (hex.startsWith('504B0304')) return 'application/zip-office'; // docx / xlsx
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function validateUploadedFile(
  file: File,
  category: 'image' | 'video' | 'document'
): Promise<FileValidationResult> {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const maxBytes =
    category === 'image'
      ? MAX_IMAGE_SIZE_BYTES
      : category === 'video'
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_DOC_SIZE_BYTES;

  if (file.size === 0) {
    return { valid: false, error: 'Uploaded file is empty (0 bytes).' };
  }

  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { valid: false, error: `File size exceeds maximum limit of ${mb} MB.` };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (category === 'image') {
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (!allowedExts.includes(ext)) {
      return { valid: false, error: `Unsupported image extension ".${ext}". Allowed: ${allowedExts.join(', ')}.` };
    }
    const magic = await checkMagicBytes(file);
    if (magic !== 'unknown' && !magic.startsWith('image/')) {
      return { valid: false, error: 'File header magic bytes do not match a valid image.' };
    }
    return { valid: true, detectedType: magic };
  }

  if (category === 'video') {
    const allowedExts = ['mp4', 'webm', 'mov', 'avi'];
    if (!allowedExts.includes(ext)) {
      return { valid: false, error: `Unsupported video extension ".${ext}".` };
    }
    return { valid: true, detectedType: file.type || 'video/mp4' };
  }

  // Document
  const allowedDocExts = ['pdf', 'docx', 'csv', 'xlsx', 'txt', 'md', 'jpg', 'jpeg', 'png'];
  if (!allowedDocExts.includes(ext)) {
    return { valid: false, error: `Unsupported document extension ".${ext}".` };
  }

  const magic = await checkMagicBytes(file);
  if (ext === 'pdf' && magic !== 'unknown' && magic !== 'application/pdf') {
    return { valid: false, error: 'PDF magic header verification failed (%PDF expected).' };
  }
  if ((ext === 'docx' || ext === 'xlsx') && magic !== 'unknown' && magic !== 'application/zip-office') {
    return { valid: false, error: `Office container signature verification failed for .${ext}.` };
  }

  return { valid: true, detectedType: magic };
}
