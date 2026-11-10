import { expect, Page, test } from '@playwright/test';
import { CatalogApi, pngBytes, useCatalogApi } from './admin-catalog-fake';

/**
 * Slice 6 (admin products, inventory, promotions) on the HTTP adapters. The e2e build keeps the
 * earlier mock back office by default (admin.spec.ts); these specs switch to
 * `adminCatalogMode = http` and answer `/api/admin/**` with `admin-catalog-fake.ts`, which follows
 * docs/api/openapi.yaml (tag admin-products, admin-inventory, admin-promotions, admin-media).
 * Test names carry the AC-INV code of docs/product/PRD.md.
 */
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
const toast = (page: Page) => page.getByRole('status');

async function setup(page: Page, api = new CatalogApi()): Promise<CatalogApi> {
  // Uploaded images are served by the backend: a 1x1 pixel stands in so no request fails.
  await page.route(/\/api\/media\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );
  return useCatalogApi(page, api);
}

test.describe('admin catalog on the API (Slice 6)', () => {
  test('AC-INV-07: menu has the four modules, other routes say not available', async ({ page }) => {
    const api = await setup(page);
    await signIn(page);
    const menu = page.locator('nav.sidebar .menu-list a');
    await expect(menu).toHaveText([/Đơn hàng/, /Sản phẩm/, /Tồn kho/, /Khuyến mãi/]);
    await page.goto('/admin/customers');
    await expect(page.getByRole('heading', { name: 'Chưa khả dụng' })).toBeVisible();
    await expect(page.getByText('Đơn hàng, Sản phẩm, Tồn kho và Khuyến mãi')).toBeVisible();
    await page.goto('/admin/products');
    await expect(rows(page)).toHaveCount(2);
    expect(api.find('GET', /\/admin\/products$/)).toHaveLength(1);
  });

  test('AC-INV-10: product list sends q and limit, never sort; tabs carry the counts', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products');
    const tabs = page.getByRole('navigation', { name: 'Chế độ xem sản phẩm' });
    await expect(tabs.getByRole('button', { name: /Tất cả/ })).toContainText('2');
    await expect(tabs.getByRole('button', { name: /Nháp/ })).toContainText('1');
    await expect(page.getByLabel('Sắp xếp')).toHaveCount(0);
    const first = api.find('GET', /\/admin\/products$/)[0].url.searchParams;
    expect(first.get('limit')).toBe('50');
    expect(first.get('page')).toBe('1');
    expect(first.has('sort') || first.has('dir') || first.has('pageSize')).toBe(false);
    await page.getByLabel('Tìm sản phẩm').fill('váy');
    await page.getByLabel('Tìm sản phẩm').press('Enter');
    await expect(rows(page)).toHaveCount(1);
    const last = api.find('GET', /\/admin\/products$/).at(-1)!.url.searchParams;
    expect(last.get('q')).toBe('váy');
    expect(last.has('search')).toBe(false);
    await tabs.getByRole('button', { name: /Nháp/ }).click();
    await expect(page).toHaveURL(/view=draft/);
  });

  test('AC-INV-47: a failed list shows the error with a retry, an empty shop invites the first product', async ({
    page,
  }) => {
    const api = await setup(page);
    api.failures.set('GET /products', { status: 500, code: 'unavailable', message: 'Lỗi máy chủ' });
    await signIn(page);
    await page.goto('/admin/products');
    await expect(page.getByText('Không tải được danh sách sản phẩm')).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(rows(page)).toHaveCount(2);
    api.products = [];
    await page.goto('/admin/products');
    await expect(page.getByText('Thêm sản phẩm đầu tiên')).toBeVisible();
  });

  test('AC-INV-08: the Won’t fields are not on the product form', async ({ page }) => {
    await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-live');
    await expect(page.getByLabel('Tên sản phẩm')).toHaveValue('Áo blazer linen');
    await expect(page.getByText('Giá vốn')).toHaveCount(0);
    await expect(page.getByText('Hiển thị trên Google')).toHaveCount(0);
    await expect(page.getByLabel('Tag')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Bộ sưu tập' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Giá' })).toHaveCount(0);
    await expect(page.getByLabel('Giá Đen S')).toHaveCount(0);
    const sizes = page.getByRole('group', { name: 'Size' }).getByRole('button');
    await expect(sizes).toHaveText(['S', 'M', 'L', 'XL']);
    // Published: the slug is locked (BR-INV-13) and a SKU with orders cannot change.
    await expect(page.getByLabel('Đường dẫn sản phẩm')).toBeDisabled();
    await expect(page.getByLabel('SKU Đen S')).toBeDisabled();
    await expect(page.getByLabel('SKU Đen M')).toBeEnabled();
  });

  test('AC-INV-08, 46: the voucher form has two audiences, one category and the two switches', async ({
    page,
  }) => {
    await setup(page);
    const customerRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/customers')) customerRequests.push(request.url());
    });
    await signIn(page);
    await page.goto('/admin/promotions/new');
    await expect(page.getByRole('heading', { name: 'Tạo mã giảm giá', level: 1 })).toBeVisible();
    await expect(page.getByText('Theo hạng thành viên')).toHaveCount(0);
    await expect(page.getByText('Khách được chọn')).toHaveCount(0);
    await expect(page.getByText('Phát riêng')).toHaveCount(0);
    await expect(page.getByText('Chỉ thành viên')).toBeVisible();
    await expect(page.getByLabel('Chỉ đơn hàng đầu tiên của khách')).toBeVisible();
    await expect(page.getByLabel('Không áp dụng cho hàng đang giảm giá')).toBeVisible();
    await expect(page.getByLabel('Áp dụng cho', { exact: true })).toBeVisible();
    expect(customerRequests).toEqual([]);
  });

  test('AC-INV-14, 16: duplicate slug lands on the slug, publish gaps are listed, then it saves', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/new');
    await page.getByLabel('Tên sản phẩm').fill('Váy lụa mới');
    await page.getByLabel('Giá bán').fill('450000');
    await page.getByLabel('Dòng mô tả ngắn').fill('Váy lụa dáng dài');
    await page.getByRole('checkbox', { name: 'Work' }).check();
    await page.getByLabel('Đường dẫn sản phẩm').fill('vay-nhap');
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    await expect(page.locator('p.error', { hasText: 'Đường dẫn đã được dùng.' })).toBeVisible();
    expect(api.products).toHaveLength(2);

    await page.getByLabel('Đường dẫn sản phẩm').fill('');
    await page.locator('select[aria-labelledby="status-title"]').selectOption('active');
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    // New product without an image: "Đang bán" needs one (BR-INV-14).
    await expect(
      page.getByRole('alert').filter({ hasText: 'Còn thiếu: ảnh sản phẩm' }),
    ).toBeVisible();

    await page.locator('select[aria-labelledby="status-title"]').selectOption('draft');
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/p-new-/);
    const created = api.find('POST', /\/admin\/products$/).at(-1)!.body as Record<string, unknown>;
    // Only contract fields: no tags, cost, SEO, colours / sizes, variant price; no slug when empty.
    for (const key of ['tags', 'cost', 'seoTitle', 'seoDescription', 'colors', 'sizes', 'slug'])
      expect(created).not.toHaveProperty(key);
    expect(created['status']).toBe('draft');
    const variants = created['variants'] as Record<string, unknown>[];
    expect(variants).toHaveLength(3);
    expect(Object.keys(variants[0]).sort()).toEqual(['color', 'inventory', 'size', 'sku']);
  });

  test('AC-INV-11, 12: type, gender and moment are required, on the client and from the server', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/new');
    await page.getByLabel('Tên sản phẩm').fill('Áo thử');
    await page.getByLabel('Giá bán').fill('450000');
    await page.getByRole('checkbox', { name: 'Nữ' }).uncheck();
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    await expect(
      page.locator('p.error', { hasText: 'Loại sản phẩm từ 1 đến 120 ký tự.' }),
    ).toBeVisible();
    await expect(page.locator('p.error', { hasText: 'Chọn ít nhất một giới tính.' })).toBeVisible();
    await expect(page.locator('p.error', { hasText: 'Chọn ít nhất một dịp mặc.' })).toBeVisible();
    expect(api.find('POST', /\/admin\/products$/)).toHaveLength(0);

    await page.getByLabel('Dòng mô tả ngắn').fill('Áo thử nghiệm');
    await page.getByRole('checkbox', { name: 'Nữ' }).check();
    await page.getByRole('checkbox', { name: 'Work' }).check();
    await expect(page.locator('p.error', { hasText: 'Chọn ít nhất' })).toHaveCount(0);

    // A server answer with `field: type` or `moments` lands on that field, not only in the toast.
    await page.route(/\/api\/admin\/products$/, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'validation',
                message: 'Chọn ít nhất một dịp mặc.',
                field: 'moments',
              },
            }),
          })
        : route.fallback(),
    );
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
    await expect(page.locator('p.error', { hasText: 'Chọn ít nhất một dịp mặc.' })).toBeVisible();
  });

  test('AC-INV-13: generated SKUs follow the name and two products with the same initials do not clash', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    for (const price of ['450000', '500000']) {
      await page.goto('/admin/products/new');
      await page.getByLabel('Tên sản phẩm').fill('Váy lụa');
      await page.getByLabel('Giá bán').fill(price);
      await page.getByLabel('Dòng mô tả ngắn').fill('Váy lụa dáng dài');
      await page.getByRole('checkbox', { name: 'Work' }).check();
      await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
      await expect(page).toHaveURL(/\/admin\/products\/p-new-/);
    }
    const sent = api.find('POST', /\/admin\/products$/);
    expect(sent).toHaveLength(2);
    const skus = sent.map((item) =>
      ((item.body as { variants: { sku: string }[] }).variants ?? []).map((row) => row.sku),
    );
    for (const list of skus) {
      expect(list.length).toBeGreaterThan(0);
      for (const sku of list) expect(sku).toMatch(/^N2F-VL-[A-Z0-9]{4}-\d-[A-Z]+$/);
    }
    expect(skus[0].some((sku) => skus[1].includes(sku))).toBe(false);
  });

  test('AC-INV-06: a version conflict says so, keeps the form and reloads on request', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-draft');
    await page.getByLabel('Tên sản phẩm').fill('Váy của tôi');
    // Someone else saved in the meantime.
    api.products[1]['updatedAt'] = '2026-11-10T04:00:00.000Z';
    api.products[1]['name'] = 'Váy của người khác';
    await page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' })
      .click();
    const banner = page
      .getByRole('alert')
      .filter({ hasText: 'Dữ liệu vừa được người khác cập nhật' });
    await expect(banner).toBeVisible();
    await expect(page.getByLabel('Tên sản phẩm')).toHaveValue('Váy của tôi');
    const sent = api.find('PUT', /\/admin\/products\/p-draft$/)[0].body as Record<string, unknown>;
    expect(sent['updatedAt']).toBe('2026-11-10T03:00:00.000Z');
    await banner.getByRole('button', { name: 'Tải lại dữ liệu' }).click();
    await expect(page.getByLabel('Tên sản phẩm')).toHaveValue('Váy của người khác');
    await expect(banner).toHaveCount(0);
  });

  test('AC-INV-23: dropping a size that has orders names the SKU and what to do', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-live');
    await page
      .getByRole('group', { name: 'Size' })
      .getByRole('button', { name: 'S', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' })
      .click();
    await expect(toast(page)).toContainText('SKU BLZ-D-S đã có đơn hàng nên không bỏ được');
    await expect(toast(page)).toContainText('Đặt tồn về 0 để ngừng bán size này');
    expect(api.products[0]['variants']).toHaveLength(2);
    // The form keeps the edit and Save works again.
    await expect(
      page.getByRole('region', { name: 'Thay đổi chưa lưu' }).getByRole('button', { name: 'Lưu' }),
    ).toBeEnabled();
  });

  test('AC-INV-20: deleting a product that was on sale says to hide it; a draft is deleted', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-live');
    await page.getByRole('button', { name: 'Xóa sản phẩm' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa sản phẩm' }).click();
    await expect(toast(page)).toContainText('hãy Ẩn thay vì xoá');
    await expect(page).toHaveURL(/\/admin\/products\/p-live/);
    await page.goto('/admin/products/p-draft');
    await page.getByRole('button', { name: 'Xóa sản phẩm' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa sản phẩm' }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    expect(api.products).toHaveLength(1);
  });

  test('AC-INV-17: bulk "Đang bán" with a product that has no image is refused as a whole', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the select-all box lives in the desktop table header');
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products');
    await page.getByLabel('Chọn tất cả sản phẩm trên trang').check();
    await page
      .getByRole('region', { name: 'Thao tác hàng loạt' })
      .getByRole('button', { name: 'Đang bán' })
      .click();
    await expect(toast(page)).toContainText('còn thiếu: ảnh sản phẩm');
    const sent = api.find('POST', /bulk-status$/)[0].body as { ids: string[]; status: string };
    expect(sent.status).toBe('active');
    expect(sent.ids.sort()).toEqual(['p-draft', 'p-live']);
    expect(api.products[1]['status']).toBe('draft');
  });

  test('AC-INV-25: the image goes up as raw bytes; a small image says why it is refused', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-draft');
    const file = page.locator('input[type=file]');
    await file.setInputFiles({
      name: 'small.png',
      mimeType: 'image/png',
      buffer: pngBytes(400, 500),
    });
    await expect(toast(page)).toContainText('cạnh ngắn từ 600 px');
    await file.setInputFiles({
      name: 'ok.png',
      mimeType: 'image/png',
      buffer: pngBytes(800, 1000),
    });
    await expect(page.locator('ul.media img')).toHaveCount(1);
    const uploads = api.find('POST', /uploads\/product-images$/);
    expect(uploads).toHaveLength(2);
    const sent = uploads[1];
    expect(sent.headers['content-type']).toBe('image/png');
    expect(sent.raw?.equals(pngBytes(800, 1000))).toBe(true);
    // Saving sends the id, alt and colour of each image, in order.
    await page.locator('select[aria-labelledby="status-title"]').selectOption('active');
    await page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' })
      .dispatchEvent('click');
    await expect(toast(page)).toContainText('Đã lưu sản phẩm');
    const put = api.find('PUT', /\/admin\/products\/p-draft$/)[0].body as {
      images: Record<string, unknown>[];
      status: string;
    };
    expect(put.status).toBe('active');
    expect(put.images).toEqual([
      { id: `up-${'0123456789abcdef'.repeat(2)}.png`, alt: '', color: '' },
    ]);
  });

  test('AC-INV-48: when the connection drops the form keeps its data and Save works again', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/products/p-draft');
    await page.getByLabel('Tên sản phẩm').fill('Váy giữ lại');
    api.aborts.add('PUT /products/p-draft');
    const save = page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' });
    await save.dispatchEvent('click');
    await expect(toast(page)).toContainText('Không kết nối được máy chủ');
    await expect(page.getByLabel('Tên sản phẩm')).toHaveValue('Váy giữ lại');
    await expect(save).toBeEnabled();
    await save.dispatchEvent('click');
    await expect(toast(page)).toContainText('Đã lưu sản phẩm');
    expect(api.products[1]['name']).toBe('Váy giữ lại');
  });

  test('AC-INV-34: a stock count that is out of date shows the new numbers and keeps the input', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    const tabs = page.getByRole('navigation', { name: 'Lọc theo trạng thái tồn kho' });
    await expect(tabs.getByRole('button', { name: /Tất cả/ })).toContainText('2');
    await expect(tabs.getByRole('button', { name: /Hết hàng/ })).toContainText('1');
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    const drawer = page.locator('.drawer');
    await drawer.getByRole('button', { name: 'Đặt số đếm được' }).click();
    await drawer.getByLabel('Số lượng thực tế').fill('13');
    // An order took one while the drawer was open: 9 on sale, 4 held.
    api.inventory[0]['available'] = 9;
    api.inventory[0]['reserved'] = 4;
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(drawer.getByRole('alert')).toContainText('còn 9 có thể bán, 4 đang giữ');
    await expect(drawer.getByLabel('Số lượng thực tế')).toHaveValue('13');
    const first = api.find('POST', /adjustments$/)[0];
    expect((first.body as Record<string, unknown>)['expectedAvailable']).toBe(10);
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(toast(page)).toContainText('Đã cập nhật tồn kho BLZ-D-S');
    const second = api.find('POST', /adjustments$/)[1];
    expect((second.body as Record<string, unknown>)['expectedAvailable']).toBe(9);
  });

  test('AC-INV-35: retrying after a dropped connection reuses the Idempotency-Key', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    const drawer = page.locator('.drawer');
    await drawer.getByLabel('Số lượng thay đổi').fill('5');
    api.aborts.add('POST /inventory/v-live-s/adjustments');
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(drawer.getByRole('alert')).toContainText('Không kết nối được máy chủ');
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(toast(page)).toContainText('Đã cập nhật tồn kho BLZ-D-S');
    const sent = api.find('POST', /adjustments$/);
    expect(sent).toHaveLength(2);
    const key = sent[0].headers['idempotency-key'];
    expect(key).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(sent[1].headers['idempotency-key']).toBe(key);
    expect(sent[1].body).toEqual({ mode: 'delta', quantity: 5, reason: 'received', note: '' });
  });

  test('AC-INV-32: "Sửa sai" needs a note and the history shows order movements as a dash', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    const drawer = page.locator('.drawer');
    await expect(drawer.getByText('Bán theo đơn')).toBeVisible();
    await expect(drawer.locator('.history li').nth(1)).toContainText('—');
    await drawer.getByLabel('Số lượng thay đổi').fill('-1');
    await drawer.getByLabel('Lý do').selectOption('correction');
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(drawer.getByText('Ghi chú là bắt buộc')).toBeVisible();
    expect(api.find('POST', /adjustments$/)).toHaveLength(0);
  });

  test('AC-INV-32: the reason list follows the way and sign, and a server reason error lands on the field', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    const drawer = page.locator('.drawer');
    const reason = drawer.getByLabel('Lý do');
    await expect(reason).toHaveValue('received');
    await drawer.getByLabel('Số lượng thay đổi').fill('-2');
    await expect(reason).toHaveValue('damaged');
    await expect(reason.locator('option[value="received"]')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Đặt số đếm được' }).click();
    await expect(reason).toHaveValue('count');
    await expect(reason.locator('option')).toHaveCount(2);
    await drawer.getByLabel('Số lượng thực tế').fill('9');
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(toast(page)).toContainText('Đã cập nhật tồn kho');
    const sent = api.find('POST', /adjustments$/);
    expect(sent[0].body).toMatchObject({ mode: 'set', quantity: 9, reason: 'count' });
  });

  test('AC-INV-32: a reason refused by the server shows under the reason field and the key is renewed', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    const drawer = page.locator('.drawer');
    await drawer.getByLabel('Số lượng thay đổi').fill('3');
    let refuse = true;
    await page.route(/\/inventory\/[^/]+\/adjustments$/, (route) => {
      if (!refuse) return route.fallback();
      refuse = false;
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'validation',
            message: 'Lý do không khớp với cách và dấu của số lượng.',
            field: 'reason',
          },
        }),
      });
    });
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(
      drawer.locator('p.error', { hasText: 'Lý do không khớp với cách và dấu của số lượng.' }),
    ).toBeVisible();
    await drawer.getByLabel('Lý do').selectOption('return');
    await drawer.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(toast(page)).toContainText('Đã cập nhật tồn kho');
    expect(api.find('POST', /adjustments$/)).toHaveLength(1);
  });

  test('AC-INV-37: the admin changes the default threshold and can drop the custom ones', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/inventory');
    await page.getByRole('button', { name: 'Ngưỡng sắp hết', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ngưỡng mặc định cho mọi SKU').fill('8');
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page)).toContainText('Ngưỡng sắp hết mặc định giờ là 8');
    expect(api.find('PUT', /thresholds$/)[0].body).toEqual({ defaultThreshold: 8 });
    // One SKU: its own threshold goes as `items`.
    await rows(page)
      .first()
      .getByRole('button', { name: /Đổi ngưỡng sắp hết của BLZ-D-S/ })
      .click();
    await page.getByRole('dialog').getByRole('radio').last().check();
    await page.getByRole('dialog').getByRole('spinbutton').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page)).toContainText('Đã đặt ngưỡng 2 cho 1 SKU');
    expect(api.find('PUT', /thresholds$/)[1].body).toEqual({
      items: [{ variantId: 'v-live-s', threshold: 2 }],
    });
  });

  test('AC-INV-03: staff only view products, vouchers and thresholds, and may adjust stock', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page, ...STAFF);
    await page.goto('/admin/products');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Thêm sản phẩm' })).toHaveCount(0);
    await expect(page.getByLabel('Chọn tất cả sản phẩm trên trang')).toHaveCount(0);
    await page.goto('/admin/products/new');
    await expect(page).not.toHaveURL(/products\/new/);
    await page.goto('/admin/products/p-live');
    await expect(page.getByText('Bạn chỉ có quyền xem sản phẩm')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xóa sản phẩm' })).toHaveCount(0);
    await expect(page.getByLabel('Tên sản phẩm')).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Thay đổi chưa lưu' })).toHaveCount(0);

    await page.goto('/admin/promotions');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Tạo mã giảm giá' })).toHaveCount(0);
    await expect(page.locator('input.toggle')).toHaveCount(0);
    await page.goto('/admin/promotions/new');
    await expect(page).not.toHaveURL(/promotions\/new/);

    await page.goto('/admin/inventory');
    await expect(page.getByRole('button', { name: 'Ngưỡng sắp hết', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Chọn tất cả SKU trên trang')).toHaveCount(0);
    await rows(page).first().getByRole('button', { name: 'Điều chỉnh' }).click();
    await expect(page.locator('.drawer').getByLabel('Số lượng thay đổi')).toBeVisible();
    expect(
      api.requests.filter((item) => item.method !== 'GET' && !/adjust/.test(item.url.pathname)),
    ).toEqual([]);
  });

  test('AC-INV-45: the voucher list takes its state and counts from the API', async ({ page }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/promotions');
    const tabs = page.getByRole('navigation', { name: 'Lọc mã giảm giá' });
    await expect(tabs.getByRole('button', { name: /Tất cả/ })).toContainText('3');
    await expect(tabs.getByRole('button', { name: /Đã tắt/ })).toContainText('1');
    await expect(rows(page).filter({ hasText: 'TAMTAT' })).toContainText('Đã tắt');
    await expect(rows(page).filter({ hasText: 'CHAOTHU10' })).toContainText('Đang chạy');
    await rows(page).filter({ hasText: 'CHAOTHU10' }).locator('input.toggle').uncheck();
    await expect(toast(page)).toContainText('Đã tắt mã CHAOTHU10');
    expect(api.find('PATCH', /promotions\/pr-1$/)[0].body).toEqual({ enabled: false });
    await tabs.getByRole('button', { name: /Đã tắt/ }).click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('AC-INV-41, 46: a new voucher goes out as the contract says; a duplicate code lands on the code', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/promotions/new');
    await page.getByLabel('Mã giảm giá').fill('chaothu10');
    await page.getByRole('button', { name: 'Lưu mã giảm giá' }).click();
    await expect(page.locator('p.error', { hasText: 'Mã đã tồn tại.' })).toBeVisible();
    await page.getByLabel('Mã giảm giá').fill('SALE10');
    await page.getByRole('radio', { name: /Chỉ thành viên/ }).check({ force: true });
    await page.getByLabel('Áp dụng cho', { exact: true }).selectOption('tops');
    await page.getByLabel('Chỉ đơn hàng đầu tiên của khách').check();
    await page.getByRole('button', { name: 'Lưu mã giảm giá' }).click();
    await expect(page).toHaveURL(/\/admin\/promotions\/pr-new-/);
    const sent = api.find('POST', /\/admin\/promotions$/).at(-1)!.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      code: 'SALE10',
      type: 'percent',
      value: 10,
      audience: 'members',
      categories: ['tops'],
      firstOrderOnly: true,
      excludeSaleItems: false,
      enabled: true,
    });
    for (const key of ['tiers', 'customerIds', 'updatedAt']) expect(sent).not.toHaveProperty(key);
    expect(typeof sent['startsAt']).toBe('string');
  });

  test('AC-INV-42, 44: a code that was used keeps its code, type and value and cannot be deleted', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/promotions/pr-used');
    await expect(page.getByLabel('Mã giảm giá')).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Giảm theo %/ })).toBeDisabled();
    await expect(page.getByLabel('Phần trăm giảm')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Xóa mã giảm giá' })).toHaveCount(0);
    // Other fields still change, and the save carries the version it read.
    await page.getByLabel('Giá trị đơn tối thiểu').fill('300000');
    await page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' })
      .click();
    await expect(toast(page)).toContainText('Đã lưu mã giảm giá');
    const put = api.find('PUT', /promotions\/pr-used$/)[0].body as Record<string, unknown>;
    expect(put['updatedAt']).toBe('2026-11-10T03:00:00.000Z');
    expect(put['minSubtotal']).toBe(300000);
    // An unused code is deleted.
    await page.goto('/admin/promotions/pr-1');
    await page.getByRole('button', { name: 'Xóa mã giảm giá' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa mã' }).click();
    await expect(page).toHaveURL(/\/admin\/promotions$/);
    expect(api.promotions.some((item) => item['id'] === 'pr-1')).toBe(false);
  });

  test('AC-INV-42: a voucher the server says is in use shows the rule, and a version conflict reloads', async ({
    page,
  }) => {
    const api = await setup(page);
    await signIn(page);
    await page.goto('/admin/promotions/pr-1');
    await expect(page.getByLabel('Tên chương trình')).toHaveValue('Chào thu');
    api.promotions[0]['updatedAt'] = '2026-11-10T05:00:00.000Z';
    await page.getByLabel('Tên chương trình').fill('Đổi tên');
    await page
      .getByRole('region', { name: 'Thay đổi chưa lưu' })
      .getByRole('button', { name: 'Lưu' })
      .click();
    const banner = page
      .getByRole('alert')
      .filter({ hasText: 'Dữ liệu vừa được người khác cập nhật' });
    await expect(banner).toBeVisible();
    await expect(page.getByLabel('Tên chương trình')).toHaveValue('Đổi tên');
    await banner.getByRole('button', { name: 'Tải lại dữ liệu' }).click();
    await expect(page.getByLabel('Tên chương trình')).toHaveValue('Chào thu');
    api.failures.set('DELETE /promotions/pr-1', {
      status: 409,
      code: 'voucher-in-use',
      message: 'Mã đã được dùng; hãy tắt thay vì xoá.',
    });
    await page.getByRole('button', { name: 'Xóa mã giảm giá' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa mã' }).click();
    await expect(toast(page)).toContainText('hãy tắt thay vì xoá');
  });
});
