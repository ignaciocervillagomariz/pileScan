/**
 * Every tunable number of the hero scene. World unit: 1 = one stud pitch (8 mm).
 * Plain data only: this file is imported by pure modules and unit tests.
 */

const MM = 1 / 8;

export const DIMENSIONS = {
  brickHeight: 9.6 * MM,
  plateHeight: 3.2 * MM,
  studRadius: 2.4 * MM,
  studHeight: 1.7 * MM,
  /** Real bricks are 0.2 mm narrower than their pitch so they fit side by side. */
  sideGap: 0.2 * MM,
  edgeRadius: 0.3 * MM,
  /** Chamfer on the stud's top edge; with smoothed normals it reads as a fillet. */
  studChamfer: 0.3 * MM,
} as const;

export const CAMERA = {
  fovDeg: 30,
  /** Alternative framing: tilt away from straight down, in degrees. */
  tiltDeg: 7,
  /**
   * How big one stud looks on screen, in CSS pixels: a share of the viewport's short side,
   * clamped so bricks stay readable on phones and don't get huge on large monitors.
   */
  studPx: { shareOfShortSide: 0.035, min: 20, max: 32 },
  near: 1,
  far: 2000,
} as const;

export const LIGHTING = {
  exposure: 1,
  environmentIntensity: 0.75,
  /** Key light comes from the upper left so shadows fall to the lower right. */
  keyDirection: { x: -0.45, y: 1, z: -0.55 },
  keyColor: '#fff6ea',
  keyIntensity: 2.1,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
  /** Extra world units around the visible ground covered by the shadow camera. */
  shadowMargin: 4,
  /** Darkness of the shadow-only ground, per page theme. */
  shadowOpacity: { light: 0.3, dark: 0.55 },
} as const;

export const MATERIAL = {
  roughness: 0.32,
  clearcoat: 0.55,
  clearcoatRoughness: 0.18,
  /** Fresnel F0 of ABS-like plastic (IOR ~1.53). */
  ior: 1.53,
} as const;

/** Phase 1 only: the static preview arrangement. */
export const PREVIEW = {
  seed: 7,
  /** Free space kept around the edges and the text card, in studs. */
  edgeMargin: 1.5,
  cardMargin: 1.5,
  /** Spacing between bricks as a share of their bounding radius. */
  spacing: 1.08,
  maxAttemptsPerBrick: 400,
  stackChance: 0.12,
} as const;
