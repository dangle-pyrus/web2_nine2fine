import { expect, Page, test } from '@playwright/test';
import { InsightsApi, shift, todayVn, useInsightsApi } from './admin-insights-fake';

/**
 * Slice 8 (admin Tổng quan, Báo cáo, Cài đặt cửa hàng, Nhật ký) on the HTTP adapters. The e2e build
 * keeps the earlier mock back office by default (admin.spec.ts); these specs switch to
 * `adminInsightsMode = http` and answer `/api/admin/{dashboard,reports,settings/store,audit-log}`
 * and `/api/store/settings` with `admin-insights-fake.ts`, which follows docs/api/openapi.yaml.
 * Test names carry the AC code of docs/product/PRD.md; what needs the real database (totals over
 * real orders, rate limits, migrations) belongs to the backend tests.
 */
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;
const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;

async function signIn(page: Page, [email, password]: readonly [string, string]): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/admin');
}

async function setup(page: Page, role: 'admin' | 'staff' = 'admin'): Promise<InsightsApi> {
  const api = await useInsightsApi(page, new InsightsApi(role));
  await signIn(page, role === 'admin' ? ADMIN : STAFF);
  // The first dashboard request is done: later failures / aborts hit the call under test.
  await expect(page.getByTestId('kpi-orders')).toBeVisible();
  return api;
}

const money = (value: string) => new RegExp(value.replace(/\./g, '\\.') + '\\s?₫');
const menu = (page: Page) => page.locator('nav.sidebar .menu-list a');
const alert = (page: Page) => page.getByRole('alert');

