import { expect, Route, test } from '@playwright/test';

/**
 * Slice 10 (lát 10.8, Should) storefront: `/collections/:slug`. Mock mode reads the collections of
 * the mock back office; `contentMode = http` calls `GET /api/collections/{slug}`, answered here
 * with a body shaped like docs/api/openapi.yaml `CollectionDetail`. AC-CMS-07 FE parts.
 */
const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify(body),
  });

test.describe('collections page (Slice 10, Should)', () => {
  test('mock: an active collection lists its products, an unknown slug says so', async ({
    page,
  }) => {
    await page.goto('/collections/from-nine-to-fine');
    await expect(page.getByRole('heading', { level: 1, name: 'From Nine to Fine' })).toBeVisible();
    await expect(page.locator('n2f-product-card').first()).toBeVisible();

    await page.goto('/collections/khong-co-bo-suu-tap-nay');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy bộ sưu tập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Khám phá sản phẩm' })).toBeVisible();
  });

  test('http: 404 (draft / unknown) = not found, 5xx = a retry, empty = its own message', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('n2f.e2e.contentMode', 'http'));
    let answer = (route: Route) =>
      fulfil(route, 404, { error: { code: 'not-found', message: '' } });
    await page.route('**/api/collections/**', (route) => answer(route));
    await page.route('**/api/content/home', (route) =>
      fulfil(route, 200, { categories: [], moments: [], blocks: [] }),
    );
    await page.goto('/collections/ban-nhap');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy bộ sưu tập' })).toBeVisible();

    answer = (route) => fulfil(route, 500, { error: { code: 'unavailable', message: '' } });
    await page.goto('/collections/dang-ban');
    await expect(page.getByRole('heading', { name: 'Chưa tải được bộ sưu tập' })).toBeVisible();

    answer = (route) =>
      fulfil(route, 200, {
        slug: 'dang-ban',
        name: 'Đang bán',
        description: 'Mô tả ngắn.',
        products: [],
      });
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Đang bán' })).toBeVisible();
    await expect(page.getByText('Mô tả ngắn.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Bộ sưu tập chưa có sản phẩm nào đang bán' }),
    ).toBeVisible();
  });
});
