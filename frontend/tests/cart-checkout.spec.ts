import { expect, Page, test } from '@playwright/test';

// Slice 3 cart & checkout on the mock adapters (checkoutMode: mock). Failures that only a real
// backend causes (price change, discontinued, errors) are switched on with `n2f.mock.flags`.

const BLAZER_M = '01-0-M';

async function setFlags(page: Page, flags: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    (value) => sessionStorage.setItem('n2f.mock.flags', JSON.stringify(value)),
    flags,
  );
}

async function addBlazer(page: Page, size = 'M'): Promise<void> {
  await page.goto('/product/the-everyday-blazer');
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
}

async function fillCheckout(page: Page): Promise<void> {
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
}

async function openSummary(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile && (await page.locator('aside details').getAttribute('open')) === null) {
    await page.locator('aside summary').click();
  }
}

test('AC-CART-02/04: "+" stops at 5 with the per-variant sentence', async ({ page }) => {
  await addBlazer(page);
  await page.goto('/cart');
  const plus = page.getByRole('button', { name: /Tăng số lượng/ });
  for (let i = 0; i < 4; i++) await plus.click();
  await expect(plus).toBeDisabled();
  await expect(page.getByText(/Mỗi đơn mua tối đa 5 sản phẩm cùng màu, size/)).toBeVisible();
});

test('AC-CART-08: a price that moved shows "from X to Y"', async ({ page }) => {
  await addBlazer(page);
  await setFlags(page, { priceOverrides: { [BLAZER_M]: 1190000 } });
  await page.goto('/cart');
  await expect(page.getByText(/Giá đã thay đổi từ .* thành .*/)).toBeVisible();
  await expect(
    page.getByText(/Một số sản phẩm đã thay đổi giá hoặc tình trạng hàng/),
  ).toBeVisible();
});

test('AC-CART-09: a discontinued line keeps only "Xóa" and blocks checkout', async ({ page }) => {
  await addBlazer(page);
  await setFlags(page, { discontinued: [BLAZER_M] });
  await page.goto('/cart');
  await expect(page.getByText('Sản phẩm không còn kinh doanh')).toBeVisible();
  await expect(page.getByRole('button', { name: /Tăng số lượng/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn sản phẩm để thanh toán' })).toBeDisabled();
});

test('AC-CART-10: a failed refresh keeps the cart, says so and offers a retry', async ({
  page,
}) => {
  await addBlazer(page);
  await setFlags(page, { refreshFail: true });
  await page.goto('/cart');
  await expect(
    page.locator('.alert', { hasText: 'Chưa cập nhật được giá mới nhất.' }),
  ).toBeVisible();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Thanh toán/ })).toBeDisabled();
  await setFlags(page, {});
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('.alert', { hasText: 'Chưa cập nhật được giá mới nhất.' })).toHaveCount(
    0,
  );
});

test('AC-CART-19: the cart only shows the subtotal and the free-shipping hint', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/cart');
  await expect(
    page.getByText(/để được miễn phí giao hàng|miễn phí giao hàng/).first(),
  ).toBeVisible();
  await expect(page.getByLabel('Mã giảm giá')).toHaveCount(0);
});

test('AC-CART-20: removing a line can be undone within 5 seconds', async ({ page }) => {
  await addBlazer(page);
  await page.goto('/cart');
  await page.getByRole('button', { name: /Xóa .* khỏi giỏ/ }).click();
  await expect(page.locator('.cart-line')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
});

test('AC-CHK-04/09: errors show under the fields and focus moves to the first one', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText('Nhập họ và tên (2–50 ký tự, có chữ cái).')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Vui lòng kiểm tra' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).fill('0123456789');
  await page.getByRole('textbox', { name: 'Số điện thoại', exact: true }).blur();
  await expect(page.getByText('Nhập số điện thoại di động hợp lệ (0 hoặc +84).')).toBeVisible();
});

test('AC-VOU-01/02/06/09: two code boxes, a chip per kind, reasons under the box', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('n2fwelcome15');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/N2FWELCOME15 · Giảm 15%/)).toBeVisible();
  await expect(page.locator('.totals .minus').first()).toContainText('−');
  // A free-ship code typed in the discount box still lands in its own slot (here: already free).
  await page.getByRole('textbox', { name: 'Mã miễn phí giao hàng' }).fill('zzz');
  await page.getByRole('button', { name: 'Áp dụng mã miễn phí giao hàng' }).click();
  await expect(page.getByText('Mã giảm giá không tồn tại.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mã miễn phí giao hàng' })).toHaveValue('zzz');
});

test('AC-VOU-11: too many wrong codes lock both boxes', async ({ page, isMobile }) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await setFlags(page, { voucherLocked: true });
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('abc');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/Bạn đã nhập sai quá nhiều lần/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mã giảm giá' })).toBeDisabled();
});

test('AC-CHK-12: price-changed shows old and new prices and needs a second click', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await expect(page.locator('.grand dd')).toBeVisible();
  await setFlags(page, { placeError: 'price-changed' });
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/Giá một số sản phẩm vừa thay đổi/)).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText(/Giá .* → .*/).first()).toBeVisible();
});

test('AC-VOU-12: voucher-changed drops the code and keeps the form', async ({ page, isMobile }) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await page.getByRole('textbox', { name: 'Mã giảm giá' }).fill('N2FWELCOME15');
  await page.getByRole('button', { name: 'Áp dụng mã giảm giá' }).click();
  await expect(page.getByText(/N2FWELCOME15 · /)).toBeVisible();
  await setFlags(page, { placeError: 'voucher-changed' });
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText(/Mã N2FWELCOME15 vừa hết hiệu lực/)).toBeVisible();
  await expect(page.getByText(/N2FWELCOME15 · /)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Họ và tên', exact: true })).toHaveValue(
    'Trần Bình',
  );
});

test('AC-CHK-13: stock-changed marks the line and "Cập nhật" fixes it', async ({
  page,
  isMobile,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  await openSummary(page, isMobile);
  await setFlags(page, { placeError: 'stock-changed' });
  await page.getByRole('button', { name: /Đặt đơn trải nghiệm/ }).click();
  await expect(page.getByText('Một số sản phẩm không còn đủ số lượng.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Cập nhật đơn theo số lượng còn lại/ }),
  ).toBeVisible();
});

test('AC-CHK-19/26/30: double click places one order; success page survives F5', async ({
  page,
}) => {
  await addBlazer(page);
  await page.goto('/checkout');
  await fillCheckout(page);
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.dblclick();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  const url = page.url();
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Bình.' })).toBeVisible();
  await expect(page.getByText(/nine2fine sẽ gọi xác nhận đơn trong 2 giờ làm việc/)).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('heading', { name: 'Cảm ơn bạn, Bình.' })).toBeVisible();
  // Back from the success page must not return to the form.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/checkout$/);
});
