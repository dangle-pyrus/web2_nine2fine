import { expect, Page, Route, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

/**
 * Slice 10 storefront follow-ups: the order-line "Viết đánh giá" link (BR-REV-09, per `canReview`),
 * the "Khoảnh khắc" menu from `GET /content/home` (BR-MOM-02) and `/collections` + its menu link
 * (BR-CMS-07, Should), with `contentMode = http` answered here per docs/api/openapi.yaml.
 */
const member = MOCK_ACCOUNTS[0];

const fulfil = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify(body),
  });

test('order detail: only lines with canReview link to the review form, which opens', async ({
  page,
}) => {
  await page.goto(`/auth/login?returnUrl=${encodeURIComponent('/account/orders/N2F260920003')}`);
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (6 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn #N2F260920003' })).toBeVisible();
  const links = page.getByRole('link', { name: /Viết đánh giá/ });
  await expect(links).toHaveCount(1);
  await links.click();
  await expect(page).toHaveURL(/\/product\/off-duty-top\?review=1#reviews$/);
  await expect(page.getByRole('form', { name: 'Viết đánh giá' })).toBeVisible();
});

async function httpContent(page: Page, collections: (route: Route) => Promise<void>) {
  await page.addInitScript(() => localStorage.setItem('n2f.e2e.contentMode', 'http'));
  await page.route('**/api/content/home', (route) =>
    fulfil(route, 200, {
      categories: [],
      blocks: [],
      moments: [
        {
          label: 'Tiệc cưới',
          href: '/shop-by-moment/event',
          moment: 'event',
          lines: ['Lịch lãm'],
          mediaId: 'editorial-moment-event',
          count: 3,
        },
      ],
    }),
  );
  await page.route('**/api/collections', (route) => collections(route));
}

test('menus: Moment cards come from content/home, "Bộ sưu tập" shows with an active collection', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop mega menu');
  await httpContent(page, (route) =>
    fulfil(route, 200, {
      items: [{ slug: 'he-2027', name: 'Hè 2027', description: '', productCount: 2 }],
    }),
  );
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const panel = page.locator('#mega-panel');
  await nav.getByRole('button', { name: 'Danh mục Khoảnh khắc' }).hover();
  await expect(panel.getByRole('link', { name: 'Tiệc cưới' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Work', exact: true })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Sản phẩm mới' }).hover();
  await expect(panel.getByRole('link', { name: 'Bộ sưu tập' })).toHaveAttribute(
    'href',
    '/collections',
  );
});

test('menus: a failing content/home keeps the static Moments, no collection hides the link', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop mega menu');
  await httpContent(page, (route) => fulfil(route, 200, { items: [] }));
  await page.route('**/api/content/home', (route) =>
    fulfil(route, 500, { error: { code: 'unavailable', message: '' } }),
  );
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const panel = page.locator('#mega-panel');
  await nav.getByRole('button', { name: 'Danh mục Khoảnh khắc' }).hover();
  await expect(panel.getByRole('link', { name: 'Work', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Sản phẩm mới' }).hover();
  await expect(panel.getByRole('link', { name: 'Hàng mới về' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Bộ sưu tập' })).toHaveCount(0);
});

test('/collections: list, empty and error with retry', async ({ page }) => {
  let answer = (route: Route) =>
    fulfil(route, 200, {
      items: [{ slug: 'he-2027', name: 'Hè 2027', description: 'Nhẹ nhàng.', productCount: 2 }],
    });
  await httpContent(page, (route) => answer(route));
  await page.goto('/collections');
  const card = page.getByRole('link', { name: /Hè 2027/ });
  await expect(card).toContainText('2 sản phẩm');
  await expect(card).toHaveAttribute('href', '/collections/he-2027');

  answer = (route) => fulfil(route, 200, { items: [] });
  await page.goto('/collections');
  await expect(page.getByRole('heading', { name: 'Chưa có bộ sưu tập nào' })).toBeVisible();

  answer = (route) => fulfil(route, 500, { error: { code: 'unavailable', message: '' } });
  await page.goto('/collections');
  await expect(page.getByRole('heading', { name: 'Chưa tải được bộ sưu tập' })).toBeVisible();
  answer = (route) => fulfil(route, 200, { items: [] });
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có bộ sưu tập nào' })).toBeVisible();
});
