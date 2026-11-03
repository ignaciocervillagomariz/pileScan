import { expect, test } from '@playwright/test';
import { fetchScan, generated, photo, selectPhoto, uploadPhoto } from './helpers';
import { ids } from './testids';

test.use({ serviceWorkers: 'block' }); // let page.route see every request

test('loading state is shown while the scan is processed', async ({ page }) => {
  await page.route('**/api/scans', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await selectPhoto(page, photo('pile_light_5.jpg'));
  await page.getByTestId(ids.upload).click();
  await expect(page.getByTestId(ids.uploadLoading)).toBeVisible();
  await expect(page.getByTestId(ids.uploadStage)).toBeVisible();
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 120_000 });
});

test('server error shows the error banner and the user can retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/scans', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      fail = false;
      return route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Internal Server Error', status: 500 }) });
    }
    return route.continue();
  });
  await selectPhoto(page, photo('pile_light_5.jpg'));
  await page.getByTestId(ids.upload).click();
  await expect(page.getByTestId(ids.captureError)).toBeVisible();
  await expect(page.getByTestId(ids.uploadLoading)).toBeHidden();
  await expect(page.getByTestId(ids.preview)).toBeVisible(); // the chosen photo is kept
  await page.getByTestId(ids.upload).click();
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 120_000 });
});

test('network failure shows the error banner', async ({ page }) => {
  await page.route('**/api/scans', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  await selectPhoto(page, photo('pile_light_5.jpg'));
  await page.getByTestId(ids.upload).click();
  await expect(page.getByTestId(ids.captureError)).toBeVisible();
});

test('zero detections: guidance, retry link and debug view toggle', async ({ page }) => {
  await uploadPhoto(page, generated('blank.jpg')).catch(() => undefined);
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect(page.getByTestId(ids.zeroDetections)).toBeVisible();
  await expect(page.getByTestId(ids.zeroDetectionsTips)).toBeVisible();
  await expect(page.getByTestId(ids.zeroDetectionsRetry)).toBeVisible();
  const toggle = page.getByTestId(ids.debugToggle);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const img = page.getByTestId(ids.debugImage);
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
});

test('large photo is downscaled client-side to at most 2048 px on the long side', async ({ page }) => {
  const posted: number[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/scans')) posted.push(r.postDataBuffer()?.length ?? 0);
  });
  await selectPhoto(page, generated('pile-large.jpg'));
  await page.getByTestId(ids.upload).click();
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  const scan = await fetchScan(page);
  expect(Math.max(scan.image.width, scan.image.height)).toBeLessThanOrEqual(2048);
  expect(Math.max(scan.image.width, scan.image.height)).toBeGreaterThan(1500); // downscaled, not shrunk to a thumbnail
  expect(scan.image.width / scan.image.height).toBeCloseTo(4 / 3, 1);
  expect(posted.length).toBe(1);
});
