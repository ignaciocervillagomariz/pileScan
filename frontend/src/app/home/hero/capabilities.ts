/**
 * Browser probes for the hero. Kept free of three.js so the home page can decide whether to
 * download the 3D chunk at all.
 */
import { ConnectionSignals, QualitySignals } from './quality';

interface NavigatorExtras {
  readonly deviceMemory?: number;
  readonly connection?: ConnectionSignals;
}

export function readQualitySignals(win: Window): QualitySignals {
  const nav = win.navigator as Navigator & NavigatorExtras;
  return {
    cores: nav.hardwareConcurrency ?? 0,
    memoryGb: nav.deviceMemory,
    coarsePointer: win.matchMedia('(pointer: coarse)').matches,
    shortSidePx: Math.min(win.innerWidth, win.innerHeight),
    devicePixelRatio: win.devicePixelRatio || 1,
  };
}

export function readConnection(win: Window): ConnectionSignals | undefined {
  return (win.navigator as Navigator & NavigatorExtras).connection;
}

/** three.js r163+ requires WebGL2. The probe context is released straight away. */
export function supportsWebGL2(doc: Document): boolean {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
