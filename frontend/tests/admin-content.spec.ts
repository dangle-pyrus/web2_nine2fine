import { expect, Page, test } from '@playwright/test';
import { CatalogApi, useCatalogApi } from './admin-catalog-fake';
import { ContentApi, useContentApi } from './admin-content-fake';

/**
 * Slice 10 admin side on the HTTP adapters: review moderation (10.5), home content and size charts
 * (10.3), collections (10.8), the sale fields and the bulk sale (10.7), and the return source /
 * `returnPending` labels (10.2). The e2e build keeps the earlier mock back office by default; each
 * spec sets `reviewsMode` / `contentMode` / `promotionsMode` to `http` and answers
 * `/api/admin/**` with `admin-content-fake.ts` (docs/api/openapi.yaml).
 */
const ADMIN = ['admin@nine2fine.vn', 'Admin2026Mock'] as const;
const STAFF = ['staff@nine2fine.vn', 'Staff2026Mock'] as const;
type Account = readonly [string, string];

async function signIn(page: Page, [email, password]: Account): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/admin\/orders/);
}

async function setup(page: Page, role: 'admin' | 'staff'): Promise<ContentApi> {
  const api = await useContentApi(page, role);
  await signIn(page, role === 'admin' ? ADMIN : STAFF);
  return api;
}

/** The save bar sits at the bottom; on a phone a toast or the table can cover it, so click by event. */
async function saveBar(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).dispatchEvent('click');
}

const toast = (page: Page) => page.getByRole('status');
const dialog = (page: Page) => page.getByRole('dialog');

