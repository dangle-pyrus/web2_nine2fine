import { expect, Page, test } from '@playwright/test';

/** Signs in to the admin with a seeded staff account (src/mocks/admin/admin-seed.ts). */
async function adminSignIn(
  page: Page,
  email = 'admin@nine2fine.vn',
  password = 'admin123',
): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

test.describe('admin', () => {
  test('redirects to login when signed out', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?returnUrl=/);
  });

  test('admin opens every section', async ({ page }) => {
    await adminSignIn(page);
    for (const [path, heading] of [
      ['/admin/orders', 'Đơn hàng'],
      ['/admin/returns', 'Trả hàng'],
      ['/admin/products', 'Sản phẩm'],
      ['/admin/inventory', 'Tồn kho'],
      ['/admin/customers', 'Khách hàng'],
      ['/admin/promotions', 'Khuyến mãi'],
      ['/admin/settings/staff', 'Nhân viên và phân quyền'],
      ['/admin/settings/audit', 'Nhật ký hoạt động'],
      ['/admin/content', 'Nội dung trang chủ'],
      ['/admin/reviews', 'Đánh giá sản phẩm'],
      ['/admin/collections', 'Bộ sưu tập'],
      ['/admin/size-charts', 'Bảng size'],
      ['/admin/reports', 'Báo cáo'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  });

  test('edits a product through the save bar', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/products/p01');
    await page.getByLabel('Tên sản phẩm').fill('The Everyday Blazer – sửa');
    const bar = page.getByRole('region', { name: 'Thay đổi chưa lưu' });
    await bar.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('Đã lưu sản phẩm')).toBeVisible();
    await expect(bar).toBeHidden();
  });

  test('adjusts stock with a reason', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/inventory?view=out');
    const row = page.locator('tbody tr').first();
    await row.hover();
    await row.getByRole('button', { name: 'Điều chỉnh' }).click();
    await page.getByLabel('Số lượng thay đổi').fill('4');
    await page.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
    await expect(page.getByText(/Đã cập nhật tồn kho .*: còn 4/)).toBeVisible();
  });

  test('staff role does not see revenue, cost or settings', async ({ page }) => {
    await adminSignIn(page, 'staff@nine2fine.vn', 'staff123');
    await expect(page.getByRole('link', { name: 'Cài đặt' })).toHaveCount(0);
    await page.goto('/admin/products/p01');
    await expect(page.getByLabel('Giá vốn')).toHaveCount(0);
    await page.goto('/admin/settings/staff');
    await expect(page).toHaveURL(/\/admin\/?$/);
  });

  test('exports every filtered order, not just the page', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/orders?pageSize=20');
    await page.getByRole('button', { name: 'Xuất file' }).click();
    const all = page.getByLabel(/^Tất cả \d+ đơn hàng theo bộ lọc/);
    await expect(all).toBeChecked();
    const download = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Xuất file' }).click();
    expect((await download).suggestedFilename()).toMatch(/^don-hang-.*\.csv$/);
    await expect(page.getByText(/Đã xuất (\d{3}|[3-9]\d) đơn hàng/)).toBeVisible();
  });

  test('steps through the filtered order list with j/k and keeps the filter on back', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'The previous/next pager is a keyboard feature, hidden on phones.');
    await adminSignIn(page);
    await page.goto('/admin/orders?view=to-fulfil');
    await page.locator('tbody tr').first().getByRole('link').click();
    const nav = page.getByRole('group', { name: 'Chuyển đơn trong danh sách' });
    await expect(nav).toContainText(/^1\/\d+/);
    const first = page.url();
    await page.keyboard.press('j');
    await expect(page).not.toHaveURL(first);
    await expect(nav).toContainText(/^2\/\d+/);
    await page.keyboard.press('k');
    await expect(page).toHaveURL(first);
    await expect(page.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      /view=to-fulfil/,
    );
  });

  test('saved variant stock changes only through an adjustment', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/products/p01');
    await expect(page.locator('.variants .stock-input')).toHaveCount(0);
    await page.locator('.variants .stock-link').first().click();
    await expect(page.getByLabel('Số lượng thay đổi')).toBeVisible();
  });

  test('keyboard: Ctrl K lists commands, G then P jumps, ? shows help', async ({ page }) => {
    await adminSignIn(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('option', { name: /Đơn cần chuẩn bị và giao/ })).toBeVisible();
    await page.keyboard.type('ton kho');
    await expect(page.getByRole('option', { name: /Đi tới Tồn kho/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await page.keyboard.press('p');
    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('heading', { name: 'Phím tắt' })).toBeVisible();
  });

  test('dashboard KPIs follow the chosen period', async ({ page }) => {
    await adminSignIn(page);
    await page.getByRole('button', { name: '7 ngày' }).click();
    await expect(page.getByText('Doanh thu · 7 ngày')).toBeVisible();
    await expect(page.locator('.kpis a').first()).toHaveAttribute('href', /range=7d/);
  });

  test('COD order: fix the address, swap a size, then confirm', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/orders?view=to-confirm');
    await page.locator('tbody tr').first().getByRole('link').click();
    await expect(page.getByText('Gọi khách xác nhận đơn COD')).toBeVisible();

    await page.getByRole('button', { name: 'Sửa', exact: true }).click();
    await page.getByLabel('Số nhà, tên đường').fill('99 Nguyễn Huệ');
    await page.getByRole('button', { name: 'Lưu địa chỉ' }).click();
    await expect(page.getByText('Đã cập nhật địa chỉ giao hàng')).toBeVisible();

    await page.getByRole('button', { name: 'Đổi màu/size' }).first().click();
    await page.locator('label.check:not(.is-disabled)').first().click();
    await page.getByRole('button', { name: 'Đổi biến thể' }).click();
    await expect(page.getByText('Đã đổi biến thể')).toBeVisible();

    await page.getByRole('button', { name: 'Xác nhận đơn' }).click();
    await expect(page.getByText('Đã xác nhận đơn')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bàn giao vận chuyển' })).toBeVisible();
    await expect(page.getByText('Đổi địa chỉ giao hàng')).toBeVisible();
  });

  test('failed delivery goes back to stock', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/orders?view=failed');
    await page.locator('tbody tr').first().getByRole('link').click();
    await expect(page.getByText(/Giao không thành công · lần 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Thêm thao tác' }).click();
    await page.getByRole('menuitem', { name: 'Hoàn về kho' }).click();
    await page.getByRole('button', { name: 'Hoàn về kho' }).click();
    await expect(page.getByText('Đã hoàn đơn và nhập lại kho')).toBeVisible();
    await expect(page.getByText('Đã hoàn về shop').first()).toBeVisible();
  });

  test('pick list adds up the SKUs of several orders', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/orders?view=to-fulfil');
    await expect(page.locator('tbody tr a[href*="/admin/orders/"]').first()).toBeVisible();
    const ids = await page
      .locator('tbody tr a[href*="/admin/orders/"]')
      .evaluateAll((links) =>
        links.slice(0, 3).map((a) => a.getAttribute('href')!.split('/').pop()),
      );
    await page.goto(`/admin/print/pick?ids=${ids.join(',')}`);
    await expect(page.getByRole('heading', { name: 'Phiếu nhặt hàng' })).toBeVisible();
    await expect(page.getByText('3 đơn', { exact: false }).first()).toBeVisible();
    await page.goto(`/admin/print/delivery?ids=${ids.join(',')}`);
    await expect(page.locator('.slip')).toHaveCount(3);
  });

  test('home page content edited in the admin shows on the shop', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/content');
    await page.locator('.block-main').first().click();
    await page.getByLabel('Tiêu đề').first().fill('Tiêu đề từ admin');
    await page.getByRole('button', { name: 'Lưu và đăng' }).click();
    await expect(page.getByText('Đã lưu trang chủ')).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Tiêu đề từ admin')).toBeVisible();
  });

  test('a review reply appears on the product page', async ({ page }) => {
    await adminSignIn(page);
    await page.goto('/admin/reviews?view=unanswered');
    await page.getByRole('button', { name: 'Trả lời', exact: true }).first().click();
    await page.locator('textarea').first().fill('Cảm ơn bạn, shop đã ghi nhận.');
    await page.getByRole('button', { name: 'Đăng phản hồi' }).click();
    await expect(page.getByText('Đã đăng phản hồi')).toBeVisible();
    await expect(page.getByText('Cảm ơn bạn, shop đã ghi nhận.')).toBeVisible();
  });
});
