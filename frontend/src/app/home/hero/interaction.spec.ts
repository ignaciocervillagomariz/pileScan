import { AWAY, transition } from './interaction';

const on = { pushEnabled: true };

describe('interaction reducer', () => {
  it('pushes on any movement outside the dead zone, rests inside it', () => {
    expect(transition(AWAY, { type: 'move', motion: 'moving' }, on).kind).toBe('pushing');
    expect(transition(AWAY, { type: 'move', motion: 'still' }, on).kind).toBe('resting');
  });

  it('goes back to resting when the pointer stops, without leaving the scene', () => {
    const pushing = transition(AWAY, { type: 'move', motion: 'moving' }, on);
    expect(transition(pushing, { type: 'move', motion: 'still' }, on).kind).toBe('resting');
  });

  it('goes away when the pointer leaves, the browser takes the gesture, or the page scrolls', () => {
    const pushing = transition(AWAY, { type: 'move', motion: 'moving' }, on);
    expect(transition(pushing, { type: 'leave' }, on)).toEqual(AWAY);
    expect(transition(pushing, { type: 'cancel' }, on)).toEqual(AWAY);
  });

  it('never pushes when pushing is switched off', () => {
    expect(transition(AWAY, { type: 'move', motion: 'moving' }, { pushEnabled: false }).kind).toBe('resting');
  });
});
