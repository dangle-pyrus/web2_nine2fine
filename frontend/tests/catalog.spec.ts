import { expect, test } from '@playwright/test';

// Mock catalog (e2e build): 8 products, so every page fits in one 24-item page.
// Pagination with 30 products, real stock and the HTTP-only hiding of reviews (AC-CAT-41, 43)
// need the local backend and are checked in the integration step.

test('AC-CAT-26: unknown slug shows "not found" with a way back, never a retry', async ({
  page,
}) => {
  await page.goto('/product/khong-co-san-pham');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy sản phẩm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Khám phá sản phẩm' }).click();
  await expect(page).toHaveURL(/\/shop$/);
});

test('AC-CAT-38: search with no match keeps the title, shows an empty state and (0)', async ({
  page,
}) => {
  await page.goto('/search?q=zzzz');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tìm kiếm.');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('(0)');
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy lựa chọn phù hợp' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
});

test('C6: search ignores accents and word order', async ({ page }) => {
  await page.goto('/search?q=midi%20dam');
  await expect(page.locator('n2f-product-card')).toHaveCount(1);
  await page.goto('/search?q=%C4%91%E1%BA%A7m');
  await expect(page.locator('n2f-product-card')).toHaveCount(1);
});

test('AC-CAT-41: no "Xem thêm" when every product is already shown; title counts the total', async ({
  page,
}) => {
  await page.goto('/shop');
  await expect(page.locator('n2f-product-card')).toHaveCount(8);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('(8)');
  await expect(page.getByRole('button', { name: 'Xem thêm' })).toHaveCount(0);
});

test('AC-CAT-44: a broken session cookie does not stop the listing', async ({ page, context }) => {
  await context.addCookies([{ name: 'n2f_sid', value: 'garbage', url: 'http://127.0.0.1:4200' }]);
  await page.goto('/shop');
  await expect(page.locator('n2f-product-card')).toHaveCount(8);
  await expect(page).toHaveURL(/\/shop$/);
});

test('C-sold-out (PDP/PLP, plan §3): fully sold-out product — disabled "Hết hàng", no "Mua ngay", card labelled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const inventory: Record<string, number> = {};
    for (let color = 0; color < 4; color++) {
      for (const size of ['S', 'M', 'L', 'XL']) inventory[`01-${color}-${size}`] = 0;
    }
    sessionStorage.setItem('n2f.mock.v3', JSON.stringify({ inventory }));
  });
  await page.goto('/product/the-everyday-blazer');
  const add = page.getByRole('button', { name: 'Hết hàng', exact: true });
  await expect(add).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mua ngay' })).toHaveCount(0);

  await page.goto('/shop');
  const card = page.locator('n2f-product-card', { hasText: 'The Everyday Blazer' });
  await expect(card.locator('.badge')).toHaveText('Hết hàng');
  await expect(card.locator('.quick-add')).toBeDisabled();
});
