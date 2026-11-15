/**
 * The three hero tools shown in the dock. Framework-free and free of three/rapier imports, so
 * the home page can use it without pulling in the lazy hero chunk.
 */
export type Tool = 'glove' | 'push' | 'separator';

export interface ToolInfo {
  readonly id: Tool;
  /** Button label (also the tooltip). */
  readonly label: string;
  /** The one-line hint shown near the dock while this tool is active. */
  readonly hint: string;
}

export const DEFAULT_TOOL: Tool = 'glove';

export const TOOLS: readonly ToolInfo[] = [
  {
    id: 'glove',
    label: 'Glove',
    hint: 'Glove · press a brick to carry it, drag to sweep',
  },
  {
    id: 'push',
    label: 'Push',
    hint: 'Push · move across the table to push bricks',
  },
  {
    id: 'separator',
    label: 'Separator',
    hint: 'Separator · click a stacked brick to split it',
  },
];

export function toolInfo(tool: Tool): ToolInfo {
  return TOOLS.find((t) => t.id === tool) ?? TOOLS[0];
}

/** Keyboard shortcut: Esc always returns to the Glove; other keys change nothing. */
export function toolAfterKey(current: Tool, key: string): Tool {
  return key === 'Escape' ? DEFAULT_TOOL : current;
}
