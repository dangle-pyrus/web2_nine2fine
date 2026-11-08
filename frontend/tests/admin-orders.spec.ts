import { expect, Page, test } from '@playwright/test';

/**
 * Slice 4, lát 4.1-4.2 (orders desk on the contract mock). The e2e build keeps the earlier mock
 * back office by default; these specs switch to the desk with `adminOrdersMode = contract-mock`.
 */
const MODE_KEY = 'n2f.e2e.adminOrdersMode';
const FAIL_KEY = 'n2f.e2e.orderDeskFail';

async function useDesk(page: Page, fail?: string): Promise<void> {
  await page.addInitScript(
    ([modeKey, failKey, failValue]) => {
      localStorage.setItem(modeKey, 'contract-mock');
      if (failValue && !sessionStorage.getItem('n2f.failset')) {
        localStorage.setItem(failKey, failValue);
        sessionStorage.setItem('n2f.failset', '1');
      }
    },
    [MODE_KEY, FAIL_KEY, fail ?? ''],
  );
}

async function signIn(
  page: Page,
  email = 'admin@nine2fine.vn',
  password = 'Admin2026Mock',
): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/admin\/orders/);
}

const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;
const rows = (page: Page) => page.locator('tbody tr');
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Chế độ xem đơn hàng' }).getByRole('button', { name });

test.describe('admin orders desk (contract mock)', () => {
  test.beforeEach(async ({ page }) => {
    await useDesk(page);
  });

  test('AC-ADM-01: signed out goes to sign-in and comes back to the order', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?returnUrl=%2Fadmin%2Forders/);
  });

  test('AC-ADM-04: staff vs admin actions, one-item menu, other routes unavailable', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await signIn(page, ...STAFF);
    await expect(page).toHaveURL(/\/admin\/orders$/);
    const menu = page.locator('nav.sidebar');
    await expect(menu.locator('.menu-list a')).toHaveCount(1);
    await expect(menu.locator('.menu-list a')).toContainText('Đơn hàng');
    await page.getByRole('link', { name: /N2F2611072359/ }).click();
    await expect(page.getByRole('button', { name: 'Bàn giao vận chuyển' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Huỷ: khách yêu cầu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Huỷ với lý do khác' })).toHaveCount(0);
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Chưa khả dụng' })).toBeVisible();
    expect(requests.filter((url) => /\/api\/admin\/(?!orders|auth)/.test(url))).toEqual([]);
  });

  test('AC-ADM-04: admin sees "Huỷ với lý do khác" on the same order', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/orders/N2F2611072359');
    await expect(page.getByRole('button', { name: 'Huỷ với lý do khác' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Huỷ với lý do khác' })).toBeDisabled();
  });

  test('AC-ADM-05: 45 orders, 20 per page, page 3 has 5, page 9 is empty', async ({ page }) => {
    await signIn(page);
    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByText('1–20 trong 45 kết quả')).toBeVisible();
    await expect(rows(page).first()).toContainText('N2F2611081801');
    await page.goto('/admin/orders?page=3');
    await expect(rows(page)).toHaveCount(5);
    await page.goto('/admin/orders?page=9');
    await expect(page.getByRole('heading', { name: 'Trang này không có đơn' })).toBeVisible();
  });

  test('AC-ADM-06: search by code, phone, email, name; % finds nothing; 100 char cap', async ({
    page,
  }) => {
    await signIn(page);
    const search = page.getByLabel('Tìm đơn hàng');
    for (const term of ['n2f2611081801', '#N2F2611081801', '0912345678', '+84912345678']) {
      await search.fill(term);
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText('N2F2611081801');
    }
    for (const term of ['A@X.VN', 'nguyen van']) {
      await search.fill(term);
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText('Nguyễn Văn A');
    }
    await search.fill('N2F26110');
    await expect(page.getByText('1–20 trong 45 kết quả')).toBeVisible();
    await search.fill('%');
    await expect(
      page.getByRole('heading', { name: 'Không tìm thấy đơn hàng phù hợp' }),
    ).toBeVisible();
    await search.fill('x'.repeat(101));
    await expect(search).toHaveValue('x'.repeat(100));
    await search.fill('');
    await expect(page.getByText('1–20 trong 45 kết quả')).toBeVisible();
  });

  test('AC-ADM-07: counts on every tab and each tab lists its own orders', async ({ page }) => {
    await signIn(page);
    const expected: [string, number][] = [
      ['Tất cả', 45],
      ['Chờ thanh toán', 3],
      ['Chờ xác nhận', 4],
      ['Đang chuẩn bị', 5],
      ['Đang vận chuyển', 4],
      ['Chờ duyệt huỷ', 2],
      ['Hàng hoàn', 2],
      ['Hoàn thành', 20],
      ['Đã huỷ', 5],
    ];
    for (const [name, count] of expected) {
      await expect(tab(page, name)).toContainText(String(count));
    }
    for (const [name, count] of expected.slice(1)) {
      await tab(page, name).click();
      await expect(rows(page)).toHaveCount(count);
    }
    await tab(page, 'Hàng hoàn').click();
    await expect(page.getByText('Hàng hoàn chờ xử lý').first()).toBeVisible();
  });

  test('AC-ADM-08: date range in GMT+7, payment filter, bad range, AND with tab and q', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin/orders?from=2026-11-08&to=2026-11-08');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('N2F2611081801');
    await page.goto('/admin/orders?from=2026-11-07&to=2026-11-07');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('N2F2611072359');
    await page.goto('/admin/orders');
    const all = await tab(page, 'Tất cả').innerText();
    await page.getByLabel('Lọc theo phương thức thanh toán').selectOption('cod');
    await expect(tab(page, 'Tất cả')).not.toHaveText(all);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.locator('tbody').getByText('Chưa thanh toán')).toHaveCount(0);
    await page.goto('/admin/orders?from=2026-11-09&to=2026-11-08');
    await expect(page.getByRole('alert').filter({ hasText: 'Ngày bắt đầu' })).toBeVisible();
    await page.goto('/admin/orders?view=to-confirm&q=nguyen&payment=cod');
    await expect(rows(page)).toHaveCount(1);
  });

  test('AC-ADM-09: detail by lower-case code, blocks, unknown code is not found', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin/orders/n2f2611081801');
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();
    await expect(page.getByText('Áo blazer dáng suông')).toBeVisible();
    await expect(page.getByText('BLZ-DEN-S')).toBeVisible();
    await expect(page.getByText(/2\.580\.000/).first()).toBeVisible();
    await expect(page.getByText('12 Nguyễn Huệ')).toBeVisible();
    await expect(page.getByText('Giao giờ hành chính')).toBeVisible();
    await expect(page.getByText('0912345678').first()).toBeVisible();
    await expect(page.getByText('a@x.vn')).toBeVisible();
    await expect(page.getByText('Gọi khách xác nhận đơn COD')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ghi không liên lạc được' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bàn giao vận chuyển' })).toHaveCount(0);
    await page.goto('/admin/orders/%23N2F2611081801');
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();
    await page.goto('/admin/orders/N2F0000000000');
    await expect(
      page.getByRole('heading', { name: 'Không tìm thấy đơn hàng' }).first(),
    ).toBeVisible();
  });

  test('AC-ADM-10: timeline newest first with actor, time and internal note', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/orders/N2F2611041777');
    await expect(page.locator('.timeline .title')).toHaveText([
      'Bàn giao vận chuyển',
      'Khách xác nhận đơn',
      'Ghi chú nội bộ',
      'Ghi nhận không liên lạc được',
      'Khách đặt hàng',
    ]);
    const first = page.locator('.timeline li').first();
    await expect(first).toContainText('Trần Thu Hằng (Nhân viên)');
    await expect(first).toContainText('GHTK-41777');
    await expect(page.locator('.timeline li').nth(2)).toContainText('Lê Quản Trị (Quản trị viên)');
    await expect(page.locator('.timeline li').nth(2)).toContainText('Khách nhờ gọi lại sau 17:00');
    await expect(page.locator('.timeline li').last()).toContainText('Khách ·');
  });
});

