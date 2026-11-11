/**
 * The pointer state machine, as a pure reducer. The active tool decides what a move or a press
 * means; there are no speed thresholds anywhere: a stack is carried because it was pressed.
 *
 *   Push:       away --move--> resting <--still / moving--> pushing
 *   Glove:      away --move--> hovering --press on table--> sweeping --release--> hovering
 *                                       --press on brick--> carrying --release--> hovering
 *   Separator:  away --move--> hovering
 *   Any tool:   leave, cancel (page scroll, browser gesture) or a tool change --> away
 *
 * What happens to a carried stack when carrying ends (snap or drop) is the hero's job.
 */
import { Motion } from './pointer-classifier';
import { Tool } from './tools';

export type InteractionState =
  /** The pointer is not over the scene (or the page is scrolling). */
  | { readonly kind: 'away' }
  /** Push: over the scene, but the pointer is completely still. */
  | { readonly kind: 'resting' }
  /** Push: the pointer moves, and the pusher follows it. */
  | { readonly kind: 'pushing' }
  /** Glove or Separator: over the scene, nothing moves; the brick under the cursor is hovered. */
  | { readonly kind: 'hovering' }
  /** Glove: the button was pressed on the table and is held; the pusher follows the pointer. */
  | { readonly kind: 'sweeping' }
  /** Glove: the button was pressed on a brick and is held; its whole stack follows the pointer. */
  | { readonly kind: 'carrying' };

/** What a press landed on, decided by a ray cast from the camera. */
export type PressTarget = 'brick' | 'table';

export type InteractionEvent =
  | { readonly type: 'move'; readonly motion: Motion }
  /** Mouse button or pen down; for touch, the start of a sideways drag. */
  | { readonly type: 'press'; readonly on: PressTarget }
  | { readonly type: 'release' }
  /** The pointer left the scene (mouse out of the canvas, finger lifted). */
  | { readonly type: 'leave' }
  /** The browser took over (vertical swipe became a scroll) or the page scrolled. */
  | { readonly type: 'cancel' };

export const AWAY: InteractionState = { kind: 'away' };
const RESTING: InteractionState = { kind: 'resting' };
const PUSHING: InteractionState = { kind: 'pushing' };
const HOVERING: InteractionState = { kind: 'hovering' };
const SWEEPING: InteractionState = { kind: 'sweeping' };
const CARRYING: InteractionState = { kind: 'carrying' };

export function transition(state: InteractionState, event: InteractionEvent, tool: Tool): InteractionState {
  if (event.type === 'leave' || event.type === 'cancel') return AWAY;
  switch (tool) {
    case 'push':
      // Never grabs: presses and releases change nothing. Any movement at all pushes.
      if (event.type !== 'move') return state.kind === 'away' ? RESTING : state;
      return event.motion === 'moving' ? PUSHING : RESTING;
    case 'glove':
      if (event.type === 'press') return event.on === 'table' ? SWEEPING : CARRYING;
      if (event.type === 'release') return HOVERING;
      // Moving never pushes by itself: only a held press sweeps or carries.
      return state.kind === 'sweeping' || state.kind === 'carrying' ? state : HOVERING;
    case 'separator':
      return HOVERING;
  }
}

/**
 * True in the states where the pusher follows the pointer. In Push mode it stays at a still
 * pointer (a pusher that doesn't move pushes nothing), so it never reappears inside the brick
 * the cursor rested on when the pointer moves again.
 */
export function pusherActive(state: InteractionState): boolean {
  return state.kind === 'pushing' || state.kind === 'resting' || state.kind === 'sweeping';
}