test.describe('admin insights on the API (Slice 8)', () => {
  test("AC-INS-07, 08: admin menu and settings groups, Won't blocks stay hidden", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('n2f.e2e.adminCatalogMode', 'http');
      localStorage.setItem('n2f.e2e.adminUsersMode', 'http');
    });
    await useInsightsApi(page);
    await signIn(page, ADMIN);
    await expect(menu(page)).toHaveText([
      /Tổng quan/,
      /Đơn hàng/,
      /Tồn kho/,
      /Sản phẩm/,
      /Khách hàng/,
      /Khuyến mãi/,
      /Báo cáo/,
    ]);
    await expect(page.locator('nav.sidebar a[href="/admin/settings"]')).toHaveCount(1);
    await page.goto('/admin/settings');
    await expect(page.locator('.groups a')).toHaveText([
      /Thông tin cửa hàng/,
      /Nhân viên và phân quyền/,
      /Nhật ký hoạt động/,
    ]);
    for (const path of ['collections', 'reviews', 'content', 'returns']) {
      await page.goto(`/admin/${path}`);
      await expect(page.getByRole('heading', { name: 'Chưa khả dụng' })).toBeVisible();
    }
    // Dashboard: none of the Won't tiles.
    await page.goto('/admin');
    await expect(page.getByTestId('kpis')).toBeVisible();
    for (const gone of ['Tỷ lệ trả hàng', 'Đơn giao không thành công', 'Yêu cầu trả hàng'])
      await expect(page.getByText(gone)).toHaveCount(0);
  });

  test('AC-INS-04, DSH-09: staff sees Tổng quan with counts only and is kept out of the rest', async ({
    page,
  }) => {
    const api = await setup(page, 'staff');
    await expect(menu(page)).toHaveText([/Tổng quan/, /Đơn hàng/]);
    await expect(page.locator('nav.sidebar a[href="/admin/settings"]')).toHaveCount(0);
    await expect(page.getByTestId('kpi-orders')).toBeVisible();
    await expect(page.getByTestId('todo-toConfirm')).toBeVisible();
    // DASH-07: no money anywhere for staff; best sellers by units only.
    for (const id of ['netRevenue', 'averageOrderValue', 'returnRate'])
      await expect(page.getByTestId(`kpi-${id}`)).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Chỉ số biểu đồ' })).toHaveCount(0);
    await expect(page.getByTestId('dashboard-chart')).toHaveCount(0);
    const top = page.getByTestId('top-products');
    await expect(top).toBeVisible();
    await expect(top).not.toContainText('Doanh thu');
    await expect(page.getByTestId('recent-orders')).not.toContainText('Tổng tiền');
    await expect(page.locator('body')).not.toContainText(/\d\s?₫/);
    for (const path of ['/admin/reports', '/admin/settings/store', '/admin/settings/audit']) {
      await page.goto(path);
      await expect(page.getByTestId('kpi-orders')).toBeVisible();
      await expect(page).toHaveURL(/\/admin$/);
    }
    // Reports, settings and audit were never requested for staff.
    expect(api.find('GET', new RegExp('/admin/(reports|settings|audit-log)'))).toHaveLength(0);
  });

  test('AC-DSH-02, 08, 10: KPIs, comparison text, top products, range in the URL', async ({
    page,
  }) => {
    const api = await setup(page);
    const period = page.getByTestId('dashboard-period');
    // Today 1.200.000 against all of yesterday 1.000.000.
    await expect(page.getByTestId('kpi-netRevenue')).toContainText(money('1.200.000'));
    await expect(page.getByTestId('kpi-netRevenue')).toContainText('+20,0%');
    await expect(page.getByTestId('kpi-orders')).toContainText('Đơn đặt trong kỳ');
    await expect(period).toContainText('so với hôm qua');
    // DASH-08: the update time in Vietnam time.
    await expect(period).toContainText(/Cập nhật lúc .*\d{2}:\d{2}.*\(giờ Việt Nam\)/);
    await page.getByRole('button', { name: '7 ngày' }).click();
    await expect(page).toHaveURL(/range=7d/);
    // DASH-03/06: 7 days against the 7 days right before (O8 2.000.000).
    await expect(page.getByTestId('kpi-netRevenue')).toContainText(money('2.200.000'));
    await expect(page.getByTestId('kpi-netRevenue')).toContainText('+10,0%');
    await expect(period).toContainText('7 ngày qua');
    await expect(period).toContainText('so với 7 ngày trước đó');
    expect(api.find('GET', /\/dashboard$/).map((r) => r.url.searchParams.get('range'))).toEqual([
      'today',
      '7d',
    ]);
    await page.getByRole('button', { name: '30 ngày' }).click();
    // "Sản phẩm nổi bật": the API's top products by revenue for the range.
    const rows = page.getByTestId('top-products').locator('.top-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Áo thun cotton');
    await expect(rows.nth(1)).toContainText('Áo sơ mi linen');
    await expect(rows.nth(2)).toContainText('Quần kaki');
  });

  test('AC-DSH-05, 06: every count opens the matching orders / inventory tab', async ({ page }) => {
    await setup(page);
    const expected: Record<string, string> = {
      toConfirm: '/admin/orders?view=to-confirm',
      pendingPayment: '/admin/orders?view=pending-payment',
      toFulfil: '/admin/orders?view=to-fulfil',
      cancelRequests: '/admin/orders?view=cancel-requests',
      // DASH-05: only the late ones among the orders in transit.
      lateDelivery: '/admin/orders?view=in-transit&late=1',
      lowStock: '/admin/inventory?view=low',
      outOfStock: '/admin/inventory?view=out',
    };
    for (const [key, href] of Object.entries(expected))
      await expect(page.getByTestId(`todo-${key}`)).toHaveAttribute('href', href);
    // A tile at 0 stays, greyed out and not a link.
    await expect(page.getByTestId('todo-returnRequested')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('todo-returnRequested')).not.toHaveAttribute('href', /.+/);
    await expect(page.getByTestId('todo-lowStock').locator('.tile-count')).toHaveText('2');
    await page.getByTestId('todo-toConfirm').click();
    await expect(page).toHaveURL(/\/admin\/orders\?view=to-confirm/);
  });

  test('AC-DSH-10: empty store shows 0 and a note, a lost connection offers Thử lại', async ({
    page,
  }) => {
    const api = await setup(page);
    api.empty = true;
    api.aborts.add('GET /dashboard');
    await page.goto('/admin?range=7d');
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await expect(page).toHaveURL(/range=7d/);
    // DASH-08: while the error is shown no figure is shown.
    await expect(page.getByTestId('kpis')).toHaveCount(0);
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('recent-orders')).toContainText('Chưa có đơn trong khoảng này.');
    await expect(page.getByTestId('kpi-netRevenue')).toContainText(money('0'));
    await expect(page.getByTestId('kpi-netRevenue')).toContainText('—');
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);
    await expect(page).toHaveURL(/range=7d/);
  });

  test('AC-INS-10: 403, 429 with seconds and 401 sentences on the dashboard', async ({ page }) => {
    const api = await setup(page);
    api.failures.set('GET /dashboard', { status: 403, code: 'forbidden' });
    await page.goto('/admin');
    await expect(alert(page)).toContainText('Bạn không có quyền');
    api.failures.set('GET /dashboard', {
      status: 429,
      code: 'rate-limited',
      extra: { retryAfterSeconds: 12 },
      headers: { 'Retry-After': '12' },
    });
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(alert(page)).toContainText('Chờ 12 giây');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('kpi-netRevenue')).toBeVisible();
    // 401: the sentence is shown; the redirect to /admin/login itself is the interceptor's job
    // (admin-login.spec.ts), and the mock sign-in would bounce us back here anyway.
    api.failures.set('GET /dashboard', { status: 401, code: 'unauthenticated' });
    await page.getByRole('button', { name: 'Làm mới' }).click();
    await expect(alert(page)).toContainText('Phiên đăng nhập đã hết hạn');
  });

  test('AC-RPT-09, 12, 13, INS-08: blocks, totals and quick ranges (from / to in the URL)', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/reports');
    await expect(page.getByTestId('report-kpis')).toBeVisible();
    for (const gone of ['Lãi gộp', 'Lợi nhuận', 'Trả hàng', 'ABC', 'Heatmap', 'Theo vùng'])
      await expect(page.getByText(gone)).toHaveCount(0);
    await page.getByRole('button', { name: '30 ngày', exact: true }).click();
    const today = todayVn();
    await expect(page).toHaveURL(new RegExp(`from=${shift(today, -29)}&to=${today}`));
    await page.getByRole('button', { name: '365 ngày' }).click();
    await expect(page).toHaveURL(new RegExp(`from=${shift(today, -364)}&to=${today}`));
    // D-8..D: O1 + O3 + O2 + O8 = 4.200.000, shipping (60.000) is not revenue.
    await page.goto(`/admin/reports?from=${shift(today, -8)}&to=${today}`);
    await expect(page.getByTestId('kpi-revenue')).toContainText(money('4.200.000'));
    await expect(page.getByTestId('kpi-shippingCollected')).toContainText(money('60.000'));
    await expect(page.getByTestId('kpi-discountTotal')).toContainText(money('100.000'));
    await expect(page.getByTestId('kpi-completedOrders')).toContainText('4');
    await expect(page.getByTestId('by-category').locator('tbody tr')).toHaveText([
      /Áo.*3\.900\.000/,
      /Quần.*300\.000/,
    ]);
    await expect(page.getByTestId('by-payment').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByText('Theo danh mục hiện tại của sản phẩm')).toBeVisible();
    await expect(page.getByTestId('waterfall')).toBeVisible();
    // Top products live in the "Sản phẩm & tồn kho" tab (2026-11-15); by units, then by revenue.
    await page.getByTestId('tab-products').click();
    await expect(page).toHaveURL(/tab=products/);
    await page.getByRole('button', { name: 'Theo doanh thu' }).click();
    await expect(page).toHaveURL(/sort=revenue/);
    await expect(page).toHaveURL(/tab=products/);
    await expect(page.getByTestId('top-products').locator('tbody tr').first()).toContainText(
      'Áo thun cotton',
    );
    expect(api.find('GET', /reports\/sales$/).every((r) => r.url.searchParams.has('from'))).toBe(
      true,
    );
  });

  test('AC-RPT-09, AC-INS-10: a range over 366 days is refused next to the field, nothing is requested', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/reports');
    await expect(page.getByTestId('report-kpis')).toBeVisible();
    const before = api.find('GET', /reports\/sales$/).length;
    await page.getByLabel('Từ ngày').fill(shift(todayVn(), -399));
    await page.getByLabel('Đến ngày').fill(todayVn());
    await page.getByTestId('apply-range').click();
    await expect(page.locator('#rpt-to-err')).toContainText('Khoảng tối đa 366 ngày');
    await page.getByLabel('Đến ngày').fill(shift(todayVn(), 1));
    await page.getByTestId('apply-range').click();
    await expect(page.locator('#rpt-to-err')).toContainText('không được sau hôm nay');
    expect(api.find('GET', /reports\/sales$/)).toHaveLength(before);
  });

  test('AC-RPT-10: an empty range is flat, a lost connection keeps from / to', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/admin/reports?from=2025-01-01&to=2025-01-07&tab=products');
    await expect(page.getByTestId('top-products')).toContainText('Chưa có đơn trong khoảng này');
    await page.getByTestId('tab-sales').click();
    await expect(page.getByTestId('by-category')).toContainText('Chưa có đơn trong khoảng này');
    await expect(page.getByTestId('kpi-revenue')).toContainText(money('0'));
    await expect(page.getByTestId('kpi-revenue')).toContainText('—');
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);
    api.aborts.add('GET /reports/sales');
    await page.goto('/admin/reports?from=2026-10-01&to=2026-10-31');
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await expect(page.getByLabel('Từ ngày')).toHaveValue('2026-10-01');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('report-kpis')).toBeVisible();
    await expect(page).toHaveURL(/from=2026-10-01&to=2026-10-31/);
    expect(api.requests.at(-1)?.url.searchParams.get('to')).toBe('2026-10-31');
  });

  test('Báo cáo tabs (2026-11-15): customers, operations, promotions read /reports-extra only when open', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/reports');
    await expect(page.getByTestId('report-kpis')).toBeVisible();
    expect(api.find('GET', /reports-extra$/)).toHaveLength(0);
    await page.getByTestId('tab-customers').click();
    await expect(page).toHaveURL(/tab=customers/);
    await expect(page.getByTestId('customer-kpis')).toContainText('20,0%');
    await expect(page.getByTestId('by-province')).toContainText('TP. Hồ Chí Minh');
    expect(
      api
        .find('GET', /reports-extra$/)
        .at(-1)
        ?.url.searchParams.has('from'),
    ).toBe(true);
    await page.getByTestId('tab-operations').click();
    await expect(page.getByTestId('ops-kpis')).toContainText('45 phút');
    await expect(page.getByTestId('ops-kpis')).toContainText('75,0%');
    await expect(page.getByTestId('cancel-reasons')).toContainText('Không liên lạc được');
    await expect(page.getByTestId('return-reasons')).toContainText('Không vừa');
    await expect(page.getByTestId('order-heatmap')).toContainText('Cao điểm: T6');
    await page.getByTestId('tab-promotions').click();
    await expect(page.getByTestId('voucher-table')).toContainText('GIAM50K');
    await expect(page.getByTestId('promo-kpis')).toContainText(money('80.000'));
    // A failure shows a sentence and Thử lại, never sample numbers.
    api.failures.set('GET /reports-extra', { status: 403, code: 'forbidden' });
    await page.getByRole('button', { name: '7 ngày' }).click();
    await expect(page.getByTestId('extra-error')).toContainText('Bạn không có quyền');
    await page.getByTestId('extra-error').getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('voucher-table')).toBeVisible();
    await expect(page).toHaveURL(/tab=promotions/);
  });

  test('AC-RPT-11: CSV download keeps the server file name, a 429 says how long to wait', async ({
    page,
  }) => {
    const api = await setup(page);
    const today = todayVn();
    await page.goto(`/admin/reports?from=${shift(today, -1)}&to=${today}`);
    await expect(page.getByTestId('report-kpis')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe(`nine2fine-bao-cao-${shift(today, -1)}_${today}.csv`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(api.find('GET', /export$/)).toHaveLength(1);
    api.failures.set('GET /reports/sales/export', {
      status: 429,
      code: 'rate-limited',
      extra: { retryAfterSeconds: 7 },
    });
    await page.getByTestId('export-csv').click();
    await expect(page.getByText(/Chờ 7 giây/)).toBeVisible();
  });

  test('AC-SET-15: groups and wording of the store form (no Đổi trả, Hạng thành viên, bank)', async ({
    page,
  }) => {
    await setup(page);
    await page.goto('/admin/settings/store');
    await expect(page.getByRole('heading', { name: 'Thông tin cửa hàng', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Liên hệ' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vận chuyển và thanh toán' })).toBeVisible();
    for (const gone of ['Đổi trả', 'Hạng thành viên', 'Ngân hàng', 'Số tài khoản'])
      await expect(page.getByText(gone)).toHaveCount(0);
    await expect(page.locator('#set-operations-freeShippingThreshold-msg')).toContainText(
      'Giá trị hàng trước mã giảm giá.',
    );
    await expect(page.getByRole('link', { name: 'Sửa ở Tồn kho' })).toBeVisible();
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await expect(page.getByLabel('Giữ đơn chờ chuyển khoản')).toHaveValue('30');
  });

  test('AC-SET-16, INS-05: Lưu is off until something changes; two clicks send one request', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/store');
    const save = page.getByTestId('save');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await expect(save).toBeDisabled();
    api.delayMs = 400;
    await page.getByLabel('Phí vận chuyển', { exact: true }).fill('40000');
    await expect(save).toBeEnabled();
    await save.click();
    await save.click({ force: true, timeout: 500 }).catch(() => undefined);
    await expect(page.getByTestId('notice')).toContainText('Đã lưu');
    expect(api.find('PUT', /settings\/store$/)).toHaveLength(1);
    expect(api.saves).toBe(1);
    await expect(page.getByLabel('Phí vận chuyển', { exact: true })).toHaveValue('40000');
    await expect(save).toBeDisabled();
    // Free-ship wording of the storefront policy follows the saved values (server value kept).
    expect(api.settings.operations.shippingFee).toBe(40_000);
  });

  test('AC-SET-02, 05, 09: every rejected field is marked, nothing typed is lost', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/store');
    await page.getByLabel('Phí vận chuyển', { exact: true }).fill('45000');
    await page.getByLabel('Giữ đơn chờ chuyển khoản').fill('5');
    await page.getByLabel('Hotline').fill('123');
    await page.getByTestId('save').click();
    await expect(page.locator('#set-operations-bankHoldMinutes-msg')).toContainText(
      'từ 10 đến 1.440 phút',
    );
    await expect(page.locator('#set-info-hotline-msg')).toContainText(
      'Hotline cần 8 đến 11 chữ số',
    );
    await expect(page.getByLabel('Giữ đơn chờ chuyển khoản')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByLabel('Phí vận chuyển', { exact: true })).toHaveValue('45000');
    await expect(page.getByLabel('Hotline')).toHaveValue('123');
    await expect(page.getByLabel('Giữ đơn chờ chuyển khoản')).toHaveValue('5');
    await expect(page.getByTestId('save')).toBeEnabled();
    expect(api.settings.operations.shippingFee).toBe(30_000);
    expect(api.saves).toBe(0);
    // Fixing the field clears its message.
    await page.getByLabel('Giữ đơn chờ chuyển khoản').fill('60');
    await expect(page.locator('#set-operations-bankHoldMinutes-msg [role=alert]')).toHaveCount(0);
  });

  test('AC-SET-08: 409 reloads the server copy, keeps the draft and shows what changed', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/store');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await page.getByLabel('Hotline').fill('1900 1234');
    api.changeElsewhere((settings) => {
      settings.operations.shippingFee = 40_000;
    });
    await page.getByTestId('save').click();
    await expect(page.getByTestId('notice')).toContainText('vừa được người khác thay đổi');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 1234');
    await expect(page.getByTestId('theirs')).toContainText('40000');
    await expect(page.getByLabel('Phí vận chuyển', { exact: true })).toHaveValue('30000');
    expect(api.saves).toBe(0);
    // A second save now carries the new updatedAt and goes through.
    await page.getByTestId('save').click();
    await expect(page.getByTestId('notice')).toContainText('Đã lưu');
    expect(api.saves).toBe(1);
  });

  test('AC-INS-05: a lost connection keeps the values; saving again writes one audit row', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/store');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await page.getByLabel('Địa chỉ').fill('Tầng 6, 172 Hai Bà Trưng, Quận 1, TP. Hồ Chí Minh');
    api.aborts.add('PUT /settings/store');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('notice')).toContainText('Không kết nối được máy chủ');
    await expect(page.getByLabel('Địa chỉ')).toHaveValue(/Tầng 6/);
    await expect(page.getByTestId('save')).toBeEnabled();
    await page.getByTestId('save').click();
    await expect(page.getByTestId('notice')).toContainText('Đã lưu');
    expect(api.saves).toBe(1);
  });

  test('AC-SET-05: a free-shipping threshold of 0 asks first', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/store');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await page.getByLabel('Miễn phí vận chuyển từ').fill('0');
    await page.getByTestId('save').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('mọi đơn hàng đều được miễn phí vận chuyển');
    await dialog.getByRole('button', { name: 'Hủy bỏ' }).click();
    expect(api.find('PUT', /settings\/store$/)).toHaveLength(0);
    await page.getByTestId('save').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vẫn lưu' }).click();
    await expect(page.getByTestId('notice')).toContainText('Đã lưu');
    expect(api.settings.operations.freeShippingThreshold).toBe(0);
  });

  test('AC-SET-16: leaving with unsaved changes asks first', async ({ page }) => {
    await setup(page);
    await page.goto('/admin/settings/store');
    await expect(page.getByLabel('Hotline')).toHaveValue('1900 6868 29');
    await page.getByLabel('Giờ làm việc').fill('8:00 – 22:00');
    const prompts: string[] = [];
    page.on('dialog', (dialog) => {
      prompts.push(dialog.message());
      void dialog.dismiss();
    });
    // Below 1024px the menu is a drawer.
    const opener = page.getByRole('button', { name: 'Mở menu' });
    if (await opener.isVisible()) await opener.click();
    await page.locator('nav.sidebar').getByRole('link', { name: 'Đơn hàng' }).click();
    await expect.poll(() => prompts.length).toBe(1);
    expect(prompts[0]).toContain('thay đổi chưa lưu');
    await expect(page).toHaveURL(/\/admin\/settings\/store/);
    await expect(page.getByLabel('Giờ làm việc')).toHaveValue('8:00 – 22:00');
  });

  test('AC-INS-10: a 403 on the settings form shows a sentence and Thử lại', async ({ page }) => {
    const api = await setup(page);
    api.failures.set('GET /settings/store', { status: 403, code: 'forbidden' });
    await page.goto('/admin/settings/store');
    await expect(alert(page)).toContainText('Bạn không có quyền');
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });

  test('AC-AUD-05: filters live in the URL, rows open the order, empty and error states', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/audit');
    const rows = page.getByTestId('audit-table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('Nine2fine Staff');
    await expect(rows.first()).toContainText('Nhân viên');
    await expect(page.getByPlaceholder(/Tìm/)).toHaveCount(0);
    await expect(page.locator('#aud-type option')).toHaveText([
      'Mọi đối tượng',
      'Đơn hàng',
      'Tồn kho',
      'Khách hàng',
      'Nhân viên',
      'Cài đặt',
    ]);
    // Role change and settings rows show their details.
    await expect(rows.nth(3)).toContainText('Nhân viên → Quản trị viên');
    await expect(rows.nth(4)).toContainText('Phí vận chuyển: 30000 → 40000');
    await expect(page.getByRole('link', { name: '#N2F2611081801' })).toHaveAttribute(
      'href',
      '/admin/orders/N2F2611081801',
    );
    await expect(page.getByRole('link', { name: 'Nguyễn Văn Minh' })).toHaveAttribute(
      'href',
      '/admin/customers/c-minh',
    );
    await page.locator('#aud-type').selectOption('inventory');
    await expect(page).toHaveURL(/targetType=inventory/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Điều chỉnh tồn kho +5 (Nhập hàng)');
    expect(
      api
        .find('GET', /audit-log$/)
        .at(-1)
        ?.url.searchParams.get('targetType'),
    ).toBe('inventory');
    await page.locator('#aud-type').selectOption('');
    await page.getByRole('link', { name: '#N2F2611081801' }).click();
    // The order opens in the drawer over the list (old `/admin/orders/<code>` links land on `?order=`).
    await expect(page).toHaveURL(/\/admin\/orders(\/|\?order=)N2F2611081801/);
    await expect(page.getByRole('heading', { name: '#N2F2611081801' })).toBeVisible();
    // Empty range.
    await page.goto('/admin/settings/audit?from=2025-01-01&to=2025-01-10');
    await expect(page.getByText('Chưa có hoạt động trong khoảng này')).toBeVisible();
    // Lost connection, then Thử lại.
    api.aborts.add('GET /audit-log');
    await page.goto('/admin/settings/audit?targetType=order');
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(rows).toHaveCount(1);
    await expect(page).toHaveURL(/targetType=order/);
    // More than 92 days is refused next to the field.
    await page.getByLabel('Từ ngày').fill(shift(todayVn(), -120));
    await page.getByTestId('apply-range').click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Khoảng tối đa 92 ngày' }),
    ).toBeVisible();
  });

  test('AC-SET-14: the storefront footer reads /api/store/settings and falls back when it fails', async ({
    page,
  }) => {
    const api = new InsightsApi();
    await useInsightsApi(page, api);
    api.changeElsewhere((settings) => {
      settings.info.hotline = '0912 345 678';
      settings.info.hotlineHref = 'tel:0912345678';
      settings.info.address = 'Số 1 Lê Lợi, Quận 1, TP. Hồ Chí Minh';
      settings.info.registrationDate = '';
    });
    await page.goto('/');
    const legal = page.locator('.footer-legal');
    await expect(legal).toContainText('0912 345 678');
    await expect(legal).toContainText('Số 1 Lê Lợi');
    await expect(legal.locator('a[href="tel:0912345678"]')).toHaveCount(1);
    expect(api.find('GET', /store\/settings$/).length).toBeGreaterThan(0);
    // A failing request keeps the built-in values: no blank page, no hanging screen.
    const blocked = new InsightsApi();
    blocked.aborts.add('GET /api/store/settings');
    const second = await page.context().newPage();
    await useInsightsApi(second, blocked);
    await second.goto('/');
    await expect(second.locator('.footer-legal')).toContainText('1900 6868 29');
    await expect(second.locator('.footer-legal')).toContainText('Tầng 5, 172 Hai Bà Trưng');
  });
});
