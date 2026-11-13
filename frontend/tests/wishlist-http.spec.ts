import { expect, Page, Route, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

/**
 * Slice 10 (lát 10.4) storefront: wishlist per account. `wishlistMode = http` makes the e2e build
 * call `/api/account/wishlist*`, answered here with bodies shaped like docs/api/openapi.yaml
 * (products stay on the mock catalog, ids '01'..). AC-WISH-05/06 FE parts: a guest's heart is
 * merged at sign-in (BR-AUTH-32 kept), the heart flips at once and is undone with a message on 409
 * / 429, a lost connection keeps the heart as unsynced, signing out clears the device.
 */
const member = MOCK_ACCOUNTS[0];
const PDP = '/product/the-everyday-blazer';
const BLAZER = '01';

type Json = Record<string, unknown>;

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: status === 204 ? undefined : JSON.stringify(body),
  });
const apiError = (code: string, message = '', extra: Json = {}) => ({
  error: { code, message, ...extra },
});
const entry = (productId: string, minute = 0) => ({
  productId,
  addedAt: `2026-11-10T03:${String(minute).padStart(2, '0')}:00.000Z`,
});

async function useWishlist(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.wishlistMode', 'http'));
}

async function signIn(page: Page, returnUrl: string): Promise<void> {
  await page.goto(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  await signInHere(page);
}

async function signInHere(page: Page): Promise<void> {
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\//);
}

const heart = (page: Page, saved: boolean) =>
  page.getByRole('button', {
    name: `${saved ? 'Bỏ yêu thích' : 'Yêu thích'} The Everyday Blazer`,
  });

test.describe('wishlist on the API (Slice 10)', () => {
  test('AC-WISH-05: a guest heart waits, then one merge at sign-in saves it (BR-AUTH-32)', async ({
    page,
  }) => {
    await useWishlist(page);
    const merges: Json[] = [];
    await page.route('**/api/account/wishlist/merge', (route) => {
      merges.push(route.request().postDataJSON() as Json);
      return fulfil(route, 200, { items: [entry(BLAZER)], total: 1, skipped: 0 });
    });
    await page.route('**/api/account/wishlist', (route) =>
      fulfil(route, 200, { items: [], total: 0 }),
    );
    await page.goto(PDP);
    await heart(page, false).click();
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=/);
    // The wish survives a reload of the login page (kept on the device, not in memory).
    await page.reload();
    await signInHere(page);
    await expect(page).toHaveURL(new RegExp(`${PDP}$`));
    await expect(heart(page, true)).toBeVisible();
    // Only what was not synced is sent, never the cached list.
    expect(merges).toEqual([{ productIds: [BLAZER] }]);
    await expect(page.getByRole('link', { name: 'Yêu thích (1 sản phẩm)' })).toBeVisible();
  });

  test('AC-WISH-05: the server list wins after sign-in; nothing is re-sent from the cache', async ({
    page,
  }) => {
    await useWishlist(page);
    // A stale cache of this device (the item was removed on another device).
    await page.addInitScript(() => {
      localStorage.setItem('n2f.wishlist.v2', JSON.stringify({ owner: null, ids: ['02', '03'] }));
    });
    let merges = 0;
    await page.route('**/api/account/wishlist/merge', (route) => {
      merges++;
      return fulfil(route, 200, { items: [], total: 0, skipped: 0 });
    });
    await page.route('**/api/account/wishlist', (route) =>
      fulfil(route, 200, { items: [entry('04', 2), entry('05', 1)], total: 2 }),
    );
    await signIn(page, '/wishlist');
    await expect(page.locator('n2f-product-card')).toHaveCount(2);
    expect(merges).toBe(0);
    await expect(page.getByRole('link', { name: 'Yêu thích (2 sản phẩm)' })).toBeVisible();
  });

  test('AC-WISH-06: the heart flips at once; 409 wishlist-full puts it back with a sentence', async ({
    page,
  }) => {
    await useWishlist(page);
    await page.route('**/api/account/wishlist', (route) =>
      fulfil(route, 200, { items: [], total: 0 }),
    );
    let answer = (route: Route) => fulfil(route, 409, apiError('wishlist-full'));
    let puts = 0;
    await page.route('**/api/account/wishlist/*', (route) => {
      if (route.request().method() === 'PUT') puts++;
      if (route.request().method() === 'DELETE') return fulfil(route, 204, null);
      return answer(route);
    });
    await signIn(page, PDP);
    await heart(page, false).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Danh sách yêu thích đã đủ 100 sản phẩm' }),
    ).toBeVisible();
    await expect(heart(page, false)).toBeVisible();

    answer = (route) => fulfil(route, 429, apiError('rate-limited', '', { retryAfterSeconds: 30 }));
    await heart(page, false).click();
    await expect(page.getByRole('status').filter({ hasText: 'Chờ 30 giây' })).toBeVisible();
    await expect(heart(page, false)).toBeVisible();

    answer = (route) => fulfil(route, 200, entry(BLAZER));
    await heart(page, false).click();
    await expect(heart(page, true)).toBeVisible();
    expect(puts).toBe(3);
    // Removing again sends DELETE and flips back.
    await heart(page, true).click();
    await expect(heart(page, false)).toBeVisible();
  });

  test('AC-WISH-06: a lost connection keeps the heart and queues it for the next merge', async ({
    page,
  }) => {
    await useWishlist(page);
    await page.route('**/api/account/wishlist', (route) =>
      fulfil(route, 200, { items: [], total: 0 }),
    );
    await page.route('**/api/account/wishlist/*', (route) => route.abort('failed'));
    await signIn(page, PDP);
    await heart(page, false).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu trên thiết bị' }),
    ).toBeVisible();
    await expect(heart(page, true)).toBeVisible();
    const unsynced = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('n2f.wishlist.unsynced.v1') ?? '[]'),
    );
    expect(unsynced).toEqual([BLAZER]);
  });

  test('AC-WISH-05: signing out on purpose clears the device list', async ({ page }) => {
    await useWishlist(page);
    await page.route('**/api/account/wishlist', (route) =>
      fulfil(route, 200, { items: [entry(BLAZER)], total: 1 }),
    );
    await signIn(page, '/account/profile');
    await expect(page.getByRole('link', { name: 'Yêu thích (1 sản phẩm)' })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Tài khoản' })
      .getByRole('button', { name: 'Đăng xuất' })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('n2f.wishlist.v2')!));
    expect(stored).toEqual({ owner: null, ids: [] });
  });
});
