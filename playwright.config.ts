import { defineConfig, devices } from '@playwright/test';

const e2eDataDir = '.testhub-e2e';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3335',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `rm -rf ${e2eDataDir} && TESTHUB_DATA_DIR=${e2eDataDir} PORT=44321 npm run server`,
      url: 'http://127.0.0.1:44321/api/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'NEXT_PUBLIC_TESTHUB_API_URL=http://127.0.0.1:44321 npx next start apps/web -p 3335',
      url: 'http://127.0.0.1:3335/v2',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