test.describe('admin Slice 10: reviews, content, collections', () => {
  test('BR-P1-03: menu follows the permissions; staff reads content but cannot save', async ({
    page,
  }) => {
    const api = await setup(page, 'staff');
    const menu = page.locator('nav.sidebar .menu-list a');
    for (const label of ['Nội dung trang chủ', 'Bộ sưu tập', 'Bảng size', 'Đánh giá'])
      await expect(menu.filter({ hasText: label })).toHaveCount(1);
    await page.goto('/admin/content');
    await expect(page.getByRole('heading', { name: 'Nội dung trang chủ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm khối' })).toHaveCount(0);
    await page.goto('/admin/collections');
    await expect(page.getByRole('heading', { name: 'Bộ sưu tập' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo bộ sưu tập' })).toHaveCount(0);
    await page.goto('/admin/size-charts');
    await expect(page.getByRole('button', { name: 'Thêm cột' })).toHaveCount(0);
    expect(api.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });

  test('AC-REV: tabs with counts, hide needs a reason, reply 5+ characters, show again', async ({
    page,
  }) => {
    const api = await setup(page, 'staff');
    await page.goto('/admin/reviews');
    await expect(page.locator('.review')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Chưa trả lời/ })).toContainText('2');
    await expect(page.getByRole('button', { name: /2 sao trở xuống/ })).toContainText('1');
    await page.getByRole('button', { name: /Chưa trả lời/ }).click();
    await expect(page.locator('.review')).toHaveCount(2);
    expect(
      api
        .find('GET', /\/reviews$/)
        .at(-1)
        ?.query.get('view'),
    ).toBe('unanswered');

    // Reply: at least 5 characters.
    const first = page.locator('.review').first();
    await first.getByRole('button', { name: 'Trả lời' }).click();
    await first.getByLabel('Phản hồi').fill('Cảm');
    await expect(first.getByRole('button', { name: 'Đăng phản hồi' })).toBeDisabled();
    await first.getByLabel('Phản hồi').fill('Cảm ơn bạn nhiều');
    await first.getByRole('button', { name: 'Đăng phản hồi' }).click();
    await expect(toast(page)).toContainText('Đã đăng phản hồi');
    const reply = api.find('PUT', /\/reply$/).at(-1)!;
    expect(reply.body).toMatchObject({ body: 'Cảm ơn bạn nhiều' });
    expect(reply.body?.['updatedAt']).toBeTruthy();
    await expect(page.locator('.review')).toHaveCount(1);

    // Hide: the reason is mandatory.
    await page.getByRole('button', { name: /Tất cả/ }).click();
    await page.locator('.review').first().getByRole('button', { name: 'Ẩn khỏi cửa hàng' }).click();
    await dialog(page).getByRole('button', { name: 'Ẩn đánh giá' }).click();
    await expect(dialog(page).getByText('Nhập lý do từ 5 ký tự.')).toBeVisible();
    expect(api.find('POST', /\/hide$/)).toHaveLength(0);
    await dialog(page).getByLabel('Lý do').fill('Có lời lẽ xúc phạm');
    await dialog(page).getByRole('button', { name: 'Ẩn đánh giá' }).click();
    await expect(toast(page)).toContainText('Đã ẩn đánh giá');
    expect(api.find('POST', /\/hide$/).at(-1)?.body).toMatchObject({
      reason: 'Có lời lẽ xúc phạm',
    });
    await page.getByRole('button', { name: /Đã ẩn/ }).click();
    await expect(page.locator('.review')).toHaveCount(1);
    await page.locator('.review').first().getByRole('button', { name: 'Hiện lại' }).click();
    await expect(toast(page)).toContainText('Đã hiện lại đánh giá');
  });

  test('BR-REV-07: a lost race (409) reloads the list and says so', async ({ page }) => {
    const api = await setup(page, 'staff');
    await page.goto('/admin/reviews');
    await expect(page.locator('.review')).toHaveCount(3);
    api.conflictOnce.add('review');
    const before = api.find('GET', /\/reviews$/).length;
    await page.locator('.review').first().getByRole('button', { name: 'Trả lời' }).click();
    await page.locator('.review').first().getByLabel('Phản hồi').fill('Cảm ơn bạn nhiều');
    await page.getByRole('button', { name: 'Đăng phản hồi' }).click();
    await expect(toast(page)).toContainText('vừa được người khác cập nhật');
    await expect.poll(() => api.find('GET', /\/reviews$/).length).toBeGreaterThan(before);
  });

  test('BR-CMS-02: save sends updatedAt; 409 keeps my text and offers the server copy', async ({
    page,
  }) => {
    const api = await setup(page, 'admin');
    await page.goto('/admin/content');
    await page.locator('.block-main').first().click();
    const title = page.getByLabel('Tiêu đề', { exact: true });
    await title.fill('Bộ sưu tập mới');
    await saveBar(page, 'Lưu và đăng');
    await expect(toast(page)).toContainText('Đã lưu trang chủ');
    const first = api.find('PUT', /\/content\/home$/).at(-1)!;
    expect(first.body?.['updatedAt']).toBeNull();
    expect((first.body?.['moments'] as unknown[]).length).toBe(4);

    // Someone else saved in between: 409 with the current copy; my text stays.
    api.conflictOnce.add('home');
    await title.fill('Chỉnh lần hai');
    await saveBar(page, 'Lưu và đăng');
    const banner = page.getByRole('alert').filter({ hasText: 'Người khác vừa lưu trang chủ' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Admin khác');
    await expect(title).toHaveValue('Chỉnh lần hai');
    await banner.getByRole('button', { name: 'Giữ bản của tôi' }).click();
    await saveBar(page, 'Lưu và đăng');
    await expect(toast(page)).toContainText('Đã lưu trang chủ');
    const second = api.find('PUT', /\/content\/home$/).at(-1)!;
    expect(second.body?.['updatedAt']).not.toBeNull();
    expect((second.body?.['blocks'] as { title: string }[])[0].title).toBe('Chỉnh lần hai');
  });

  test('BR-CMS-02: field errors arrive by path and are listed; reset asks first', async ({
    page,
  }) => {
    const api = await setup(page, 'admin');
    api.homeFieldErrors = [
      { field: 'blocks[0].title', message: 'Tiêu đề tối đa 80 ký tự.' },
      { field: 'moments[1].lines[0]', message: 'Dòng chữ tối đa 60 ký tự.' },
    ];
    await page.goto('/admin/content');
    await page.locator('.block-main').first().click();
    await page.getByLabel('Tiêu đề', { exact: true }).fill('Một tiêu đề khác');
    await saveBar(page, 'Lưu và đăng');
    const list = page.getByRole('alert').filter({ hasText: 'Chưa lưu được' });
    await expect(list).toContainText('blocks[0].title');
    await expect(list).toContainText('moments[1].lines[0]');
    await expect(page.getByText('Tiêu đề tối đa 80 ký tự.').first()).toBeVisible();

    await page.getByRole('button', { name: 'Thao tác khác' }).click();
    await page.getByRole('menuitem', { name: /Khôi phục nội dung mặc định/ }).click();
    await dialog(page).getByRole('button', { name: 'Khôi phục', exact: true }).click();
    await expect(toast(page)).toContainText('Đã khôi phục trang chủ mặc định');
    expect(api.find('POST', /\/content\/home\/reset$/)).toHaveLength(1);
  });

  test('BR-CMS-03: size chart save carries updatedAt; errors name the cell path', async ({
    page,
  }) => {
    const api = await setup(page, 'admin');
    await page.goto('/admin/size-charts');
    await expect(page.getByRole('button', { name: 'Thêm cột' }).first()).toBeVisible();
    await page.getByLabel('Ngực size S').fill('84–88');
    await saveBar(page, 'Lưu');
    await expect(toast(page)).toContainText('Đã lưu bảng size Áo');
    const saved = api.find('PUT', /\/size-charts\/tops$/).at(-1)!;
    expect(saved.body).toMatchObject({ updatedAt: null, bodyColumns: ['Ngực'] });
    await expect(page.getByText('Đã chỉnh sửa')).toBeVisible();

    api.chartFieldErrors = [{ field: 'body[0].values.Ngực', message: 'Ô số đo không được trống.' }];
    await page.getByLabel('Ngực size S').fill('90');
    await saveBar(page, 'Lưu');
    await expect(page.getByRole('alert').filter({ hasText: 'body[0].values.Ngực' })).toBeVisible();
    // Conflict: my edit stays, the other copy is offered.
    api.conflictOnce.add('size-chart');
    await saveBar(page, 'Lưu');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Người khác vừa lưu bảng size này' }),
    ).toBeVisible();
    await expect(page.getByLabel('Ngực size S')).toHaveValue('90');
  });

  test('AC-PROMO-12: collection create; a duplicate slug (409) shows under the field', async ({
    page,
  }) => {
    const api = await setup(page, 'admin');
    await page.goto('/admin/collections');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Tạo bộ sưu tập' }).first().click();
    await dialog(page).getByLabel('Tên').fill('Thu Đông 2026');
    await expect(dialog(page).getByLabel('Đường dẫn')).toHaveValue('thu-dong-2026');
    await dialog(page).getByRole('button', { name: 'Tạo bộ sưu tập' }).click();
    await expect(dialog(page).getByText('Đường dẫn này đã có bộ sưu tập khác dùng.')).toBeVisible();
    await dialog(page).getByLabel('Tên').fill('Hè 2027');
    await dialog(page).getByLabel('Đường dẫn').fill('he-2027');
    await dialog(page).getByRole('button', { name: 'Tạo bộ sưu tập' }).click();
    await expect(toast(page)).toContainText('Đã tạo bộ sưu tập Hè 2027');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    expect(api.find('POST', /\/collections$/).at(-1)?.body).toMatchObject({
      name: 'Hè 2027',
      slug: 'he-2027',
      status: 'draft',
    });
  });
});

test.describe('admin Slice 10: sale price, bulk sale, return labels', () => {
  async function catalog(page: Page, account: Account) {
    const content = await useContentApi(page, account === ADMIN ? 'admin' : 'staff');
    const api = await useCatalogApi(page);
    api.products[0] = {
      ...api.products[0],
      salePrice: 990000,
      saleStartsAt: '2026-11-09T17:00:00.000Z',
      saleEndsAt: '2026-11-20T16:59:59.000Z',
      saleState: 'running',
    };
    await signIn(page, account);
    return { content, api };
  }

  test('AC-PROMO-01, 05: the sale shows its state and VN dates; save sends the three fields', async ({
    page,
  }) => {
    const { api } = await catalog(page, ADMIN);
    await page.goto('/admin/products/p-live');
    await expect(page.getByRole('group', { name: /Giá giảm có hạn/ })).toContainText(
      'Đang giảm giá',
    );
    await expect(page.getByLabel('Từ ngày')).toHaveValue('2026-11-10');
    await expect(page.getByLabel('Đến hết ngày')).toHaveValue('2026-11-20');
    await expect(page.getByText('Giảm 23% so với giá bán.')).toBeVisible();

    // A sale price at or above the price is refused before any request.
    await page.locator('#p-sale-price').fill('1290000');
    await saveBar(page, 'Lưu');
    await expect(
      page.locator('p.error', { hasText: 'Giá giảm từ 1.000 ₫ và thấp hơn giá bán.' }),
    ).toBeVisible();
    expect(api.find('PUT', /\/products\/p-live$/)).toHaveLength(0);

    await page.locator('#p-sale-price').fill('890000');
    await page.getByLabel('Đến hết ngày').fill('2026-12-01');
    await saveBar(page, 'Lưu');
    await expect(page.getByRole('status')).toContainText('Đã lưu sản phẩm');
    expect(api.find('PUT', /\/products\/p-live$/).at(-1)?.body).toMatchObject({
      salePrice: 890000,
      saleStartsAt: '2026-11-10',
      saleEndsAt: '2026-12-01',
    });

    await page.getByRole('button', { name: 'Gỡ đợt giảm giá' }).click();
    await saveBar(page, 'Lưu');
    await expect(page.getByRole('status')).toContainText('Đã lưu sản phẩm');
    expect(api.find('PUT', /\/products\/p-live$/).at(-1)?.body).toMatchObject({
      salePrice: null,
      saleStartsAt: null,
      saleEndsAt: null,
    });
  });

  test('BR-PROMO-07: bulk sale previews first, then applies the same input', async ({ page }) => {
    const { content } = await catalog(page, ADMIN);
    await page.goto('/admin/products');
    await expect(page.locator('tbody').getByText('Đang giảm giá')).toBeVisible();
    await page.getByRole('button', { name: 'Giảm giá hàng loạt' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Áp dụng' })).toBeDisabled();
    await dialog(page).getByLabel('Đến hết ngày').fill('2026-12-31');
    await dialog(page).getByRole('button', { name: 'Xem trước' }).click();
    const preview = dialog(page).getByTestId('bulk-preview');
    await expect(preview).toContainText('1 sản phẩm sẽ được giảm giá');
    await expect(preview).toContainText('Đang có đợt giảm giá');
    await dialog(page).getByRole('button', { name: 'Áp dụng' }).click();
    await expect(page.getByRole('status')).toContainText('Đã áp dụng giảm giá cho 1 sản phẩm');
    const [previewCall] = content.find('POST', /\/sales\/bulk\/preview$/);
    const applyCall = content.find('POST', /\/sales\/bulk$/).at(-1)!;
    expect(applyCall.body).toEqual(previewCall.body);
    expect(applyCall.body).toMatchObject({ percent: 20, endsOn: '2026-12-31' });
  });

  test('BR-PROMO-05: staff gets neither the bulk button nor editable sale fields', async ({
    page,
  }) => {
    await catalog(page, STAFF);
    await page.goto('/admin/products');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Giảm giá hàng loạt' })).toHaveCount(0);
    await page.goto('/admin/products/p-live');
    await expect(page.locator('#p-sale-price')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Gỡ đợt giảm giá' })).toHaveCount(0);
  });

  test('BR-RET-65: the return list names who sent it; the order list flags a waiting request', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('n2f.e2e.returnsMode', 'http');
      localStorage.setItem('n2f.e2e.adminOrdersMode', 'contract-mock');
    });
    await page.route(/\/api\/admin\/returns/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              orderCode: 'N2F2611110001',
              requestedAt: '2026-11-10T03:00:00.000Z',
              source: 'guest',
              recipientName: 'Nguyễn An',
              reason: 'wrong-size',
              fault: 'shop',
              state: 'requested',
              itemCount: 1,
              amount: 400000,
              overdue: false,
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          counts: { all: 1, requested: 1, approved: 0, received: 0, refunded: 0, closed: 0 },
        }),
      }),
    );
    await signIn(page, ADMIN);
    await page.goto('/admin/returns');
    await expect(page.getByTestId('return-source')).toHaveText('Khách vãng lai');
    await page.goto('/admin/orders?view=completed');
    await expect(page.getByTestId('return-pending')).toHaveCount(1);
  });
});
