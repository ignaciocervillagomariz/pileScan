import { expect, test } from '@playwright/test';
import { openEditor, photo, generated, pickColor, pickPart, selectPhoto, total, uploadPhoto, waitForCatalog } from './helpers';
import { ids } from './testids';

const PILE = photo('pile_light_5.jpg');

test.beforeAll(async () => {
  test.setTimeout(35 * 60_000);
  await waitForCatalog();
});

test('capture shows preview, upload leads to review with detections and footer', async ({ page }) => {
  await uploadPhoto(page, PILE);
  expect(await total(page)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId(ids.groupRow).first()).toBeVisible();
  await expect(page.getByTestId(ids.disclaimer).last()).toBeVisible();
});

test('review: edit part and color, delete, add, then results', async ({ page }) => {
  await uploadPhoto(page, PILE);
  const initial = await total(page);
  expect(initial).toBeGreaterThanOrEqual(2);

  await openEditor(page);
  await pickPart(page, '3001');
  await pickColor(page, 4);
  await page.getByTestId(ids.save).click();
  await expect(page.getByTestId(ids.dialog)).toBeHidden();
  await expect(page.locator(`[data-testid="${ids.groupRow}"][data-part-num="3001"][data-color-id="4"]`).first()).toBeVisible();

  await openEditor(page, (await page.getByTestId(ids.groupRow).count()) - 1);
  await page.getByTestId(ids.deleteDetection).click();
  await expect.poll(() => total(page)).toBe(initial - 1);

  await page.getByTestId(ids.addPiece).click();
  await page.getByTestId(ids.addWithoutBox).click();
  await pickPart(page, '3001');
  await pickColor(page, 4);
  await page.getByTestId(ids.save).click();
  await expect.poll(() => total(page)).toBe(initial);

  await page.getByTestId(ids.findSets).click();
  await expect(page).toHaveURL(/\/results$/);
  const cards = page.getByTestId(ids.resultsCard);
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });
  expect(await cards.count()).toBeLessThanOrEqual(5);
  await expect(page.getByTestId(ids.resultsMatch).first()).toContainText('%');
  await page.getByTestId(ids.missingToggle).first().click();
});

test('deleting every piece disables ranking; the results route shows the empty state', async ({ page }) => {
  await uploadPhoto(page, PILE);
  const scanUrl = page.url();
  for (let left = await total(page); left > 0; left = await total(page)) {
    await openEditor(page);
    await page.getByTestId(ids.deleteDetection).click();
    await expect.poll(() => total(page)).toBeLessThan(left);
  }
  await expect(page.getByTestId(ids.findSets)).toHaveAttribute('aria-disabled', 'true');
  await page.goto(`${scanUrl}/results`);
  await expect(page.getByTestId(ids.resultsEmpty)).toBeVisible();
});

test('invalid image shows an error, not a crash', async ({ page }) => {
  await selectPhoto(page, generated('fake.jpg')).catch(() => undefined);
  await page.getByTestId(ids.upload).click();
  await expect(page.getByTestId(ids.captureError)).toBeVisible({ timeout: 30_000 });
});

test('scan survives page reload', async ({ page }) => {
  await uploadPhoto(page, PILE);
  const url = page.url();
  const before = await total(page);
  await page.reload();
  await expect(page.getByTestId(ids.canvas)).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await total(page)).toBe(before);
});
