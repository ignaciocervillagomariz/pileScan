import { expect, type Page, request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ids } from './testids';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Shared synthetic piles owned by team-lead. */
export const photo = (name: string) => path.join(here, '..', '..', 'fixtures', 'images', name);
export const generated = (name: string) => path.join(here, '..', 'fixtures', 'generated', name);
export const API = process.env.BACKEND_URL ?? 'http://localhost:8080';

/** Results are 503 until the first catalog import has finished. */
export async function waitForCatalog(timeoutMs = 30 * 60_000): Promise<void> {
  const api = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = (await (await api.get(`${API}/api/admin/catalog-import`)).json()).state;
    if (state === 'SUCCEEDED') return;
    if (state === 'FAILED') throw new Error('catalog import failed');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('catalog import timeout');
}

export async function selectPhoto(page: Page, file: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId(ids.captureInput).setInputFiles(file);
  await expect(page.getByTestId(ids.preview)).toBeVisible();
}

export async function uploadPhoto(page: Page, file: string): Promise<void> {
  await selectPhoto(page, file);
  await page.getByTestId(ids.upload).click();
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect(page.getByTestId(ids.canvas)).toBeVisible();
}

export async function total(page: Page): Promise<number> {
  const text = (await page.getByTestId(ids.totalCount).textContent()) ?? '';
  const m = text.match(/\d+/);
  if (!m) throw new Error(`no number in total-count: ${text}`);
  return Number(m[0]);
}

/** Opens the edit dialog for the n-th group's first piece (expanding the group if it has several). */
export async function openEditor(page: Page, groupIndex = 0): Promise<void> {
  const row = page.getByTestId(ids.groupRow).nth(groupIndex);
  const count = Number(await row.getAttribute('data-count'));
  await row.click();
  if (count > 1) await page.getByTestId(ids.detectionRow).first().click();
  await expect(page.getByTestId(ids.dialog)).toBeVisible();
}

export async function pickPart(page: Page, partNum: string): Promise<void> {
  await page.getByTestId(ids.partSearch).fill(partNum);
  await page.locator(`[data-testid="${ids.partOption}"][data-part-num="${partNum}"]`).first().click();
}

export async function pickColor(page: Page, colorId: number): Promise<void> {
  await page.locator(`[data-testid="${ids.colorOption}"][data-color-id="${colorId}"]`).first().click();
}

export interface ApiDetection { id: string; bbox: { x: number; y: number; width: number; height: number } | null }
export interface ApiScan { id: string; image: { width: number; height: number }; detections: ApiDetection[] }

export async function fetchScan(page: Page): Promise<ApiScan> {
  const id = page.url().match(/\/scan\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`no scan id in ${page.url()}`);
  const api = await request.newContext();
  const res = await api.get(`${API}/api/scans/${id}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}
