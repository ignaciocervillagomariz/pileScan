/**
 * Device quality tiers. Pure: the caller reads the signals from the browser
 * (see capabilities.ts), so the rules are unit-testable.
 */

export type TierName = 'high' | 'mid' | 'low';

export interface QualitySignals {
  /** navigator.hardwareConcurrency (0 when unknown). */
  readonly cores: number;
  /** navigator.deviceMemory in GB; Chromium only, undefined elsewhere. */
  readonly memoryGb?: number;
  /** (pointer: coarse) matches: phones and tablets. */
  readonly coarsePointer: boolean;
  /** Short side of the viewport in CSS pixels. */
  readonly shortSidePx: number;
  readonly devicePixelRatio: number;
}

export interface ConnectionSignals {
  readonly saveData?: boolean;
  /** navigator.connection.effectiveType: 'slow-2g' | '2g' | '3g' | '4g'. */
  readonly effectiveType?: string;
}

export interface QualityTier {
  readonly name: TierName;
  /** False on the lowest tier: keep the static fallback, never download the 3D chunk. */
  readonly render3d: boolean;
  readonly brickCount: number;
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly shadowMapSize: number;
  readonly shadowRadius: number;
  readonly clearcoat: boolean;
  readonly studSegments: number;
  /** Tubes and pins under the bricks: seen less often than studs, so coarser. */
  readonly undersideSegments: number;
}

export const TIERS: Readonly<Record<TierName, QualityTier>> = {
  high: {
    name: 'high',
    render3d: true,
    brickCount: 35,
    maxPixelRatio: 2,
    antialias: true,
    shadowMapSize: 2048,
    shadowRadius: 5,
    clearcoat: true,
    studSegments: 24,
    undersideSegments: 16,
  },
  mid: {
    name: 'mid',
    render3d: true,
    brickCount: 15,
    maxPixelRatio: 1.5,
    antialias: true,
    shadowMapSize: 1024,
    shadowRadius: 3,
    clearcoat: true,
    studSegments: 16,
    undersideSegments: 12,
  },
  low: {
    name: 'low',
    render3d: false,
    brickCount: 0,
    maxPixelRatio: 1,
    antialias: false,
    shadowMapSize: 0,
    shadowRadius: 0,
    clearcoat: false,
    studSegments: 0,
    undersideSegments: 0,
  },
};

/** Below this short side we treat the screen as a phone, whatever the pointer says. */
const PHONE_SHORT_SIDE_PX = 600;

export function pickTier(s: QualitySignals): QualityTier {
  const cores = s.cores > 0 ? s.cores : 4;
  if (cores <= 2 || (s.memoryGb !== undefined && s.memoryGb <= 2)) return TIERS.low;
  const phoneLike = s.coarsePointer || s.shortSidePx < PHONE_SHORT_SIDE_PX;
  const modest = cores <= 4 || (s.memoryGb !== undefined && s.memoryGb <= 4);
  return phoneLike || modest ? TIERS.mid : TIERS.high;
}

/** The hero chunk is ~1.3 MB compressed: never spend it on a metered or slow connection. */
export function connectionAllows3d(c: ConnectionSignals | undefined): boolean {
  if (!c) return true;
  if (c.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '');
}
