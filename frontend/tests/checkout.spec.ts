import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

const member = MOCK_ACCOUNTS[0];

async function addBlazer(page: Page, size = 'M'): Promise<void> {
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  // Adding shows a toast; the cart drawer no longer opens by itself.
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Giỏ hàng' })).toHaveCount(0);
}

test('cart survives reload (versioned local storage)', async ({ page }) => {
  await page.goto('/product/the-everyday-blazer');
  await addBlazer(page);
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '1',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '1',
  );
  await page.evaluate(() => localStorage.setItem('n2f.cart.v1', '[{"broken":true}]'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '0',
  );
});

test('member checkout: saved address, voucher rules, QR payment, account order', async ({
  page,
  isMobile,
}) => {
  await page.goto('/product/the-everyday-blazer');
  await addBlazer(page);
  await page.goto('/auth/login?returnUrl=%2Fcheckout');
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã số (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await expect(page.getByRole('radio', { name: /Nguyễn Minh.*Mặc định/ })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(member.email);
  await expect(page.getByRole('combobox', { name: 'Tỉnh / Thành phố' })).toBeHidden();

  // Mobile keeps the summary collapsed by default (plan 16.3).
  if (isMobile) await page.locator('aside summary').click();
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('nope');
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByText('Mã giảm giá không tồn tại hoặc đã hết hạn.')).toBeVisible();
  await page.getByRole('button', { name: /N2FBDAY100/ }).click();
  await expect(page.getByText('N2FBDAY100 · Giảm 100K tháng sinh nhật')).toBeVisible();
  // Subtotal 1.290.000 qualifies for free shipping (mock rule): 1.290.000 − 100.000 = 1.190.000.
  await expect(page.locator('.totals .minus').first()).toHaveText(/−100\.000/);
  await expect(page.locator('.grand dd')).toHaveText(/1\.190\.000/);

  await page.getByRole('radio', { name: /Chuyển khoản qua mã QR/ }).check();
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  // Bank transfer continues on the per-order QR / virtual-account page.
  await expect(page).toHaveURL(/\/payment\/N2F/);
  await expect(page.getByRole('heading', { name: 'Quét mã QR để thanh toán' })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/(29|30):\d\d/);
  await expect(page.getByRole('button', { name: 'Mở giỏ hàng' }).locator('.bag-count')).toHaveText(
    '0',
  );

  await page.getByRole('link', { name: 'Xem chi tiết đơn hàng' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/N2F/);
  await expect(page.getByText('Đang chờ thanh toán').first()).toBeVisible();

  // "Thanh toán ngay" returns to the QR page; the demo control settles the transfer.
  await page.getByRole('link', { name: 'Thanh toán ngay' }).click();
  await page.getByRole('button', { name: 'Giả lập đã nhận tiền' }).click();
  await expect(page.getByRole('heading', { name: /Đã nhận 1\.190\.000/ })).toBeVisible();
  await page.getByRole('link', { name: 'Theo dõi đơn hàng' }).click();
  await expect(page.getByText('Đang chờ thanh toán')).toHaveCount(0);
});

test('guest tracking verifies contact and shows a new COD order', async ({ page }) => {
  await page.goto('/track-order');
  await page.getByRole('textbox', { name: 'Mã đơn hàng' }).fill('N2F260928010');
  await page.getByRole('textbox', { name: 'Số điện thoại hoặc email' }).fill('0900000000');
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy đơn hàng');
  await page.getByRole('textbox', { name: 'Số điện thoại hoặc email' }).fill('+84909000111');
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByRole('heading', { name: 'Đơn #N2F260928010' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Tiến trình đơn hàng' }).locator('[aria-current="step"]'),
  ).toContainText('Vận chuyển');
  await expect(page).toHaveURL(/\/track-order$/);

  await page.goto('/product/the-everyday-blazer');
  await addBlazer(page, 'S');
  await page.goto('/checkout');
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Trần Bình');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0911222333');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('binh@example.com');
  await page
    .getByRole('combobox', { name: 'Tỉnh / Thành phố' })
    .selectOption({ label: 'Thành phố Hà Nội' });
  await page
    .getByRole('combobox', { name: 'Phường / Xã' })
    .selectOption({ label: 'Phường Ba Đình' });
  await page.getByRole('textbox', { name: 'Địa chỉ nhận hàng', exact: true }).fill('1 Hoàng Diệu');
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Bình.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thanh toán khi nhận hàng' })).toBeVisible();

  await page.getByRole('link', { name: 'Theo dõi đơn hàng' }).click();
  await expect(page.getByRole('textbox', { name: 'Mã đơn hàng' })).toHaveValue(/^N2F/);
  await page.getByRole('textbox', { name: 'Số điện thoại hoặc email' }).fill('BINH@example.com');
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByText('Đang chuẩn bị hàng').first()).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Tiến trình đơn hàng' }).getByText('Xác nhận'),
  ).toBeVisible();
});
