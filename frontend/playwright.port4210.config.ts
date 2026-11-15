// Tạm thời (nâng cấp admin 2026-11-15): chạy Playwright trên cổng 4210 vì cổng 4200 đang có
// một `ng serve` thường (không phải cấu hình e2e). Có thể xoá file này.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const ORIGIN = 'http://127.0.0.1:4210';

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: ORIGIN,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
          localStorage: [
            { name: 'n2f.cart.v2', value: '[]' },
            { name: 'n2f.wishlist.v1', value: '[]' },
          ],
        },
      ],
    },
  },
  webServer: {
    command: 'npm run start:e2e -- --port 4210',
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 240000,
  },
});
