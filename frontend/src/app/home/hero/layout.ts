/**
 * Pure mapping between the hero's CSS-pixel box and the ground plane (world units, Y up,
 * +X = screen right, +Z = screen down when seen from the camera).
 */
import { CAMERA } from './config';

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Axis-aligned rectangle on the ground plane, in world units. */
export interface GroundRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A DOM rectangle relative to the hero's top-left corner, in CSS pixels. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraFit {
  readonly studPx: number;
  /** Distance from the camera to the ground target along its view axis. */
  readonly distance: number;
  /** The ground area visible at y = 0. */
  readonly ground: GroundRect;
}

export function studPixels(v: Viewport, cfg = CAMERA.studPx): number {
  const ideal = Math.min(v.widthPx, v.heightPx) * cfg.shareOfShortSide;
  return Math.min(cfg.max, Math.max(cfg.min, ideal));
}

/** Top-down fit: the camera distance that shows the whole hero box at `studPx` per stud. */
export function fitCamera(v: Viewport, fovDeg: number = CAMERA.fovDeg): CameraFit {
  const studPx = studPixels(v);
  const halfWidth = v.widthPx / studPx / 2;
  const halfDepth = v.heightPx / studPx / 2;
  const distance = halfDepth / Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return {
    studPx,
    distance,
    ground: { minX: -halfWidth, maxX: halfWidth, minZ: -halfDepth, maxZ: halfDepth },
  };
}

/** Converts a DOM rectangle in the hero into a ground rectangle (top-down camera). */
export function pixelRectToGround(rect: PixelRect, v: Viewport, studPx: number): GroundRect {
  const toX = (px: number) => (px - v.widthPx / 2) / studPx;
  const toZ = (px: number) => (px - v.heightPx / 2) / studPx;
  return {
    minX: toX(rect.left),
    maxX: toX(rect.left + rect.width),
    minZ: toZ(rect.top),
    maxZ: toZ(rect.top + rect.height),
  };
}

export function inflate(r: GroundRect, by: number): GroundRect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}
