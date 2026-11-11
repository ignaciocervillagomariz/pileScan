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
  /**
   * Gap between the visible edge and the wall's inner face, in studs. Larger than a brick's
   * half-height so perspective never pushes a brick's top face past the screen edge.
   */
  inset: 1,
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

/**
 * The pusher, used by the Push tool (any movement) and the Glove's sweep (button held on the
 * table). It moves with the pointer, so the pointer's velocity sets the strength (slow nudges,
 * fast shoves). There is no speed threshold: only a completely still pointer is ignored.
 * Pointer speeds are in CSS px/s: they describe the hand, not the scene, so they need no
 * scaling with the viewport. The pusher's own speed is in studs/s and scales with the scene
 * already (studPx follows the viewport).
 */
export const PUSH = {
  /** Smoothing of the pointer speed: time constant of the exponential moving average. */
  speedTauMs: 40,
  /** Samples further apart than this mean the pointer stopped (or left and came back). */
  maxSampleGapMs: 120,
  /**
   * Touch: a gesture pushes only once it has moved this far, mostly sideways. Before that the
   * browser may still turn it into a scroll, and early moves would push bricks by mistake.
   */
  touchSlopPx: 8,
  /** After the page scrolls, ignore the pointer this long (the canvas moved under it). */
  scrollPauseMs: 200,
  /** The pusher is a vertical capsule whose straight part spans a brick's full height. */
  radius: 0.6,
  halfHeight: 0.6,
  /** Pusher speed cap in studs/s, so a flick can't launch bricks. */
  maxSpeed: 55,
  /** With prefers-reduced-motion, pushes stay gentle. */
  reducedMotionMaxSpeed: 8,
} as const;

/** Small signs of life while nobody interacts. None of them run with prefers-reduced-motion. */
export const AMBIENT = {
  /** The camera orbits up to this far toward the pointer. */
  parallaxMaxDeg: 1.5,
  /** Easing rate, per second (higher is snappier). */
  parallaxRate: 4,
  /** Optional: drop one extra brick after a while without interaction. Off by default. */
  idleDrop: { enabled: false, afterSeconds: 10, everySeconds: 12, max: 8 },
} as const;

/** The Glove tool. */
export const GLOVE = {
  /** Hovering never moves anything: the brick under the cursor only rises this much (visual). */
  hoverLift: 1.5 * MM,
  /** Easing rate of that lift, per second. */
  liftRate: 10,
} as const;

/** Carrying, snapping and stacking with the Glove (see snap.ts for the rules). */
export const CARRY = {
  /** Free space under a carried stack: about one brick, so it passes over stacks. */
  clearance: DIMENSIONS.brickHeight,
  /** A brick tilted more than this is not a snap target (and is not "studs up"). */
  uprightMaxDeg: 10,
  /** Layers in a stack, the carried one included. */
  maxStackHeight: 6,
  /** Overlaps smaller than this (studs) are touching, not colliding. */
  overlapMargin: 0.05,
  /** Easing rates, per second: following the pointer (a slight lag), height, turning. */
  followRate: 22,
  heightRate: 14,
  turnRate: 16,
  /** Tilt toward the movement, at most this much; reached at `tiltFullSpeed` studs/s. */
  tiltMaxDeg: 8,
  tiltFullSpeed: 25,
  /** Snap: the stack drops onto its target, then a small bounce (studs) and settles. */
  snapSeconds: 0.24,
  bounceHeight: 0.12,
  /** Touch: holding still this long on a brick grabs it. */
  longPressMs: 250,
  /** Mouse wheel: one quarter turn per this much scrolling (trackpads send many small events). */
  wheelStepPx: 60,
  /** Blob shadow under a carried stack: darkness at rest height, and how it fades with height. */
  blobOpacity: 0.32,
  blobFadePerStud: 0.12,
} as const;

/** The ?debug=1 overlay refreshes at most this often. */
export const DEBUG = { refreshMs: 100 } as const;
