import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Regression for the 403 on POST /api/scans from a non-localhost origin.
    {
      name: 'loopback-ip',
      testMatch: /(flow|states)\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: process.env.FRONTEND_URL_IP ?? 'http://127.0.0.1:4200' },
    },
  ],
});
