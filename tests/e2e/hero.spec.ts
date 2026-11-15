import { CDPSession, expect, Page, test } from '@playwright/test';
import { ids } from './testids';

/**
 * Home hero: the dock and the three tools (spec: docs/specs/home-hero.md). The scene is WebGL,
 * so these tests read its state from the ?debug=1 overlay (rows carry data-debug="<label>").
 * They run in the `hero-*` projects, which launch Chromium with the GPU enabled. Without a
 * hardware WebGL2 context the page shows the static surface: the scene tests then skip, or
 * fail with HERO_REQUIRE_GPU=1 so a GPU-less runner can't pass silently.
 */

type Point = { x: number; y: number };
type Brick = Point & { id: string };

const requireGpu = process.env['HERO_REQUIRE_GPU'] === '1';

// Ionic keeps a left page hidden in the DOM: the newest copy is the visible one.
const hero = (page: Page) => page.getByTestId(ids.homeHero).last();
const tool = (page: Page, id: 'glove' | 'push' | 'separator') => page.getByTestId(`${ids.heroToolPrefix}${id}`).last();
const debugRow = async (page: Page, label: string) =>
  ((await page.locator(`[data-debug="${label}"]`).last().innerText()) ?? '').replace(/\s+/g, ' ');

/** The overlay refreshes every 100 ms and the hover needs a frame or two: wait past both. */
const settle = (page: Page) => page.waitForTimeout(260);

async function expectLive(page: Page): Promise<void> {
  await expect(hero(page)).toHaveAttribute('data-hero-state', /live|fallback/, { timeout: 30_000 });
  const live = (await hero(page).getAttribute('data-hero-state')) === 'live';
  if (requireGpu) expect(live, 'HERO_REQUIRE_GPU=1 but the hero fell back to its static surface').toBe(true);
  test.skip(!live, 'No hardware WebGL2 in this browser: the hero shows its static surface.');
}

const resting = (page: Page, timeout = 15_000) =>
  expect(hero(page)).toHaveAttribute('data-hero-activity', 'resting', { timeout });

async function openLiveHero(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await expectLive(page);
  await resting(page, 30_000);
}

async function hoveredId(page: Page, p: Point): Promise<string | null> {
  await page.mouse.move(p.x, p.y);
  await settle(page);
  return (await debugRow(page, 'hover')).match(/^#(\d+)/)?.[1] ?? null;
}

/**
 * Hovers `brick` until the overlay reports it twice in a row. The camera's parallax eases
 * toward the pointer, so a point found while hovering elsewhere can drift off the brick.
 */
async function hoverOn(page: Page, brick: Brick): Promise<void> {
  let streak = 0;
  for (let i = 0; i < 8 && streak < 2; i++) streak = (await hoveredId(page, brick)) === brick.id ? streak + 1 : 0;
  expect(streak, `pointer on brick #${brick.id}`).toBe(2);
}

/**
 * A point over brick `id` near `around`. A brick that snapped onto a stack, or popped off
 * one, is not where the pointer let go of it: it moved onto the stud grid and up or down.
 */
async function findNear(page: Page, id: string, around: Point): Promise<Brick> {
  for (let r = 0; r <= 60; r += 15) {
    for (let dy = -r; dy <= r; dy += 15) {
      for (let dx = -r; dx <= r; dx += 15) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = { x: around.x + dx, y: around.y + dy };
        if ((await hoveredId(page, p)) === id) return { id, ...p };
      }
    }
  }
  throw new Error(`brick #${id} not found within 60 px of (${around.x}, ${around.y})`);
}

/** Screen points over distinct bricks, found by hovering a grid right of the text card. */
async function findBricks(page: Page, wanted: number): Promise<Brick[]> {
  const found = new Map<string, Point>();
  const { width, height } = page.viewportSize()!;
  for (let y = 120; y < height - 40 && found.size < wanted; y += 50) {
    for (let x = Math.round(width * 0.45); x < width - 60 && found.size < wanted; x += 50) {
      const id = await hoveredId(page, { x, y });
      if (id && !found.has(id)) found.set(id, { x, y });
    }
  }
  return [...found].map(([id, p]) => ({ id, ...p }));
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 30, from.y + ((to.y - from.y) * i) / 30);
    await page.waitForTimeout(20);
  }
  await settle(page);
}

const angleOf = async (page: Page) => Number((await debugRow(page, 'carry')).match(/(-?\d+)°/)?.[1]);

/** Difference of two angles in degrees, wrapped to (-180, 180]. */
const turned = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

