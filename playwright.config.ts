import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Run one WebGL scene at a time to avoid competing software-renderer startups.
  workers: 1,
  expect: { timeout: 12_000 },
  webServer: {
    command: 'npm run build -- --outDir .superpowers/e2e-dist && npm exec -- vite preview --outDir .superpowers/e2e-dist --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    timeout: 120_000,
    env: { VITE_EXPOSE_APP: '1' },
  },
  use: { baseURL: 'http://127.0.0.1:4175' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } }, testIgnore: /nojs/ },
    { name: 'nojs', use: { ...devices['Desktop Chrome'], javaScriptEnabled: false }, testMatch: /nojs/ },
  ],
});
