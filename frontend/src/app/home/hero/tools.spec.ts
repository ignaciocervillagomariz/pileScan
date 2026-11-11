import { DEFAULT_TOOL, toolAfterKey, toolInfo, TOOLS } from './tools';

describe('tools', () => {
  it('starts with the Glove', () => {
    expect(DEFAULT_TOOL).toBe('glove');
  });

  it('Esc returns to the Glove from any tool; other keys change nothing', () => {
    expect(toolAfterKey('push', 'Escape')).toBe('glove');
    expect(toolAfterKey('separator', 'Escape')).toBe('glove');
    expect(toolAfterKey('push', 'a')).toBe('push');
  });

  it('has a label and a one-line hint for every tool', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['glove', 'push', 'separator']);
    for (const t of TOOLS) {
      expect(toolInfo(t.id).label.length).toBeGreaterThan(0);
      // One line on a 390 px phone at the hint's font size.
      expect(t.hint.length).toBeLessThanOrEqual(48);
    }
  });
});