test.describe('admin orders desk states', () => {
  test('list error shows Thử lại and recovers', async ({ page }) => {
    await useDesk(page, 'list-once');
    await signIn(page);
    await expect(
      page.getByRole('heading', { name: 'Không tải được danh sách đơn hàng' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(rows(page)).toHaveCount(20);
  });

  test('detail error shows Thử lại and recovers', async ({ page }) => {
    await useDesk(page);
    await signIn(page);
    await page.evaluate((key) => localStorage.setItem(key, 'detail-once'), FAIL_KEY);
    await page.getByRole('link', { name: /N2F2611081801/ }).click();
    await expect(page.getByRole('heading', { name: 'Không tải được đơn hàng' })).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();
  });

  test('loading skeleton shows before the first page', async ({ page }) => {
    await useDesk(page);
    await signIn(page);
    await page.goto('/admin/orders?view=completed');
    await expect(page.locator('tbody tr[aria-hidden="true"]').first()).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
  });
});

test.describe('admin orders mock mode', () => {
  test('AC-ADM-44: mock mode keeps the earlier back office and calls no orders API', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('admin@nine2fine.vn');
    await page.getByLabel('Mật khẩu').fill('Admin2026Mock');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(/\/admin\/?$/);
    await expect(page.locator('a[href="/admin/inventory"]')).toHaveCount(1);
    expect(requests.filter((url) => url.includes('/api/admin/orders'))).toEqual([]);
  });
});
