import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';
// Seeded account without orders (src/mocks/demo-seed).
import { EMPTY_ACCOUNT } from '../src/mocks/demo-seed/seed-account-data';

const member = MOCK_ACCOUNTS[0];

/** Signs in from the login page and waits until the app is back on `returnUrl`. */
async function signIn(page: Page, returnUrl: string, email = member.email): Promise<void> {
  await page.goto(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã số (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\//);
}

async function addToCart(page: Page, slug: string, size = 'M'): Promise<void> {
  await page.goto(`/product/${slug}`);
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
}

async function confirmDialog(page: Page, button: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Hủy đơn hàng?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button }).click();
}

test('policies, help page and seller identity are published', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByText('Công ty TNHH Thời trang Nine2Fine')).toBeVisible();
  await expect(footer.getByText(/Mã số doanh nghiệp \d{10}/)).toBeVisible();
  for (const [link, heading] of [
    ['Trả hàng & hoàn tiền', 'Chính sách trả hàng và hoàn tiền'],
    ['Giao hàng', 'Chính sách giao hàng'],
    ['Thanh toán', 'Chính sách thanh toán'],
    ['Quyền lợi thành viên', 'Chính sách quyền lợi thành viên'],
    ['Bảo mật dữ liệu', 'Chính sách bảo vệ dữ liệu cá nhân'],
    ['Điều khoản sử dụng', 'Điều khoản sử dụng và mua hàng'],
    ['Giải quyết khiếu nại', 'Chính sách tiếp nhận và giải quyết khiếu nại'],
  ]) {
    await page.locator('footer').getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  // Policy numbers come from the same store policy the flows use.
  await page.goto('/policies/returns');
  await expect(page.getByText(/trong 30 ngày kể từ ngày nhận hàng/)).toBeVisible();
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Liên hệ & hỗ trợ' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Hotline/ })).toHaveAttribute('href', /^tel:/);
  await page.goto('/policies/nope');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy chính sách' })).toBeVisible();
});

