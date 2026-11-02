import { BBox } from '../core/api/generated/models';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Smallest box a user can draw; anything smaller is treated as an accidental tap. */
export const MIN_BOX_SIZE = 8;

/**
 * Bounding boxes are expressed in pixels of the stored scan image (its natural size), while the
 * canvas is drawn at a different internal size and displayed at yet another CSS size. These
 * helpers convert between the three coordinate spaces.
 */

/** Factor that maps image pixels to canvas pixels. */
export function imageToCanvasScale(image: Size, canvas: Size): number {
  return canvas.width / image.width;
}

export function scaleBBox(box: BBox, scale: number): BBox {
  return {
    x: box.x * scale,
    y: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

/** Canvas internal size: the image size, capped so huge photos do not allocate huge bitmaps. */
export function fitCanvasSize(image: Size, maxEdge: number): Size {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) {
    return { width: image.width, height: image.height };
  }
  const ratio = maxEdge / longest;
  return { width: Math.round(image.width * ratio), height: Math.round(image.height * ratio) };
}

/**
 * Converts a pointer position (client coordinates) over a CSS-scaled element to image pixels.
 * `rect` is the element's getBoundingClientRect(); the result is clamped to the image.
 */
export function clientToImagePoint(
  client: Point,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  image: Size,
): Point {
  const x = ((client.x - rect.left) / rect.width) * image.width;
  const y = ((client.y - rect.top) / rect.height) * image.height;
  return { x: clamp(x, 0, image.width), y: clamp(y, 0, image.height) };
}

export function containsPoint(box: BBox, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/** Returns the id of the smallest box under the point, so small pieces inside big ones stay tappable. */
export function hitTest<T extends { id: string; bbox?: BBox | null }>(
  items: readonly T[],
  point: Point,
): string | null {
  let best: { id: string; area: number } | null = null;
  for (const item of items) {
    if (!item.bbox || !containsPoint(item.bbox, point)) {
      continue;
    }
    const area = item.bbox.width * item.bbox.height;
    if (best === null || area < best.area) {
      best = { id: item.id, area };
    }
  }
  return best?.id ?? null;
}

/** Builds an integer box from two drag corners. Returns null when it is too small to be intended. */
export function boxFromCorners(a: Point, b: Point, image: Size): BBox | null {
  const x1 = clamp(Math.min(a.x, b.x), 0, image.width);
  const y1 = clamp(Math.min(a.y, b.y), 0, image.height);
  const x2 = clamp(Math.max(a.x, b.x), 0, image.width);
  const y2 = clamp(Math.max(a.y, b.y), 0, image.height);
  const width = Math.round(x2 - x1);
  const height = Math.round(y2 - y1);
  if (width < MIN_BOX_SIZE || height < MIN_BOX_SIZE) {
    return null;
  }
  return { x: Math.round(x1), y: Math.round(y1), width, height };
}

/** Source rectangle for cropping a piece out of the photo, padded and kept inside the image. */
export function cropRect(box: BBox, image: Size, paddingRatio = 0.1): BBox {
  const padX = box.width * paddingRatio;
  const padY = box.height * paddingRatio;
  const x = clamp(Math.floor(box.x - padX), 0, image.width - 1);
  const y = clamp(Math.floor(box.y - padY), 0, image.height - 1);
  const right = clamp(Math.ceil(box.x + box.width + padX), x + 1, image.width);
  const bottom = clamp(Math.ceil(box.y + box.height + padY), y + 1, image.height);
  return { x, y, width: right - x, height: bottom - y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
