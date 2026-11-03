import { Size } from './bbox-geometry';

/** The API accepts up to 15 MB. Files above this size are always re-encoded, whatever their pixel size. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/**
 * Long side of the photo sent to the server. The inference service works on a reduced image
 * anyway, and smaller uploads are much faster on mobile networks.
 */
export const MAX_UPLOAD_EDGE = 2048;
export const UPLOAD_JPEG_QUALITY = 0.9;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type UploadCheck = { ok: true } | { ok: false; message: string };

export function checkImageFile(file: Pick<File, 'type' | 'size'>): UploadCheck {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG or WebP photo.' };
  }
  return { ok: true };
}

/**
 * Target size when a photo should be shrunk; null when it can be sent as is. A photo is resized
 * when its long side exceeds the maximum edge. Already-small images are never upscaled, and
 * images small enough in both pixels and bytes are left untouched.
 */
export function downscaleTarget(file: Pick<File, 'size'>, image: Size): Size | null {
  const longest = Math.max(image.width, image.height);
  if (longest <= MAX_UPLOAD_EDGE) {
    return file.size > MAX_UPLOAD_BYTES ? { width: image.width, height: image.height } : null;
  }
  const ratio = MAX_UPLOAD_EDGE / longest;
  return {
    width: Math.max(1, Math.round(image.width * ratio)),
    height: Math.max(1, Math.round(image.height * ratio)),
  };
}

export interface PreparedUpload {
  file: File;
  /** Set when the original is sent because the browser could not decode/re-encode it. */
  note: string | null;
}

/**
 * Downscales a photo to {@link MAX_UPLOAD_EDGE} on its long side and re-encodes it as JPEG.
 * The EXIF orientation is applied while decoding (`imageOrientation: 'from-image'`, the default
 * of createImageBitmap, set explicitly for clarity), so the result is upright and needs no EXIF.
 * If the browser cannot decode the file (e.g. HEIC on Chrome) the original is returned with a
 * note, and the server decides whether it accepts it.
 */
export async function prepareForUpload(file: File): Promise<PreparedUpload> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return {
      file,
      note: 'This browser could not resize the photo, so it is sent as it is. It may be slow or rejected.',
    };
  }
  try {
    const target = downscaleTarget(file, bitmap);
    if (!target) {
      return { file, note: null };
    }
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return { file, note: null };
    }
    // JPEG has no alpha: composite transparent PNG/WebP onto white (black would hide dark pieces).
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY),
    );
    const resized = Math.max(bitmap.width, bitmap.height) > MAX_UPLOAD_EDGE;
    if (!blob || (!resized && blob.size >= file.size)) {
      return { file, note: null };
    }
    return {
      file: new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }),
      note: null,
    };
  } finally {
    bitmap.close();
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    // Older engines reject the option value; retry with the defaults before giving up.
    if (error instanceof TypeError) {
      return createImageBitmap(file);
    }
    throw error;
  }
}
