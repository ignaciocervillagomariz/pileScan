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
  /** Tilt away from straight down (chosen over pure top-down in phase 1 review). */
  tiltDeg: 7,
  /**
   * How big one stud looks on screen, in CSS pixels: a share of the viewport's short side,
   * clamped so bricks stay readable on phones and don't get huge on large monitors.
   */
  studPx: { shareOfShortSide: 0.035, min: 20, max: 32 },
  /** The camera is always tens of units away: a far near plane keeps depth precise. */
  near: 5,
  far: 2000,
} as const;

export const LIGHTING = {
  /** Below 1 so white tops stay under clipping and their stud shading survives. */
  exposure: 0.88,
  environmentIntensity: 0.75,
  /**
   * Key light comes from the upper left so shadows fall to the lower right. Elevation ~47°:
   * low enough that stud sides split into a lit and a shaded half, which keeps studs visible
   * on white bricks.
   */
  keyDirection: { x: -0.5, y: 0.75, z: -0.5 },
  keyColor: '#fff6ea',
  keyIntensity: 2.1,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
  /** Extra world units around the visible ground covered by the shadow camera. */
  shadowMargin: 4,
  /** Darkness of the shadow-only ground, per page theme. */
  shadowOpacity: { light: 0.3, dark: 0.55 },
} as const;

/**
 * Baked contact shade around stud bases: brightness at the base, how far up the wall it fades
 * (share of stud height), and the halo ring on the top face (width and lift against z-fighting).
 */
export const STUD_SHADE = {
  base: 0.58,
  reach: 0.9,
  haloWidth: 1.2 * MM,
  haloLift: 0.002,
} as const;

export const MATERIAL = {
  roughness: 0.32,
  clearcoat: 0.55,
  clearcoatRoughness: 0.18,
  /** Fresnel F0 of ABS-like plastic (IOR ~1.53). */
  ior: 1.53,
} as const;

export const WALLS = {
  /** Gap between the visible edge and the wall's inner face, in studs. */
  inset: 0.4,
  thickness: 2,
  /** Free space kept around the text card. */
  cardMargin: 0.8,
  /** Walls reach this far above the spawn height, so nothing lands on top of them. */
  headroom: 6,
} as const;

export const PHYSICS = {
  /** Fixed 60 Hz step; at most this many steps per frame so a slow frame can't spiral. */
  step: 1 / 60,
  maxStepsPerFrame: 4,
  /** Plastic on a table: low bounce, fairly high friction. */
  restitution: 0.12,
  friction: 0.7,
  density: 1,
  linearDamping: 0.05,
  angularDamping: 0.35,
  /**
   * Speed cap in studs/s. Without it a 1 s drop on a tall phone screen hits ~80 studs/s and a
   * landing brick can press a resting one into the floor. Most of a drop is acceleration, so
   * the cap barely changes how long it takes.
   */
  maxSpeed: 40,
  /** Above Rapier's defaults (4 and 1): stiffer stacks and more than one CCD hit per step. */
  solverIterations: 8,
  ccdSubsteps: 4,
} as const;

export const CASCADE = {
  /** Total time over which bricks are released. */
  durationSeconds: 2.5,
  /** Release-time jitter as a share of the gap between two bricks. */
  timeJitter: 0.6,
  /** Spawn height as a share of the camera height: bricks enter from above the view. */
  spawnHeightShare: 0.45,
  /** A fall from the spawn height takes about this long. Gravity is derived from it. */
  fallSeconds: 1,
  maxSpin: 6,
  maxDrift: 1.5,
  /** Bricks released close together in time keep at least this far apart, in studs. */
  minSpacing: 2.2,
  maxAttempts: 60,
  seed: 7,
} as const;

/** Runtime downgrade when the device can't keep up during the cascade. */
export const ADAPTIVE = {
  warmupFrames: 45,
  minFps: 48,
} as const;
