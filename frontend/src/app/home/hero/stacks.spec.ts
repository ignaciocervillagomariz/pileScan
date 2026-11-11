import { Stacks } from './stacks';

describe('Stacks', () => {
  const make = (...ids: number[]) => {
    const s = new Stacks();
    for (const id of ids) s.add(id);
    return s;
  };

  it('starts with every brick as a stack of one', () => {
    const s = make(1, 2);
    expect(s.stackOf(2)).toBe(2);
    expect(s.height(2)).toBe(1);
  });

  it('merging puts the whole carried stack on the target brick, as one stack', () => {
    const s = make(1, 2, 3);
    s.merge(3, 2); // 3 on 2
    s.merge(2, 1); // the stack 2+3 on 1
    expect(s.stackOf(3)).toBe(1);
    expect(s.membersOf(1).map((m) => [m.id, m.parent, m.level])).toEqual([
      [1, null, 0],
      [2, 1, 1],
      [3, 2, 2],
    ]);
    expect(s.height(1)).toBe(3);
  });

  it('counts layers, not bricks: two bricks side by side on a base are height 2', () => {
    const s = make(1, 2, 3);
    s.merge(2, 1);
    s.merge(3, 1);
    expect(s.height(1)).toBe(2);
    expect(s.above(1).sort()).toEqual([2, 3]);
  });

  it('refuses to merge a stack onto itself', () => {
    const s = make(1, 2);
    s.merge(2, 1);
    expect(() => s.merge(1, 2)).toThrow();
  });
});
