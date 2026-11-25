import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  name: 'staging',
  testDir: 'e2e',
  testMatch: 'entry.spec.ts',
  outputDir: 'test-results/staging',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.STAGING_BASE_URL || 'https://v3.rifqisetiawan.my.id',
    viewport: { width: 1024, height: 640 },
  },
});
