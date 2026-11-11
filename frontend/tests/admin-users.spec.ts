import { expect, Page, test } from '@playwright/test';
import { UsersApi, useUsersApi } from './admin-users-fake';

/**
 * Slice 7 (admin customers and staff) on the HTTP adapters. The e2e build keeps the earlier mock
 * back office by default (admin.spec.ts); these specs switch to `adminUsersMode = http` and answer
 * `/api/admin/{customers,staff,accounts}` with `admin-users-fake.ts`, which follows
 * docs/api/openapi.yaml (tag admin-customers, admin-staff). Test names carry the AC-USR code of
 * docs/product/PRD.md.
 */
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;
const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;

async function signIn(page: Page, [email, password]: readonly [string, string]): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/admin\/orders/);
}

const dialog = (page: Page) => page.getByRole('dialog');
const rows = (page: Page) => page.locator('tbody tr');
const alert = (page: Page) => dialog(page).getByRole('alert');

async function setup(page: Page, role: 'admin' | 'staff' = 'admin'): Promise<UsersApi> {
  const api = await useUsersApi(page, new UsersApi(role));
  await signIn(page, role === 'admin' ? ADMIN : STAFF);
  return api;
}

async function rowMenu(page: Page, name: string, item: RegExp): Promise<void> {
  await page.getByRole('button', { name: `Thao tác với ${name}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('admin customers on the API (Slice 7)', () => {
  test("AC-USR-07, 08: admin menu, settings holds only Nhân viên, no Won't fields", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('n2f.e2e.adminCatalogMode', 'http'));
    const api = await useUsersApi(page);
    await signIn(page, ADMIN);
    await expect(page.locator('nav.sidebar .menu-list a')).toHaveText([
      /Đơn hàng/,
      /Sản phẩm/,
      /Tồn kho/,
      /Khách hàng/,
      /Khuyến mãi/,
    ]);
    await expect(page.locator('nav.sidebar a[href="/admin/settings"]')).toHaveCount(1);
    await page.goto('/admin/settings');
    await expect(page.locator('.groups a')).toHaveText([/Nhân viên và phân quyền/]);
    for (const path of ['/admin/settings/store', '/admin/settings/audit', '/admin/reports']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Chưa khả dụng' })).toBeVisible();
    }
    await page.goto('/admin/customers/c-minh');
    await expect(page.getByRole('heading', { name: 'Nguyễn Văn Minh' })).toBeVisible();
    for (const gone of [
      'Xuất CSV',
      'Ghi chú nội bộ',
      'Tag',
      'Đã trả hàng',
      'Size hay mua',
      'Giá trị TB/đơn',
    ])
      await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
    expect(api.find('GET', /\/customers\/c-minh$/)).toHaveLength(1);
  });

  test('AC-USR-04: staff has Khách hàng, no Cài đặt, no lock button, staff screen is blocked', async ({
    page,
  }) => {
    await setup(page, 'staff');
    await expect(page.locator('nav.sidebar .menu-list a')).toContainText([/Khách hàng/]);
    await expect(page.locator('nav.sidebar a[href="/admin/settings"]')).toHaveCount(0);
    await page.goto('/admin/customers/c-minh');
    await expect(page.getByRole('heading', { name: 'Nguyễn Văn Minh' })).toBeVisible();
    await expect(page.getByTestId('toggle-lock')).toHaveCount(0);
    await page.goto('/admin/settings/staff');
    await expect(page.getByRole('heading', { name: 'Nhân viên và phân quyền' })).toHaveCount(0);
    await expect(page).not.toHaveURL(/settings\/staff/);
  });

  test('AC-USR-11: list sends q, limit and no pageSize; 20 rows then 5 on page 2', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/customers');
    await expect(rows(page)).toHaveCount(20);
    await expect(rows(page).first()).toContainText('Nguyễn Văn Minh');
    const first = api.find('GET', /\/customers$/)[0].url.searchParams;
    expect(first.get('limit')).toBe('20');
    expect(first.get('page')).toBe('1');
    expect(first.has('pageSize') || first.has('search') || first.has('status')).toBe(false);
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await expect(rows(page)).toHaveCount(5);
    expect(
      api
        .find('GET', /\/customers$/)
        .at(-1)!
        .url.searchParams.get('page'),
    ).toBe('2');
    await expect(page.getByText('21–25 trong 25 kết quả')).toBeVisible();
  });

  test('AC-USR-12: search goes out as q, cut at 100 characters', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/admin/customers');
    const search = page.getByLabel('Tìm khách hàng');
    await search.fill('nguyen van minh');
    await search.press('Enter');
    await expect(rows(page)).toHaveCount(1);
    expect(
      api
        .find('GET', /\/customers$/)
        .at(-1)!
        .url.searchParams.get('q'),
    ).toBe('nguyen van minh');
    await search.fill('x'.repeat(150));
    expect(await search.inputValue()).toHaveLength(100);
    await page.goto(`/admin/customers?search=${'y'.repeat(130)}`);
    await expect(page.getByLabel('Tìm khách hàng')).toHaveValue('y'.repeat(100));
    for (const request of api.find('GET', /\/customers$/))
      expect((request.url.searchParams.get('q') ?? '').length).toBeLessThanOrEqual(100);
  });

  test('AC-USR-13: tabs carry the counts, tier and view are sent as the contract names them', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/customers');
    const tabs = page.getByRole('navigation', { name: 'Lọc khách hàng' });
    await expect(tabs.getByRole('button', { name: /Tất cả/ })).toContainText('25');
    await expect(tabs.getByRole('button', { name: /Đã khóa/ })).toContainText('1');
    await tabs.getByRole('button', { name: /Đã khóa/ }).click();
    await expect(page).toHaveURL(/view=blocked/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Phạm Khoá Tài');
    expect(
      api
        .find('GET', /\/customers$/)
        .at(-1)!
        .url.searchParams.get('view'),
    ).toBe('blocked');
    await page.getByLabel('Lọc theo hạng').selectOption('bronze');
    await expect(rows(page)).toHaveCount(1);
    expect(
      api
        .find('GET', /\/customers$/)
        .at(-1)!
        .url.searchParams.get('tier'),
    ).toBe('bronze');
    await page.getByLabel('Lọc theo hạng').selectOption('gold');
    await expect(
      page.getByRole('heading', { name: 'Không tìm thấy khách hàng phù hợp' }),
    ).toBeVisible();
    await page.getByLabel('Lọc theo hạng').selectOption('');
    await page.getByLabel('Sắp xếp').selectOption('name');
    await expect
      .poll(() =>
        api
          .find('GET', /\/customers$/)
          .at(-1)!
          .url.searchParams.get('sort'),
      )
      .toBe('name');
  });

  test('AC-USR-44: a failed list keeps the filters and retries; empty and filtered states differ', async ({
    page,
  }) => {
    const api = await setup(page);
    api.failures.set('GET /customers', { status: 500, code: 'unavailable' });
    await page.goto('/admin/customers?tier=silver');
    await expect(
      page.getByRole('heading', { name: 'Không tải được danh sách khách hàng' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/tier=silver/);
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(rows(page)).toHaveCount(1);
    api.customers = [];
    await page.goto('/admin/customers');
    await expect(page.getByRole('heading', { name: 'Chưa có khách hàng' })).toBeVisible();
    await page.goto('/admin/customers?tier=gold');
    await expect(
      page.getByRole('heading', { name: 'Không tìm thấy khách hàng phù hợp' }),
    ).toBeVisible();
  });

  test('AC-USR-18, 19, 20: staff see what the server masked, no address book, no birth date', async ({
    page,
  }) => {
    const api = await setup(page, 'staff');
    await page.goto('/admin/customers');
    await expect(rows(page).first()).toContainText('mi***@gmail.com');
    await expect(rows(page).first()).toContainText('0912 *** 678');
    await expect(page.getByTestId('contact-masked')).toHaveText(
      'Liên hệ được ẩn bớt theo quyền của bạn.',
    );
    await page.getByLabel('Tìm khách hàng').fill('minh.nguyen@gmail.com');
    await page.getByLabel('Tìm khách hàng').press('Enter');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('mi***@gmail.com');
    await rows(page).first().getByRole('link', { name: 'Nguyễn Văn Minh' }).click();
    await expect(page.getByTestId('contact-masked')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sổ địa chỉ' })).toHaveCount(0);
    await expect(page.getByText('Sinh nhật')).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/customers\/c-minh/);
    await expect(page.getByRole('heading', { name: 'Nguyễn Văn Minh' })).toBeVisible();
    const body = await page.locator('#adm-main').innerHTML();
    expect(body).not.toContain('minh.nguyen');
    expect(body).not.toContain('0912345678');
    expect(api.find('GET', /\/customers\/c-minh$/)).toHaveLength(1);
  });

  test('AC-USR-17, 18, 20: admin sees the full profile, 10 orders linking to the order screen, "theo email"', async ({
    page,
  }) => {
    await setup(page);
    await page.goto('/admin/customers/c-minh');
    await expect(page.getByRole('link', { name: 'minh.nguyen@gmail.com' })).toBeVisible();
    await expect(page.locator('dd.num')).toHaveText('0912345678');
    await expect(page.getByText('14/03/1998')).toBeVisible();
    await expect(page.getByTestId('contact-masked')).toHaveCount(0);
    await expect(page.getByTestId('spent-this-year')).toContainText('20.000.000');
    const addresses = page.locator('.addresses li');
    await expect(addresses).toHaveCount(2);
    await expect(addresses.first()).toContainText('Mặc định');
    await expect(addresses.first()).toContainText('12 Lê Lợi');
    await expect(rows(page)).toHaveCount(10);
    await expect(rows(page).first().getByRole('link')).toHaveAttribute(
      'href',
      '/admin/orders/N2F-1000',
    );
    const all = page.getByRole('link', { name: 'Xem tất cả đơn (theo email)' });
    await expect(all).toHaveAttribute('href', /\/admin\/orders\?q=minh\.nguyen@gmail\.com$/);
    await rows(page).first().getByRole('link').click();
    await expect(page).toHaveURL(/\/admin\/orders\/N2F-1000/);
  });

  test('AC-USR-17: staff open every order in the page itself, paged, from the customer orders endpoint', async ({
    page,
  }) => {
    const api = await setup(page, 'staff');
    await page.goto('/admin/customers/c-minh');
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByRole('link', { name: /theo email/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Xem tất cả đơn' }).click();
    await expect(page.getByRole('heading', { name: /Tất cả đơn của khách \(12\)/ })).toBeVisible();
    const sent = api.find('GET', /\/customers\/c-minh\/orders$/)[0].url.searchParams;
    expect(sent.get('page')).toBe('1');
    expect(sent.get('limit')).toBe('20');
    await expect(page.locator('#all-orders tbody tr')).toHaveCount(12);
  });

  test('AC-USR-22, 23: locking asks for 5-250 characters, sends the reason once, then offers unlock', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/customers/c-minh');
    await page.getByTestId('toggle-lock').click();
    const confirm = dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true });
    await confirm.click();
    await expect(dialog(page).getByText('Nhập lý do từ 5 ký tự.')).toBeVisible();
    await dialog(page).getByLabel('Lý do').fill('abc');
    await confirm.click();
    await expect(dialog(page).getByText('Nhập lý do từ 5 ký tự.')).toBeVisible();
    expect(api.find('POST', /\/lock$/)).toHaveLength(0);
    await dialog(page).getByLabel('Lý do').fill('  Hoàn hàng gian lận lặp lại  ');
    api.delayMs = 500;
    await confirm.dblclick();
    await expect(confirm).toBeDisabled();
    await expect(dialog(page)).toHaveCount(0);
    expect(api.find('POST', /\/customers\/c-minh\/lock$/)).toHaveLength(1);
    expect(api.find('POST', /\/customers\/c-minh\/lock$/)[0].body).toEqual({
      reason: 'Hoàn hàng gian lận lặp lại',
    });
    await expect(page.getByText('Đã khóa tài khoản', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Khách không đăng nhập được cho đến khi bạn mở khoá.'),
    ).toBeVisible();
    await expect(page.getByText('Đơn đang xử lý không bị ảnh hưởng.')).toBeVisible();
    await expect(page.getByTestId('toggle-lock')).toHaveText(/Mở khóa tài khoản/);
    api.delayMs = 0;
    await page.getByTestId('toggle-lock').click();
    await dialog(page).getByRole('button', { name: 'Mở khóa tài khoản', exact: true }).click();
    await expect(page.getByTestId('toggle-lock')).toHaveText(/Khóa tài khoản/);
    expect(api.find('POST', /\/customers\/c-minh\/unlock$/)[0].body).toEqual({});
  });

  test('AC-USR-10: a lost connection, a 429 and a 422 keep the lock dialog and the reason', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/customers/c-minh');
    await page.getByTestId('toggle-lock').click();
    await dialog(page).getByLabel('Lý do').fill('Hoàn hàng gian lận');
    const confirm = dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true });
    api.aborts.add('POST /customers/c-minh/lock');
    await confirm.click();
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await expect(dialog(page).getByLabel('Lý do')).toHaveValue('Hoàn hàng gian lận');
    api.failures.set('POST /customers/c-minh/lock', {
      status: 429,
      code: 'rate-limited',
      extra: { retryAfterSeconds: 30 },
    });
    await confirm.click();
    await expect(alert(page)).toContainText('Chờ 30 giây');
    api.failures.set('POST /customers/c-minh/lock', {
      status: 422,
      code: 'validation',
      extra: { field: 'reason' },
    });
    await confirm.click();
    await expect(alert(page)).toContainText('Lý do cần từ 5 đến 250 ký tự');
    await confirm.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('toggle-lock')).toHaveText(/Mở khóa/);
    expect(api.find('POST', /\/lock$/)).toHaveLength(4);
  });

  test('AC-USR-43: the admin sign-in links to Quên mật khẩu', async ({ page }) => {
    await page.goto('/admin/login');
    const link = page.getByRole('link', { name: 'Quên mật khẩu' });
    // The storefront reset page only opens from the sign-in steps (it needs the email), so the link
    // goes to the storefront sign-in and the text says which steps lead to "Quên mật khẩu".
    await expect(link).toHaveAttribute('href', '/auth/login');
    await expect(page.getByText('chọn "Sử dụng mật khẩu" rồi "Quên mật khẩu"')).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});

test.describe('admin staff on the API (Slice 7)', () => {
  test('AC-USR-43, 08: statuses read Đã khóa, Chờ đặt mật khẩu, Hoạt động; "(bạn)" has no menu; matrix has no Won\'t rows', async ({
    page,
  }) => {
    await setup(page);
    await page.goto('/admin/settings/staff');
    const people = page.locator('.people li');
    await expect(people).toHaveCount(5);
    await expect(people.filter({ hasText: 'Võ Chờ Mật Khẩu' })).toContainText('Chờ đặt mật khẩu');
    await expect(people.filter({ hasText: 'Phạm Gia Hân' })).toContainText('Đã khóa');
    await expect(people.filter({ hasText: 'Trần Thu Hà' })).toContainText('Hoạt động');
    await expect(people.filter({ hasText: 'Lê Hai Admin' })).toContainText('Chưa đăng nhập');
    await expect(people.filter({ hasText: 'Nguyễn Quản Trị' })).toContainText('(bạn)');
    await expect(page.getByRole('button', { name: 'Thao tác với Nguyễn Quản Trị' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thao tác với Trần Thu Hà' })).toBeVisible();
    for (const gone of [
      'Xuất file',
      'Duyệt trả hàng',
      'Xem doanh thu',
      'Xem giá vốn',
      'Nhật ký hoạt động',
      'Thông tin & chính sách cửa hàng',
    ])
      await expect(page.getByText(gone)).toHaveCount(0);
    await expect(page.getByText('Khóa, mở khóa tài khoản khách')).toBeVisible();
  });

  test('AC-USR-32, 35: create asks to confirm email and role again, sends one Idempotency-Key even on retry', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    await page.getByRole('button', { name: 'Thêm nhân viên' }).click();
    await dialog(page).getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(dialog(page).getByText('Họ tên cần từ 2 ký tự.')).toBeVisible();
    await expect(dialog(page).getByText('Nhập email.')).toBeVisible();
    await dialog(page).getByLabel('Họ tên').fill('  Trần   Thu Hà ');
    await dialog(page).getByLabel('Email').fill('Ha.Tran@Nine2fine.test');
    await dialog(page)
      .getByRole('radio', { name: /Quản trị viên/ })
      .check();
    await dialog(page).getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(dialog(page).getByTestId('confirm-email')).toHaveText('ha.tran@nine2fine.test');
    await expect(dialog(page).getByTestId('confirm-role')).toHaveText('Quản trị viên');
    expect(api.find('POST', /\/staff$/)).toHaveLength(0);
    api.aborts.add('POST /staff');
    await dialog(page).getByRole('button', { name: 'Xác nhận và tạo' }).click();
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await dialog(page).getByRole('button', { name: 'Thử lại' }).click();
    await expect(dialog(page)).toHaveCount(0);
    const sent = api.find('POST', /\/staff$/);
    expect(sent).toHaveLength(2);
    expect(sent[0].headers['idempotency-key']).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(sent[1].headers['idempotency-key']).toBe(sent[0].headers['idempotency-key']);
    expect(sent[1].body).toEqual({
      name: 'Trần Thu Hà',
      email: 'ha.tran@nine2fine.test',
      role: 'admin',
    });
    await expect(page.getByTestId('staff-notice')).toContainText(
      'họ vẫn dùng Quên mật khẩu với email này',
    );
    const created = page.locator('.people li').filter({ hasText: 'ha.tran@nine2fine.test' });
    await expect(created).toContainText('Chờ đặt mật khẩu');
    await expect(created).toContainText('Quản trị viên');
  });

  test('AC-USR-33, 10: duplicate email points at the email box; a 429 says how long to wait', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    await page.getByRole('button', { name: 'Thêm nhân viên' }).click();
    await dialog(page).getByLabel('Họ tên').fill('Người Trùng');
    await dialog(page).getByLabel('Email').fill('minh.nguyen@gmail.com');
    await dialog(page).getByRole('button', { name: 'Tiếp tục' }).click();
    await dialog(page).getByRole('button', { name: 'Xác nhận và tạo' }).click();
    await expect(alert(page)).toContainText('Email này đã có tài khoản');
    await expect(dialog(page).getByLabel('Email')).toBeVisible();
    await dialog(page).getByLabel('Email').fill('nguoi.moi@nine2fine.test');
    await dialog(page).getByRole('button', { name: 'Tiếp tục' }).click();
    api.failures.set('POST /staff', {
      status: 429,
      code: 'rate-limited',
      extra: { retryAfterSeconds: 45 },
    });
    await dialog(page).getByRole('button', { name: 'Xác nhận và tạo' }).click();
    await expect(alert(page)).toContainText('Chờ 45 giây');
    const keys = api.find('POST', /\/staff$/).map((r) => r.headers['idempotency-key']);
    expect(new Set(keys).size).toBe(2);
    expect(api.staff.some((s) => s.email === 'minh.nguyen@gmail.com')).toBe(false);
  });

  test('AC-USR-05: a lost connection keeps the lock dialog and the row; locking again works once', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    const row = page.locator('.people li').filter({ hasText: 'Trần Thu Hà' });
    await rowMenu(page, 'Trần Thu Hà', /Khóa tài khoản/);
    await dialog(page).getByLabel('Lý do').fill('Nghỉ việc từ hôm nay');
    api.aborts.add('POST /staff/s2/lock');
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await expect(alert(page)).toContainText('Không kết nối được máy chủ');
    await expect(row).toContainText('Hoạt động');
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row).toContainText('Đã khóa');
    expect(api.find('POST', /\/staff\/s2\/lock$/)).toHaveLength(2);
    expect(api.events.filter((e) => e.event['action'] === 'locked')).toHaveLength(1);
    await rowMenu(page, 'Trần Thu Hà', /Mở khóa tài khoản/);
    await dialog(page).getByRole('button', { name: 'Mở khóa tài khoản', exact: true }).click();
    await expect(row).toContainText('Hoạt động');
  });

  test('AC-USR-38, 45: role change goes out as PUT role; last-admin and self-change read as plain sentences', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    const row = page.locator('.people li').filter({ hasText: 'Trần Thu Hà' });
    await rowMenu(page, 'Trần Thu Hà', /Đổi thành Quản trị viên/);
    await dialog(page).getByRole('button', { name: 'Đổi vai trò' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row).toContainText('Quản trị viên');
    expect(api.find('PUT', /\/staff\/s2\/role$/)[0].body).toEqual({ role: 'admin' });
    // s1 and s3 and s2 are admins now; the server says last-admin / self-change on demand.
    api.failures.set('PUT /staff/s3/role', { status: 409, code: 'last-admin' });
    await rowMenu(page, 'Lê Hai Admin', /Đổi thành Nhân viên/);
    await dialog(page).getByRole('button', { name: 'Đổi vai trò' }).click();
    await expect(alert(page)).toContainText(
      'Cửa hàng cần ít nhất một quản trị viên đang hoạt động',
    );
    await dialog(page).getByRole('button', { name: 'Hủy bỏ' }).click();
    api.failures.set('POST /staff/s3/lock', { status: 409, code: 'self-change' });
    await rowMenu(page, 'Lê Hai Admin', /Khóa tài khoản/);
    await dialog(page).getByLabel('Lý do').fill('Thử khoá chính mình');
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await expect(alert(page)).toContainText('Bạn không thể tự khoá hoặc tự đổi vai trò');
  });

  test('AC-USR-02, 10: forbidden hides nothing but says so; 401 sends the person to /admin/login', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    api.failures.set('POST /staff/s4/lock', { status: 403, code: 'forbidden' });
    await rowMenu(page, 'Võ Chờ Mật Khẩu', /Khóa tài khoản/);
    await dialog(page).getByLabel('Lý do').fill('Không còn làm việc');
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await expect(alert(page)).toContainText('không có quyền');
    // The mock sign-in would restore the session at /admin/login; a real revoked one cannot.
    await page.evaluate(() => sessionStorage.removeItem('n2f.admin.session'));
    api.failures.set('POST /staff/s4/lock', { status: 401, code: 'unauthenticated' });
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('.banner-body')).toContainText('Phiên đăng nhập đã hết hạn');
  });

  test('AC-USR-10: a staff list that fails shows the error with a retry, never a blank page', async ({
    page,
  }) => {
    const api = await setup(page);
    api.listDown = true;
    await page.goto('/admin/settings/staff');
    await expect(
      page.getByRole('heading', { name: 'Không tải được danh sách nhân viên' }),
    ).toBeVisible();
    api.listDown = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.locator('.people li')).toHaveCount(5);
  });

  test('AC-USR-42: the history of an account lists who did what, newest first', async ({
    page,
  }) => {
    const api = await setup(page);
    await page.goto('/admin/settings/staff');
    await rowMenu(page, 'Võ Chờ Mật Khẩu', /Lịch sử thao tác/);
    await expect(dialog(page).getByText('Chưa có thao tác nào.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Đóng' }).click();
    await rowMenu(page, 'Võ Chờ Mật Khẩu', /Khóa tài khoản/);
    await dialog(page).getByLabel('Lý do').fill('Nghỉ việc từ hôm nay');
    await dialog(page).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
    await rowMenu(page, 'Võ Chờ Mật Khẩu', /Lịch sử thao tác/);
    const list = dialog(page).getByTestId('history-list').locator('li');
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText('Khóa tài khoản');
    await expect(list.first()).toContainText('Nguyễn Quản Trị (Quản trị viên)');
    await expect(list.first()).toContainText('Lý do: Nghỉ việc từ hôm nay');
    await expect(list.first()).toContainText('thu hồi 2 phiên');
    expect(api.find('GET', /\/accounts\/s4\/history$/)).toHaveLength(2);
  });
});
