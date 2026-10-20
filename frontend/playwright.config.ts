import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4200',
    // Tests start with an empty cart/wishlist; the demo seed (src/mocks/demo-seed) only fills
    // these keys when they are missing.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4200',
          localStorage: [
            { name: 'n2f.cart.v1', value: '[]' },
            { name: 'n2f.wishlist.v1', value: '[]' },
          ],
        },
      ],
    },
    trace: 'retain-on-failure',
    channel:
      process.env['PLAYWRIGHT_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm start -- --port 4200',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: true,
    timeout: 180000,
  },
});
