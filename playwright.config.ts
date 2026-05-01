import { defineConfig, devices } from '@playwright/test';

const e2eDataDir = '.testhub-e2e';
const e2eDatabaseUrl = process.env.DATABASE_URL ?? 'postgres://testhub:testhub@localhost:55432/testhub';
const e2eSecretKey = process.env.TESTHUB_SECRET_KEY ?? 'testhub-e2e-secret';

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
      command: `sh -c 'rm -rf ${e2eDataDir} && TESTHUB_DATA_DIR=${e2eDataDir} DATABASE_URL=${e2eDatabaseUrl} TESTHUB_SECRET_KEY=${e2eSecretKey} TESTHUB_AUTH_MODE=local TESTHUB_ALLOW_PUBLIC_SIGNUP=true PORT=44321 npm run api-go & TESTHUB_DATA_DIR=${e2eDataDir} DATABASE_URL=${e2eDatabaseUrl} TESTHUB_SECRET_KEY=${e2eSecretKey} npm run worker'`,
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