test('guest checkout without email keeps note and VAT invoice, then cancels by phone', async ({
  page,
}) => {
  await addToCart(page, 'nine-to-fine-shirt');
  await page.goto('/checkout');
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill('Lê Hoa');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0933444555');
  await page
    .getByRole('combobox', { name: 'Tỉnh / Thành phố' })
    .selectOption({ label: 'Thành phố Hà Nội' });
  await page
    .getByRole('combobox', { name: 'Phường / Xã' })
    .selectOption({ label: 'Phường Ba Đình' });
  await page.getByRole('textbox', { name: 'Địa chỉ nhận hàng', exact: true }).fill('5 Kim Mã');
  await page.getByLabel('Ghi chú (không bắt buộc)').fill('Giao giờ hành chính');
  await page.getByRole('checkbox', { name: 'Xuất hóa đơn công ty (VAT)' }).check();
  await page.getByRole('textbox', { name: 'Tên công ty' }).fill('Công ty TNHH Hoa Lê');
  await page.getByRole('textbox', { name: 'Mã số thuế' }).fill('12345');
  await page.getByRole('textbox', { name: 'Địa chỉ công ty' }).fill('5 Kim Mã, Hà Nội');
  await page.getByRole('textbox', { name: 'Email nhận hóa đơn' }).fill('ketoan@hoale.vn');
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText(/Mã số thuế gồm 10 số/)).toBeVisible();
  await expect(page.getByText('Vui lòng đồng ý để đặt hàng.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mã số thuế' }).fill('0101234567');
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Hoa.' })).toBeVisible();

  await page.getByRole('link', { name: 'Theo dõi đơn hàng' }).click();
  await page.getByRole('textbox', { name: 'Số điện thoại hoặc email' }).fill('0933444555');
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByText('Giao giờ hành chính')).toBeVisible();
  await expect(page.getByText('Công ty TNHH Hoa Lê')).toBeVisible();
  await expect(page.getByText('MST 0101234567')).toBeVisible();

  await page.getByRole('button', { name: 'Hủy đơn' }).click();
  await confirmDialog(page, 'Hủy đơn');
  await expect(page.getByRole('status').filter({ hasText: /Đã hủy đơn #N2F/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đơn hàng đã hủy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy đơn' })).toHaveCount(0);
});

test('member session and new orders survive a reload; COD order can be cancelled', async ({
  page,
}) => {
  await addToCart(page, 'off-duty-top');
  await signIn(page, '/checkout');
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page).toHaveURL(/\/order-success\/N2F/);
  const orderId = page.url().split('/').pop()!;

  await page.reload();
  await expect(page.getByRole('heading', { name: /Cảm ơn bạn/ })).toBeVisible();
  await page.goto(`/account/orders/${orderId}`);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${orderId}$`));
  await expect(page.getByRole('heading', { name: `Đơn #${orderId}` })).toBeVisible();

  await page.getByRole('button', { name: 'Hủy đơn' }).click();
  await confirmDialog(page, 'Hủy đơn');
  await expect(page.getByText(`Đã hủy đơn #${orderId}.`)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Đơn hàng đã hủy' })).toBeVisible();
});

test('return request: seller-fault reason needs a photo, then the order awaits pickup', async ({
  page,
}) => {
  await signIn(page, '/account/orders/N2F260920003');
  await page.getByRole('link', { name: 'Yêu cầu trả hàng' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/N2F260920003\/return$/);
  await page.getByRole('checkbox', { name: /City Vest/i }).check();
  await page.getByRole('radio', { name: /Giao sai size/ }).check();
  await page.getByRole('textbox', { name: 'Mô tả' }).fill('Đặt size M nhưng nhận size L.');
  await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
  await expect(page.getByText('Vui lòng thêm ít nhất 1 ảnh sản phẩm.')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'tem-nhan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'tem-nhan.png' })).toBeVisible();
  await expect(page.getByText('Hoàn trong 1–3 ngày làm việc', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();

  await expect(page).toHaveURL(/\/account\/orders\/N2F260920003$/);
  await expect(page.getByRole('heading', { name: 'Đang xử lý trả hàng' })).toBeVisible();
  await expect(page.getByText('Giao sai size')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Yêu cầu trả hàng' })).toHaveCount(0);
});

test('only buyers can review; back-in-stock alert for sold-out sizes', async ({ page }) => {
  await page.goto('/product/off-duty-top');
  await expect(page.getByText(/Đã mua sản phẩm này\?/)).toBeVisible();

  await page.getByRole('button', { name: 'Hết size bạn cần? Báo tôi khi có hàng' }).click();
  await page.getByRole('textbox', { name: 'Email nhận thông báo' }).fill('hoa@example.com');
  await page.getByRole('button', { name: 'Báo tôi' }).click();
  await expect(page.getByText(/sẽ email cho hoa@example.com khi size XL/)).toBeVisible();

  await signIn(page, '/account/orders');
  await page.goto('/product/off-duty-top#reviews');
  await page.getByRole('button', { name: 'Viết đánh giá' }).click();
  const form = page.getByRole('form', { name: 'Viết đánh giá' });
  await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
  await expect(form.getByText('Chọn số sao.')).toBeVisible();
  await form.getByLabel('4 sao').check({ force: true });
  await form.getByRole('textbox', { name: /Tiêu đề/ }).fill('Mặc đi làm rất ổn');
  await form
    .getByRole('textbox', { name: /Nhận xét/ })
    .fill('Vải mát, phom vừa vặn, mặc từ sáng đến tối không nhăn.');
  await form.getByRole('button', { name: 'Đăng đánh giá' }).click();
  await expect(page.getByText('Cảm ơn bạn đã đánh giá.', { exact: false })).toBeVisible();
  const review = page.locator('#reviews li').filter({ hasText: 'Mặc đi làm rất ổn' });
  await expect(review.getByText('Đã mua hàng')).toBeVisible();

  // Persisted across the reload: the review is still there and cannot be written twice.
  await page.reload();
  await expect(page.getByText('Bạn đã đánh giá sản phẩm này.')).toBeVisible();
  await expect(page.locator('#reviews li').filter({ hasText: 'Mặc đi làm rất ổn' })).toBeVisible();
});

test('members who never bought a product cannot review it', async ({ page }) => {
  await signIn(page, '/product/off-duty-top', EMPTY_ACCOUNT.email);
  await expect(page.getByText('Chỉ khách đã mua và nhận sản phẩm này')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viết đánh giá' })).toHaveCount(0);
});

test('checkout names the lines that ran out of stock and fixes them', async ({ page }) => {
  await addToCart(page, 'nine-to-fine-shirt');
  // Simulate a stale cart: the browser still thinks 9 pieces are available.
  await page.evaluate(() => {
    const lines = JSON.parse(localStorage.getItem('n2f.cart.v1') ?? '[]');
    lines[0].quantity = 9;
    lines[0].stock = 9;
    localStorage.setItem('n2f.cart.v1', JSON.stringify(lines));
  });
  await page.goto('/checkout');
  if ((await page.locator('aside details').getAttribute('open')) === null) {
    await page.locator('aside summary').click();
  }
  await expect(page.getByText(/^Chỉ còn \d+ sản phẩm$/)).toBeVisible();
  await page.getByRole('button', { name: 'Cập nhật đơn theo số lượng còn lại' }).click();
  await expect(page.getByText(/^Chỉ còn \d+ sản phẩm$/)).toHaveCount(0);
  await expect(page.locator('.grand dd')).toBeVisible();
});
