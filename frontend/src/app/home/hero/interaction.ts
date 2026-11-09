/**
 * The pointer state machine, as a pure reducer. Phase 3 covers idle and push; hover, grab,
 * drag and snap are added in phase 4.
 *
 *   idle --fast move--> push --slow move / leave / cancel--> idle
 */
import { Motion } from './pointer-classifier';

export type InteractionState = { readonly kind: 'idle' } | { readonly kind: 'push' };

export type InteractionEvent =
  | { readonly type: 'move'; readonly motion: Motion }
  /** The pointer left the scene (mouse out of the canvas, finger lifted). */
  | { readonly type: 'leave' }
  /** The browser took over the gesture (vertical swipe became a page scroll). */
  | { readonly type: 'cancel' };

export interface InteractionOptions {
  /** False under prefers-reduced-motion. */
  readonly pushEnabled: boolean;
}

export const IDLE: InteractionState = { kind: 'idle' };

export function transition(
  state: InteractionState,
  event: InteractionEvent,
  options: InteractionOptions,
): InteractionState {
  switch (event.type) {
    case 'move':
      if (!options.pushEnabled) return IDLE;
      return event.motion === 'fast' ? { kind: 'push' } : IDLE;
    case 'leave':
    case 'cancel':
      return IDLE;
  }
}
