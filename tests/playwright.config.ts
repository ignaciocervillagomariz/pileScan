import { defineConfig, devices } from '@playwright/test';

/**
 * The home hero needs hardware WebGL2 (software rendering gets the static surface), so its
 * projects launch Chromium with the GPU on. Metal is the ANGLE backend on macOS.
 */
const gpuArgs = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
];
const hero = /hero\.spec\.ts/;

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
    { name: 'mobile', testIgnore: hero, use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testIgnore: hero, use: { ...devices['Desktop Chrome'] } },
    // Pointer-driven physics tests: one retry absorbs a frame-timing hiccup, and a retry shows as flaky.
    {
      name: 'hero-desktop',
      testMatch: hero,
      retries: 1,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: gpuArgs } },
    },
    {
      name: 'hero-mobile',
      testMatch: hero,
      retries: 1,
      use: { ...devices['Pixel 7'], launchOptions: { args: gpuArgs } },
    },
    // Regression for the 403 on POST /api/scans from a non-localhost origin.
    {
      name: 'loopback-ip',
      testMatch: /(flow|states)\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: process.env.FRONTEND_URL_IP ?? 'http://127.0.0.1:4200' },
    },
  ],
});
