import { expect, test } from '@playwright/test';

/**
 * A user that came from the real backend (`GET /auth/me`) is not in the mock account store while
 * the account area is still mocked. The persisted mock session is seeded with such a user.
 */
const USER = {
  id: '5b1c9d0e-4f6a-4a39-9d2b-0c6f4f6a1e11',
  email: 'real.user@nine2fine.test',
  firstName: 'Linh',
  lastName: 'Phạm',
  role: 'member',
};

test.describe('signed-in user missing from the mock store', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      const key = 'n2f.mock.v3';
      // Seed once; later page loads keep whatever the app saved (e.g. after sign-out).
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, JSON.stringify({ 'auth-session': user }));
      }
    }, USER);
  });

  test('avatar opens the account area and keeps the session until sign-out', async ({ page }) => {
    await page.goto('/new-in');
    await page.getByRole('link', { name: `Tài khoản của ${USER.firstName}` }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    // Wait out the mock latency (400 ms) so a late `unauthorized` would have signed us out.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ tài khoản' })).toBeVisible();
    await expect(page.getByText(USER.email).first()).toBeVisible();

    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/account\/profile$/);

    for (const [path, heading] of [
      ['/account/addresses', 'Địa chỉ nhận hàng'],
      ['/account/orders', 'Lịch sử mua hàng'],
      ['/account/vouchers', 'Phiếu giảm giá của bạn'],
    ]) {
      await page.goto(path);
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }

    await page.goto('/account/profile');
    await page
      .getByRole('navigation', { name: 'Tài khoản' })
      .getByRole('button', { name: 'Đăng xuất' })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await page.reload();
    await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: `Tài khoản của ${USER.firstName}` })).toHaveCount(
      0,
    );
  });

  test('checkout and wishlist work for that user', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/checkout$/);
    await page.goto('/wishlist');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(page.getByRole('link', { name: `Tài khoản của ${USER.firstName}` })).toBeVisible();
  });
});
