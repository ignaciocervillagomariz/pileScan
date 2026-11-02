import { expect, test } from '@playwright/test';
import { fetchScan, openEditor, pickColor, pickPart, photo, total, uploadPhoto, waitForCatalog } from './helpers';
import { ids } from './testids';

const PILE = photo('pile_light_5.jpg');

test.beforeAll(async () => {
  test.setTimeout(35 * 60_000);
  await waitForCatalog();
});

test('tapping a box on the canvas opens the editor for that detection, which can be deleted', async ({ page }) => {
  await uploadPhoto(page, PILE);
  const scan = await fetchScan(page);
  const target = scan.detections.find((d) => d.bbox !== null);
  expect(target, 'scan has at least one detection with a bbox').toBeTruthy();
  const bbox = target!.bbox!;

  const canvas = page.getByTestId(ids.canvas);
  const box = (await canvas.boundingBox())!;
  const scale = box.width / scan.image.width;
  await canvas.click({ position: { x: (bbox.x + bbox.width / 2) * scale, y: (bbox.y + bbox.height / 2) * scale } });

  await expect(page.getByTestId(ids.dialog)).toBeVisible();
  await expect(canvas).toHaveAttribute('data-selected-detection', target!.id);

  const before = await total(page);
  await page.getByTestId(ids.deleteDetection).click();
  await expect(page.getByTestId(ids.dialog)).toBeHidden();
  await expect.poll(() => total(page)).toBe(before - 1);
  const after = await fetchScan(page);
  expect(after.detections.map((d) => d.id)).not.toContain(target!.id);
  await expect(canvas).toHaveAttribute('data-selected-detection', '');
});

test('tapping a box and changing part and color persists to the backend', async ({ page }) => {
  await uploadPhoto(page, PILE);
  const scan = await fetchScan(page);
  const target = scan.detections.find((d) => d.bbox !== null)!;
  const canvas = page.getByTestId(ids.canvas);
  const box = (await canvas.boundingBox())!;
  const scale = box.width / scan.image.width;
  const b = target.bbox!;
  await canvas.click({ position: { x: (b.x + b.width / 2) * scale, y: (b.y + b.height / 2) * scale } });
  await expect(canvas).toHaveAttribute('data-selected-detection', target.id);

  await pickPart(page, '3001');
  await pickColor(page, 4);
  await page.getByTestId(ids.save).click();
  await expect(page.getByTestId(ids.dialog)).toBeHidden();

  const res = await (await page.request.get(`/api/scans/${scan.id}/detections`)).json();
  const updated = res.find((d: { id: string }) => d.id === target.id);
  expect(updated.part.partNum).toBe('3001');
  expect(updated.color.id).toBe(4);
  expect(updated.corrected).toBe(true);
});

test('a group with several pieces expands into detection rows and highlights them', async ({ page }) => {
  await uploadPhoto(page, PILE);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId(ids.addPiece).click();
    await page.getByTestId(ids.addWithoutBox).click();
    await pickPart(page, '3003');
    await pickColor(page, 1);
    await page.getByTestId(ids.save).click();
    await expect(page.getByTestId(ids.dialog)).toBeHidden();
  }
  const group = page.locator(`[data-testid="${ids.groupRow}"][data-part-num="3003"][data-color-id="1"]`);
  expect(Number(await group.getAttribute('data-count'))).toBeGreaterThanOrEqual(2);
  await group.click();

  const rows = page.getByTestId(ids.detectionRow);
  await expect(rows).toHaveCount(Number(await group.getAttribute('data-count')));
  const rowIds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-detection-id')));
  const highlighted = ((await page.getByTestId(ids.canvas).getAttribute('data-highlighted-detections')) ?? '').split(',');
  for (const id of rowIds) expect(highlighted).toContain(id);

  await rows.first().click();
  await expect(page.getByTestId(ids.dialog)).toBeVisible();
  await expect(page.getByTestId(ids.canvas)).toHaveAttribute('data-selected-detection', rowIds[0]!);
});
