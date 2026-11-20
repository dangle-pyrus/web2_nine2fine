import { expect, Page, Route, test } from '@playwright/test';

/**
 * Slice 10 (lát 10.3) storefront: home content from `GET /api/content/home`. `contentMode = http`
 * makes the e2e build read the home page from the API, answered here with a body shaped like
 * docs/api/openapi.yaml `HomeContentPublic`. AC-CMS-01, 05 FE parts: links with a query work, a
 * missing picture falls back, a failed read shows a retry instead of a blank page. "Shop by Moment"
 * was taken off the home page (2026-11-20): the API may still send `moments`, the page ignores them.
 */
type Json = Record<string, unknown>;

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify(body),
  });

function home(extra: Json = {}): Json {
  return {
    categories: [
      { label: 'Áo', href: '/shop/tops', mediaId: 'editorial-home-hero' },
      { label: 'Đầm', href: '/shop?category=dresses', mediaId: 'editorial-home-hero' },
    ],
    // `event` has no active product: the server leaves its card out.
    moments: [
      {
        moment: 'work',
        label: 'Work',
        lines: ['Đi làm', 'Chỉn chu mỗi ngày'],
        mediaId: 'editorial-moment-work',
        href: '/shop?moment=work',
        count: 12,
      },
      {
        moment: 'dinner',
        label: 'Dinner',
        lines: ['Bữa tối'],
        mediaId: 'editorial-moment-dinner',
        href: '/shop?moment=dinner',
        count: 4,
      },
    ],
    blocks: [
      {
        kind: 'campaign',
        id: 'hero',
        eyebrow: 'Mùa mới',
        title: 'Từ chín giờ đến tối',
        description: 'Nội dung do admin sửa.',
        href: '/shop?sort=newest',
        mediaId: 'editorial-home-hero',
        mobileMediaId: 'editorial-home-hero',
      },
      { kind: 'categories', id: 'cats' },
    ],
    ...extra,
  };
}

async function useContent(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.contentMode', 'http'));
}

test.describe('home content on the API (Slice 10)', () => {
  test('2026-11-20: the home page has no "Shop by Moment" block, even when the API sends moments', async ({
    page,
  }) => {
    await useContent(page);
    await page.route('**/api/content/home', (route) => fulfil(route, 200, home()));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Từ chín giờ đến tối' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Shop by Moment' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Chỉn chu mỗi ngày/ })).toHaveCount(0);
  });

  test('AC-CMS-01: a link with a query keeps it (campaign, category)', async ({ page }) => {
    await useContent(page);
    await page.route('**/api/content/home', (route) => fulfil(route, 200, home()));
    await page.goto('/');
    await page.locator('a.campaign-link').click();
    await expect(page).toHaveURL(/\/shop\?sort=newest$/);
    await page.goto('/');
    await page.getByRole('link', { name: 'Đầm' }).click();
    await expect(page).toHaveURL(/\/shop\?category=dresses$/);
  });

  test('AC-CMS-05: a picture that is gone shows the placeholder, the page stays up', async ({
    page,
  }) => {
    await useContent(page);
    const gone = 'up-0123456789abcdef0123456789abcdef.jpg';
    await page.route('**/api/media/**', (route) => route.fulfill({ status: 404, body: '' }));
    // A category picture that no longer exists on the server.
    await page.route('**/api/content/home', (route) =>
      fulfil(
        route,
        200,
        home({
          categories: [
            { label: 'Áo', href: '/shop/tops', mediaId: gone },
            { label: 'Đầm', href: '/shop?category=dresses', mediaId: 'editorial-home-hero' },
          ],
        }),
      ),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Từ chín giờ đến tối' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Áo' }).first()).toBeVisible();
    await expect(page.locator(`img[src*="/api/media/${gone}"]`)).toHaveCount(0);
  });

  test('a failed read shows a message and a retry, not a blank page', async ({ page }) => {
    await useContent(page);
    let fail = true;
    await page.route('**/api/content/home', (route) =>
      fail
        ? fulfil(route, 500, { error: { code: 'unavailable', message: '' } })
        : fulfil(route, 200, home()),
    );
    await page.goto('/');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Chưa tải được trang chủ' }),
    ).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('heading', { name: 'Từ chín giờ đến tối' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
