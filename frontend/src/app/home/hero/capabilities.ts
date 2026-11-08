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

/** Software rasterizers: WebGL works but runs on the CPU, far below 30 fps for this scene. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render driver/i;

/**
 * True when a hardware-accelerated WebGL2 context is available (three.js r163+ needs WebGL2).
 * Software rendering counts as unsupported: it would block the main thread and stutter, so
 * those devices (and headless lab tools) get the static surface. The probe context is released
 * straight away.
 */
export function supportsHardwareWebGL2(doc: Document): boolean {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !SOFTWARE_RENDERER.test(renderer);
  } catch {
    return false;
  }
}

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
