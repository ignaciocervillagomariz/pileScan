/**
 * Which bricks form one stack. A built stack is one object (one compound rigid body): the Glove
 * carries it whole, and only the Separator takes it apart. Pure bookkeeping, no physics.
 *
 * A stack is a tree: its root is the bottom brick, and every other brick sits on its `parent`.
 * The root's id is the stack's id, and the stack's rigid body has the root brick's frame.
 * A loose brick is a stack of one.
 */
export interface StackMember {
  readonly id: number;
  /** The brick this one sits on; null for the bottom brick. */
  readonly parent: number | null;
  /** 0 for the bottom brick, 1 for a brick on it, and so on. */
  readonly level: number;
}

export class Stacks {
  private readonly stackOfBrick = new Map<number, number>();
  private readonly members = new Map<number, StackMember[]>();

  /** A new loose brick. */
  add(id: number): void {
    this.stackOfBrick.set(id, id);
    this.members.set(id, [{ id, parent: null, level: 0 }]);
  }

  clear(): void {
    this.stackOfBrick.clear();
    this.members.clear();
  }

  stackOf(id: number): number | null {
    return this.stackOfBrick.get(id) ?? null;
  }

  membersOf(stack: number): readonly StackMember[] {
    return this.members.get(stack) ?? [];
  }

  member(id: number): StackMember | null {
    const stack = this.stackOf(id);
    return stack === null ? null : (this.membersOf(stack).find((m) => m.id === id) ?? null);
  }

  /** Number of layers: a single brick is 1. */
  height(stack: number): number {
    return Math.max(0, ...this.membersOf(stack).map((m) => m.level + 1));
  }

  /** Puts the whole stack `carried` on brick `onto` (of another stack). Returns the merged stack. */
  merge(carried: number, onto: number): number {
    const target = this.stackOf(onto);
    const base = this.member(onto);
    if (target === null || base === null || target === carried) throw new Error('Invalid merge');
    const moved = this.membersOf(carried).map((m) => ({
      id: m.id,
      parent: m.parent ?? onto,
      level: m.level + base.level + 1,
    }));
    this.members.set(target, [...this.membersOf(target), ...moved]);
    this.members.delete(carried);
    for (const m of moved) this.stackOfBrick.set(m.id, target);
    return target;
  }

  /** Every brick that rests on `id`, directly or through others (not `id` itself). */
  above(id: number): number[] {
    const stack = this.stackOf(id);
    if (stack === null) return [];
    const all = this.membersOf(stack);
    const found: number[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const m of all) {
        if (m.parent === current) {
          found.push(m.id);
          queue.push(m.id);
        }
      }
    }
    return found;
  }
}
