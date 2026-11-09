import { IDLE, transition } from './interaction';

const on = { pushEnabled: true };

describe('interaction reducer (push)', () => {
  it('starts pushing on fast motion and stops on slow motion', () => {
    const pushing = transition(IDLE, { type: 'move', motion: 'fast' }, on);
    expect(pushing.kind).toBe('push');
    expect(transition(pushing, { type: 'move', motion: 'slow' }, on).kind).toBe('idle');
  });

  it('stays idle on slow motion', () => {
    expect(transition(IDLE, { type: 'move', motion: 'slow' }, on)).toEqual(IDLE);
  });

  it('stops pushing when the pointer leaves or the browser takes over the gesture', () => {
    const pushing = transition(IDLE, { type: 'move', motion: 'fast' }, on);
    expect(transition(pushing, { type: 'leave' }, on).kind).toBe('idle');
    expect(transition(pushing, { type: 'cancel' }, on).kind).toBe('idle');
  });

  it('never pushes when pushing is disabled (reduced motion)', () => {
    expect(transition(IDLE, { type: 'move', motion: 'fast' }, { pushEnabled: false }).kind).toBe('idle');
  });
});
