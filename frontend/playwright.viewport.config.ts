import { defineConfig, devices } from '@playwright/test';
import { mockSessionState } from './e2e/authSession';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/responsive-viewports.spec.ts',
  fullyParallel: true,
  workers: 4,
  timeout: 30_000,
  reporter: 'list',
  outputDir: './test-results/viewport',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    storageState: mockSessionState('http://127.0.0.1:4173'),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
