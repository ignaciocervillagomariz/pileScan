import { expect, test } from '@playwright/test';
import { pickPart, uploadPhoto, waitForCatalog } from './helpers';
import { ids } from './testids';

test.beforeAll(async () => {
  test.setTimeout(35 * 60_000);
  await waitForCatalog();
});

test('capture -> review shows detections', async ({ page }) => {
  await uploadPhoto(page, 'pile-small.jpg');
  await expect(page.getByTestId(ids.detectionItem).first()).toBeVisible();
  expect(await page.getByTestId(ids.detectionItem).count()).toBeGreaterThanOrEqual(1);
});

test('review: edit part, edit color, delete, add; then results', async ({ page }) => {
  await uploadPhoto(page, 'pile-small.jpg');
  const items = page.getByTestId(ids.detectionItem);
  const initial = await items.count();
  expect(initial).toBeGreaterThanOrEqual(2);

  await items.first().getByTestId(ids.editPart).click();
  await pickPart(page, '3001');
  await page.getByTestId(ids.confirm).click();
  await expect(items.first()).toContainText('3001');

  await items.first().getByTestId(ids.editColor).click();
  await page.getByTestId(ids.colorOption).filter({ hasText: /^\s*Red\s*$/ }).first().click();
  await page.getByTestId(ids.confirm).click();
  await expect(items.first()).toContainText('Red');

  await items.last().getByTestId(ids.delete).click();
  await expect(items).toHaveCount(initial - 1);

  await page.getByTestId(ids.add).click();
  await pickPart(page, '3001');
  await page.getByTestId(ids.colorOption).filter({ hasText: /^\s*Red\s*$/ }).first().click();
  await page.getByTestId(ids.confirm).click();
  await expect(items).toHaveCount(initial);

  await page.getByTestId(ids.seeResults).click();
  await expect(page.getByTestId(ids.resultCard).first()).toBeVisible();
  await expect(page.getByTestId(ids.matchPercent).first()).toContainText('%');
  expect(await page.getByTestId(ids.resultCard).count()).toBeLessThanOrEqual(5);
});

test('results page shows empty state when every piece is deleted', async ({ page }) => {
  await uploadPhoto(page, 'pile-small.jpg');
  const items = page.getByTestId(ids.detectionItem);
  while ((await items.count()) > 0) {
    const before = await items.count();
    await items.first().getByTestId(ids.delete).click();
    await expect(items).toHaveCount(before - 1);
  }
  await page.getByTestId(ids.seeResults).click();
  await expect(page.getByTestId(ids.resultsEmpty)).toBeVisible();
});

test('invalid upload shows an error, not a crash', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(ids.fileInput).setInputFiles(
    new URL('../fixtures/generated/fake.jpg', import.meta.url).pathname,
  );
  await expect(page.getByTestId(ids.captureError)).toBeVisible({ timeout: 30_000 });
});

test('scan survives page reload (state lives in the backend)', async ({ page }) => {
  await uploadPhoto(page, 'pile-small.jpg');
  const url = page.url();
  await page.reload();
  await expect(page.getByTestId(ids.reviewCanvas)).toBeVisible();
  expect(page.url()).toBe(url);
});
