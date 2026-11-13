import { expect, Page, Route, test } from '@playwright/test';

/**
 * Slice 10 (lát 10.7) storefront: sale prices on the API. `promotionsMode = http` + `catalogHttp`
 * make the e2e build read `/api/products*`, answered here with `Product` bodies shaped like
 * docs/api/openapi.yaml (price = the effective price, `compareAtPrice` = the original, `discountPercent`
 * and `saleEndsAt` while a sale runs). AC-PROMO-06 FE parts: the label is the server's number, never
 * recomputed; 0 hides it; the sale end date shows; the "Đang giảm giá" filter sends `sale=true`.
 */
type Json = Record<string, unknown>;

function product(slug: string, name: string, extra: Json = {}): Json {
  return {
    id: `00000000-0000-4000-8000-${String(slug.length).padStart(12, '0')}`,
    slug,
    name,
    type: 'Áo thun · Dáng suông',
    category: 'tops',
    moments: ['work'],
    genders: ['nam', 'nu'],
    price: 400_000,
    mediaId: 'editorial-home-hero',
    gallery: ['editorial-home-hero'],
    variants: [
      {
        id: `10000000-0000-4000-8000-${String(slug.length).padStart(12, '0')}`,
        sku: 'SKU-1',
        size: 'M',
        color: { name: 'Đen', hex: '#242323' },
        inventory: 9,
        stockStatus: 'IN_STOCK',
      },
    ],
    description: 'Mô tả.',
    material: 'Cotton',
    care: [],
    fit: { summary: 'Suông', model: 'Người mẫu 1m70, size M' },
    looks: [],
    createdAt: '2026-10-01',
    salesRank: 1,
    ...extra,
  };
}

// Sale running: 20% off, ends 20/11 (23:59:59 Vietnam time = 16:59:59Z).
const RUNNING = product('ao-dang-giam', 'Áo đang giảm', {
  price: 400_000,
  compareAtPrice: 500_000,
  discountPercent: 20,
  saleEndsAt: '2026-11-20T16:59:59.000Z',
});
// 499.000 over 500.000 floors to 0: the label stays hidden.
const TINY = product('ao-giam-nhe', 'Áo giảm nhẹ', {
  price: 499_000,
  compareAtPrice: 500_000,
  discountPercent: 0,
  saleEndsAt: '2026-11-20T16:59:59.000Z',
});
const PLAIN = product('ao-gia-thuong', 'Áo giá thường');

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=30' },
    body: JSON.stringify(body),
  });

async function usePromotions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('n2f.e2e.promotionsMode', 'http');
    localStorage.setItem('n2f.e2e.catalogHttp', 'http');
  });
}

test.describe('sale prices on the API (Slice 10)', () => {
  test('AC-PROMO-06: cards show the server price, label and end date', async ({ page }) => {
    await usePromotions(page);
    await page.route(/\/api\/products(\?.*)?$/, (route) =>
      fulfil(route, 200, { items: [RUNNING, TINY, PLAIN], total: 3, page: 1, limit: 24 }),
    );
    await page.goto('/shop');
    const cards = page.locator('n2f-product-card');
    await expect(cards).toHaveCount(3);
    const running = cards.filter({ hasText: 'Áo đang giảm' });
    await expect(running.locator('.badge')).toHaveText('-20%');
    await expect(running.locator('.price strong')).toContainText('400.000');
    await expect(running.locator('.price del')).toContainText('500.000');
    await expect(running.getByText('Giảm giá đến 20/11')).toBeVisible();
    // The server's 0 wins over any local rounding: no "-0%" and no "-1%".
    const tiny = cards.filter({ hasText: 'Áo giảm nhẹ' });
    await expect(tiny.locator('.badge')).toHaveCount(0);
    await expect(cards.filter({ hasText: 'Áo giá thường' }).locator('.badge')).toHaveCount(0);
  });

  test('AC-PROMO-06: the PDP shows price, crossed-out price, "Giảm X%" and the end date', async ({
    page,
  }) => {
    await usePromotions(page);
    await page.route('**/api/products/ao-dang-giam', (route) => fulfil(route, 200, RUNNING));
    await page.route('**/api/products/ao-giam-nhe', (route) => fulfil(route, 200, TINY));
    await page.route('**/api/size-charts/**', (route) =>
      fulfil(route, 200, { body: [], garment: [], bodyColumns: [], garmentColumns: [] }),
    );
    await page.goto('/product/ao-dang-giam');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Áo đang giảm');
    await expect(page.locator('.highlight')).toContainText('Giảm 20%');
    const info = page.locator('.product-info');
    await expect(info.locator('.price strong')).toContainText('400.000');
    await expect(info.locator('.price del')).toContainText('500.000');
    await expect(page.locator('.sale-end')).toHaveText('Giảm giá đến 20/11');

    await page.goto('/product/ao-giam-nhe');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Áo giảm nhẹ');
    await expect(page.locator('.highlight')).toHaveCount(0);
  });

  test('BR-PROMO-07: the "Đang giảm giá" filter sends sale=true and lives in the URL', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'On a phone the filters open in a dialog.');
    await usePromotions(page);
    const queries: URLSearchParams[] = [];
    await page.route(/\/api\/products(\?.*)?$/, (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      return fulfil(
        route,
        200,
        params.get('sale') === 'true'
          ? { items: [RUNNING], total: 1, page: 1, limit: 24 }
          : { items: [RUNNING, PLAIN], total: 2, page: 1, limit: 24 },
      );
    });
    await page.goto('/shop');
    await expect(page.locator('n2f-product-card')).toHaveCount(2);
    expect(queries[0].has('sale')).toBe(false);
    const filters = page.locator('#catalog-filters');
    await filters.getByLabel('Đang giảm giá').check();
    await expect(page).toHaveURL(/sale=true/);
    await expect(page.locator('n2f-product-card')).toHaveCount(1);
    expect(queries.at(-1)?.get('sale')).toBe('true');
    await filters.getByLabel('Đang giảm giá').uncheck();
    await expect(page.locator('n2f-product-card')).toHaveCount(2);
  });

  test('the filter is absent while promotionsMode is mock', async ({ page, isMobile }) => {
    test.skip(isMobile, 'On a phone the filters open in a dialog.');
    await page.goto('/shop');
    await expect(page.locator('#catalog-filters').getByLabel('Chỉ hiện còn hàng')).toBeVisible();
    await expect(page.locator('#catalog-filters').getByLabel('Đang giảm giá')).toHaveCount(0);
  });
});