test.describe('home hero', () => {
  test('headline and CTA work whether the scene is live or static', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId(ids.homeHeadline)).toBeVisible();
    await page.getByTestId(ids.homeCta).click();
    await expect(page).toHaveURL(/\/scan$/);
  });

  test('without WebGL2 the static surface shows, with the dock inert and the CTA working', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type === 'webgl2' ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await page.goto('/');
    await expect(hero(page)).toHaveAttribute('data-hero-state', 'fallback', { timeout: 30_000 });
    await expect(page.getByTestId(ids.heroDock)).toHaveAttribute('inert', '');
    await page.getByTestId(ids.homeCta).click();
    await expect(page).toHaveURL(/\/scan$/);
  });

  test('with reduced motion there is no cascade: the bricks appear settled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Record every activity the hero reports, from the first one on.
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { heroActivities: string[] }).heroActivities = seen;
      new MutationObserver(() => {
        const value = document.querySelector('[data-testid="home-hero"]')?.getAttribute('data-hero-activity');
        if (value && seen.at(-1) !== value) seen.push(value);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hero-activity'] });
    });
    await page.goto('/?debug=1');
    await expectLive(page);
    await resting(page, 30_000);
    expect(await debugRow(page, 'reduced motion')).toBe('yes');
    // Simulated off-screen, then drawn at rest: nothing ever moved on screen.
    expect(await page.evaluate(() => (window as unknown as { heroActivities: string[] }).heroActivities)).toEqual([
      'settling',
      'resting',
    ]);
  });

  test('leaving the page releases the scene, and coming back brings it back', async ({ page }) => {
    await openLiveHero(page);
    await page.getByTestId(ids.homeCta).click();
    await expect(page).toHaveURL(/\/scan$/);
    // The home page stays hidden in the DOM: its scene must be gone, not just paused.
    await expect(page.getByTestId(ids.homeHero)).toHaveAttribute('data-hero-state', 'static');
    await page.goBack();
    await expect(hero(page)).toHaveAttribute('data-hero-state', 'live', { timeout: 30_000 });
    await resting(page, 30_000);
    await expect(tool(page, 'glove')).toHaveAttribute('aria-pressed', 'true');
  });

  test('dock: the Glove is active on load, each button selects its tool, Esc returns to the Glove', async ({ page }) => {
    await openLiveHero(page);
    const canvas = page.getByTestId(ids.heroCanvas);
    const hint = page.getByTestId(ids.heroHint);
    await expect(tool(page, 'glove')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-cursor', 'glove-open');

    for (const [id, label, cursor] of [
      ['push', 'Push', 'default'],
      ['separator', 'Separator', 'separator'],
      ['glove', 'Glove', 'glove-open'],
    ] as const) {
      await tool(page, id).click();
      await expect(tool(page, id)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`[data-testid^="${ids.heroToolPrefix}"][aria-pressed="true"]`)).toHaveCount(1);
      await expect(hint).toContainText(label);
      await expect(canvas).toHaveAttribute('data-cursor', cursor);
    }

    await tool(page, 'separator').click();
    await page.keyboard.press('Escape');
    await expect(tool(page, 'glove')).toHaveAttribute('aria-pressed', 'true');
  });

  test('dock: replay drops the bricks again', async ({ page }) => {
    await openLiveHero(page);
    await page.getByTestId(ids.heroReplay).click();
    await expect(hero(page)).toHaveAttribute('data-hero-activity', 'moving');
    await resting(page, 30_000);
  });

  test('Glove: carries a brick, turns it with the wheel and R, and drops it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse only: touch carries are covered below.');
    await openLiveHero(page);
    const [brick] = await findBricks(page, 1);
    expect(brick, 'a brick to carry').toBeTruthy();

    await hoverOn(page, brick);
    await page.mouse.down();
    await settle(page);
    await expect.poll(() => debugRow(page, 'carry')).toMatch(/^1 brick\(s\)/);
    await expect(page.getByTestId(ids.heroCanvas)).toHaveAttribute('data-cursor', 'glove-closed');

    // One notch is one fine step (15°), R a quarter turn.
    const start = await angleOf(page);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => turned(start, await angleOf(page))).toBe(15);
    await page.keyboard.press('r');
    await expect.poll(async () => turned(start, await angleOf(page))).toBe(105);

    await drag(page, brick, { x: brick.x - 120, y: brick.y + 60 });
    await page.mouse.up();
    await expect.poll(() => debugRow(page, 'carry')).toBe('-');
    await resting(page);
  });

  test('Glove stacks two bricks; the Separator splits them again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse only.');
    test.setTimeout(240_000);
    await openLiveHero(page);
    const [from, ...others] = await findBricks(page, 8);

    // Hold one brick and visit the others until the ghost shows a snap target (a brick lying
    // upside down or tilted is not a target), then release there.
    await hoverOn(page, from);
    await page.mouse.down();
    let stacked: { top: string; base: string; at: Point } | null = null;
    let last: Point = from;
    for (const to of others) {
      await drag(page, last, to);
      last = to;
      const target = (await debugRow(page, 'carry')).match(/target #(\d+)/)?.[1];
      if (target) {
        stacked = { top: from.id, base: target, at: to };
        break;
      }
    }
    await page.mouse.up();
    expect(stacked, 'a brick to stack on').not.toBeNull();
    await resting(page);
    const { top, base, at } = stacked!;

    // A built stack is one object: pressing it carries both bricks.
    let topPoint = await findNear(page, top, at);
    await hoverOn(page, topPoint);
    await page.mouse.down();
    await settle(page);
    expect(await debugRow(page, 'carry')).toMatch(/^2 brick\(s\)/);
    await page.mouse.up();
    await resting(page);

    // The Separator pops the top brick off; the base is a loose brick again.
    await tool(page, 'separator').click();
    topPoint = await findNear(page, top, topPoint);
    await hoverOn(page, topPoint);
    await page.mouse.down();
    await page.mouse.up();
    await resting(page);

    await tool(page, 'glove').click();
    const basePoint = await findNear(page, base, topPoint);
    await hoverOn(page, basePoint);
    await page.mouse.down();
    await settle(page);
    expect(await debugRow(page, 'carry')).toMatch(/^1 brick\(s\)/);
    await page.mouse.up();
  });

  test('Push: moving across the table pushes bricks, and they come to rest', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse only: on touch, Push needs a sideways drag.');
    await openLiveHero(page);
    const [brick] = await findBricks(page, 1);
    await tool(page, 'push').click();
    await page.mouse.move(brick.x - 150, brick.y);
    await settle(page);
    // A fast sweep right through the brick.
    for (let i = 1; i <= 15; i++) await page.mouse.move(brick.x - 150 + i * 20, brick.y, { steps: 1 });
    await expect(hero(page)).toHaveAttribute('data-hero-activity', 'moving');
    await page.mouse.move(5, 5);
    await resting(page);
  });

  test('the wheel scrolls the page unless a brick is carried', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse wheel only.');
    await openLiveHero(page);
    const scrollTop = () =>
      page.evaluate(async () => {
        const content = document.querySelector('ion-content') as unknown as { getScrollElement(): Promise<HTMLElement> };
        return (await content.getScrollElement()).scrollTop;
      });
    const [brick] = await findBricks(page, 1);

    await hoverOn(page, brick);
    await page.mouse.down();
    await settle(page);
    expect(await debugRow(page, 'carry')).toMatch(/^1 brick\(s\)/);
    await page.mouse.wheel(0, 200);
    await settle(page);
    expect(await scrollTop()).toBe(0);
    await page.mouse.up();
    await settle(page);

    await page.mouse.wheel(0, 200);
    await expect.poll(scrollTop).toBeGreaterThan(0);
  });

  test('touch: tapping the dock selects tools, and a long-press carries a brick', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Touch only.');
    await openLiveHero(page);
    await tool(page, 'push').tap();
    await expect(tool(page, 'push')).toHaveAttribute('aria-pressed', 'true');
    await tool(page, 'glove').tap();
    await expect(tool(page, 'glove')).toHaveAttribute('aria-pressed', 'true');

    // Mouse emulation still drives the debug hover, which finds a brick under the finger.
    const { width, height } = page.viewportSize()!;
    let brick: Brick | null = null;
    for (let y = Math.round(height * 0.55); y < height - 60 && !brick; y += 25) {
      for (let x = 30; x < width - 30 && !brick; x += 25) {
        const id = await hoveredId(page, { x, y });
        if (id) brick = { id, x, y };
      }
    }
    expect(brick, 'a brick within reach').not.toBeNull();
    await hoverOn(page, brick!);
    await page.mouse.move(2, 2);

    const cdp: CDPSession = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', brick!.x, brick!.y);
    await page.waitForTimeout(400);
    for (let i = 1; i <= 15; i++) {
      await touch('touchMove', brick!.x - i * 4, brick!.y - i * 5);
      await page.waitForTimeout(16);
    }
    await settle(page);
    expect(await debugRow(page, 'carry')).toMatch(/^1 brick\(s\)/);
    await touch('touchEnd');
    await expect.poll(() => debugRow(page, 'carry')).toBe('-');
  });
});
