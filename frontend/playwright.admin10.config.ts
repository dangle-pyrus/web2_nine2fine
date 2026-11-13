import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Local runner on its own port (the storefront agent holds 4200 and 4217). Not committed. */
const port = 4233;
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: origin,
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: 'n2f.cart.v2', value: '[]' },
            { name: 'n2f.wishlist.v1', value: '[]' },
          ],
        },
      ],
    },
  },
  webServer: {
    command: `npm run start:e2e -- --port ${port}`,
    url: origin,
    reuseExistingServer: true,
    timeout: 180000,
  },
});
