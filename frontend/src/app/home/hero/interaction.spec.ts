import { AWAY, InteractionEvent, InteractionState, pusherActive, transition } from './interaction';
import { Tool } from './tools';

const run = (tool: Tool, events: InteractionEvent[], from: InteractionState = AWAY) =>
  events.reduce((state, event) => transition(state, event, tool), from);

const moving: InteractionEvent = { type: 'move', motion: 'moving' };
const still: InteractionEvent = { type: 'move', motion: 'still' };

describe('interaction: Push', () => {
  it('pushes on any movement, and only a completely still pointer rests', () => {
    expect(run('push', [moving]).kind).toBe('pushing');
    expect(run('push', [still]).kind).toBe('resting');
    expect(run('push', [moving, still]).kind).toBe('resting');
  });

  it('never grabs: presses and releases change nothing', () => {
    expect(run('push', [moving, { type: 'press', on: 'brick' }]).kind).toBe('pushing');
    expect(run('push', [still, { type: 'press', on: 'table' }, { type: 'release' }]).kind).toBe('resting');
  });

  it('keeps the pusher at a still pointer, so it never reappears inside a brick', () => {
    expect(pusherActive(run('push', [moving]))).toBe(true);
    expect(pusherActive(run('push', [moving, still]))).toBe(true);
  });
});

describe('interaction: Glove', () => {
  it('hovering never pushes, however the pointer moves', () => {
    const state = run('glove', [moving, moving, still, moving]);
    expect(state.kind).toBe('hovering');
    expect(pusherActive(state)).toBe(false);
  });

  it('a press on the table sweeps until the button is released', () => {
    const sweeping = run('glove', [still, { type: 'press', on: 'table' }, moving, still]);
    expect(sweeping.kind).toBe('sweeping');
    expect(pusherActive(sweeping)).toBe(true);
    expect(transition(sweeping, { type: 'release' }, 'glove').kind).toBe('hovering');
  });

  it('a press on a brick never sweeps', () => {
    const state = run('glove', [still, { type: 'press', on: 'brick' }, moving]);
    expect(state.kind).toBe('hovering');
    expect(pusherActive(state)).toBe(false);
  });
});

describe('interaction: Separator', () => {
  it('never pushes or sweeps', () => {
    const state = run('separator', [moving, { type: 'press', on: 'table' }, moving]);
    expect(state.kind).toBe('hovering');
    expect(pusherActive(state)).toBe(false);
  });
});

describe('interaction: any tool', () => {
  for (const tool of ['push', 'glove', 'separator'] as const) {
    it(`${tool}: goes away when the pointer leaves, the browser takes the gesture, or the page scrolls`, () => {
      const active = run(tool, [moving, { type: 'press', on: 'table' }]);
      expect(transition(active, { type: 'leave' }, tool)).toEqual(AWAY);
      expect(transition(active, { type: 'cancel' }, tool)).toEqual(AWAY);
    });
  }
});
