import { Size } from './bbox-geometry';

/** The API accepts up to 15 MB. Phone photos are re-encoded above this size to stay safely below. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_UPLOAD_EDGE = 3000;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type UploadCheck = { ok: true } | { ok: false; message: string };

export function checkImageFile(file: Pick<File, 'type' | 'size'>): UploadCheck {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG or WebP photo.' };
  }
  return { ok: true };
}

/** Target size when a photo must be shrunk; null when it can be sent as is. */
export function downscaleTarget(file: Pick<File, 'size'>, image: Size): Size | null {
  if (file.size <= MAX_UPLOAD_BYTES) {
    return null;
  }
  const longest = Math.max(image.width, image.height);
  const ratio = Math.min(1, MAX_UPLOAD_EDGE / longest);
  return { width: Math.round(image.width * ratio), height: Math.round(image.height * ratio) };
}

/** Re-encodes oversized photos as JPEG to stay under the API size limit. Small files are untouched. */
export async function prepareForUpload(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const target = downscaleTarget(file, bitmap) ?? { width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    if (!blob) {
      return file;
    }
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
