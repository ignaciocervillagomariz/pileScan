import { expect, type Page, request } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ids } from './testids';

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string) => path.join(here, '..', 'fixtures', 'generated', name);
export const API = process.env.BACKEND_URL ?? 'http://localhost:8080';

/** Results are 503 until the first catalog import has finished. */
export async function waitForCatalog(timeoutMs = 30 * 60_000): Promise<void> {
  const api = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api.get(`${API}/api/admin/catalog-import`);
    const state = (await res.json()).state;
    if (state === 'SUCCEEDED') return;
    if (state === 'FAILED') throw new Error('catalog import failed');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('catalog import timeout');
}

export async function uploadPhoto(page: Page, file: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId(ids.fileInput).setInputFiles(fixture(file));
  await expect(page.getByTestId(ids.reviewCanvas)).toBeVisible({ timeout: 90_000 });
}

export async function pickPart(page: Page, partNum: string): Promise<void> {
  await page.getByTestId(ids.partSearch).fill(partNum);
  await page.getByTestId(ids.partOption).filter({ hasText: new RegExp(`^\\s*${partNum}\\b`) }).first().click();
}
