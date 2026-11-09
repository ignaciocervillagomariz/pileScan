/**
 * The pointer state machine, as a pure reducer. Phase 3 covers the pointer being away, resting
 * (dead zone) or pushing; press, lift, drag and snap are added in phase 4.
 *
 *   away --enter/move--> resting <--still / moving--> pushing
 *     ^                     |                           |
 *     +----- leave, cancel (page scroll or browser gesture) ---+
 */
import { Motion } from './pointer-classifier';

export type InteractionState =
  /** The pointer is not over the scene (or the page is scrolling). */
  | { readonly kind: 'away' }
  /** Over the scene, inside the dead zone: nothing is pushed. */
  | { readonly kind: 'resting' }
  /** Moving: the pusher follows the pointer. */
  | { readonly kind: 'pushing' };

export type InteractionEvent =
  | { readonly type: 'move'; readonly motion: Motion }
  /** The pointer left the scene (mouse out of the canvas, finger lifted). */
  | { readonly type: 'leave' }
  /** The browser took over (vertical swipe became a scroll) or the page scrolled. */
  | { readonly type: 'cancel' };

export interface InteractionOptions {
  /** False when pushing is switched off entirely. */
  readonly pushEnabled: boolean;
}

export const AWAY: InteractionState = { kind: 'away' };
const RESTING: InteractionState = { kind: 'resting' };
const PUSHING: InteractionState = { kind: 'pushing' };

export function transition(
  _state: InteractionState,
  event: InteractionEvent,
  options: InteractionOptions,
): InteractionState {
  switch (event.type) {
    case 'move':
      return event.motion === 'moving' && options.pushEnabled ? PUSHING : RESTING;
    case 'leave':
    case 'cancel':
      return AWAY;
  }
}
