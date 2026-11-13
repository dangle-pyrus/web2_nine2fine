import { expect, Page, Route, test } from '@playwright/test';

/**
 * Slice 10 (lát 10.6) storefront: suggestions on the PDP and in the cart. `recommendationsMode =
 * http` makes the e2e build call `GET /api/recommendations`, answered here with `Product` bodies
 * shaped like docs/api/openapi.yaml (products stay on the mock catalog). AC-REC-04/05 FE parts: one
 * request per PDP / cart, nothing personal in it, an empty or failed answer hides the block and
 * never the page.
 */
const PDP = '/product/the-everyday-blazer';

type Json = Record<string, unknown>;

function product(n: number, extra: Json = {}): Json {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    slug: `goi-y-${n}`,
    name: `Gợi ý số ${n}`,
    type: 'Áo thun · Dáng suông',
    category: 'tops',
    moments: ['work'],
    genders: ['nam', 'nu'],
    price: 300_000 + n * 1000,
    mediaId: 'editorial-home-hero',
    gallery: ['editorial-home-hero'],
    variants: [
      {
        id: `10000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
        sku: `SKU-${n}`,
        size: 'M',
        color: { name: 'Đen', hex: '#242323' },
        inventory: 9,
        stockStatus: 'IN_STOCK',
      },
    ],
    description: '',
    material: '',
    care: [],
    fit: { summary: '', model: '' },
    looks: [],
    createdAt: '2026-10-01',
    salesRank: n,
    ...extra,
  };
}

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=30' },
    body: JSON.stringify(body),
  });

async function useRecommendations(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.recommendationsMode', 'http'));
}

test.describe('recommendations on the API (Slice 10)', () => {
  test('AC-REC-04: the PDP asks once with its product and shows what comes back', async ({
    page,
  }) => {
    await useRecommendations(page);
    const requests: URL[] = [];
    await page.route('**/api/recommendations**', (route) => {
      requests.push(new URL(route.request().url()));
      return fulfil(route, 200, { items: [product(1), product(2), product(3)] });
    });
    await page.goto(PDP);
    const region = page.getByRole('region', { name: 'Có thể bạn cũng thích' });
    await expect(region.locator('n2f-product-card')).toHaveCount(3);
    await expect(region.getByText('Gợi ý số 2')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('ids')).toBe('01');
    expect(requests[0].searchParams.get('limit')).toBe('4');
    // Public and the same for everyone: no user data is sent.
    expect([...requests[0].searchParams.keys()].sort()).toEqual(['ids', 'limit']);
  });

  test('AC-REC-03/04: an empty or failed answer hides the block, the page still works', async ({
    page,
  }) => {
    await useRecommendations(page);
    let answer = (route: Route) => fulfil(route, 200, { items: [] });
    await page.route('**/api/recommendations**', (route) => answer(route));
    await page.goto(PDP);
    await expect(page.getByRole('heading', { name: 'The Everyday Blazer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Có thể bạn cũng thích' })).toHaveCount(0);
    answer = (route) => fulfil(route, 500, { error: { code: 'unavailable', message: '' } });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'The Everyday Blazer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Có thể bạn cũng thích' })).toHaveCount(0);
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' }),
    ).toBeVisible();
  });

  test('AC-REC-02: the cart sends its products (empty cart: none) and shows the answer', async ({
    page,
  }) => {
    await useRecommendations(page);
    const requests: URL[] = [];
    await page.route('**/api/recommendations**', (route) => {
      requests.push(new URL(route.request().url()));
      return fulfil(route, 200, { items: [product(4), product(5)] });
    });
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Có thể bạn cũng thích' })).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    // Empty cart: best sellers (no ids).
    expect(requests[0].searchParams.has('ids')).toBe(false);

    await page.goto(PDP);
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await page.goto('/cart');
    await expect
      .poll(() => requests.some((url) => url.searchParams.get('ids') === '01'))
      .toBe(true);
    const cartBlock = page.locator('section.recommendations');
    await expect(cartBlock.locator('n2f-product-card')).toHaveCount(2);
  });
});
