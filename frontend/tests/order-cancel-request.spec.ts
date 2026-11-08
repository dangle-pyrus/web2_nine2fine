import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

/**
 * Slice 4 lát 4.5, storefront side on the mock adapters (BR-ADM-33, BR-ADM-29, 31; AC-ADM-36, 37,
 * 39 FE parts): at `to_ship` the shopper sends a cancel request the shop reviews; at `to_pay` the
 * order is still cancelled at once. The shop's answer is played by the mock flag `cancelDecision`,
 * which is applied the next time the order is read.
 */
const member = MOCK_ACCOUNTS[0];
const REQUEST_BUTTON = 'Gửi yêu cầu huỷ';

async function setFlags(page: Page, flags: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    (value) => sessionStorage.setItem('n2f.mock.flags', JSON.stringify(value)),
    flags,
  );
}

async function addBlazer(page: Page): Promise<void> {
  await page.goto('/product/the-everyday-blazer');
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào giỏ hàng' })).toBeVisible();
}

/** Places a COD order as a guest; returns its code. */
async function placeGuestOrder(page: Page): Promise<string> {
  await addBlazer(page);
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
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  return /(N2F\d{10})$/.exec(page.url())![1];
}

async function trackGuestOrder(page: Page, code: string): Promise<void> {
  await page.goto('/track-order');
  await page.getByRole('textbox', { name: 'Mã đơn hàng' }).fill(code);
  await page.getByRole('textbox', { name: 'Email đặt hàng' }).fill('binh@example.com');
  await page.getByRole('button', { name: 'Gửi mã xác minh' }).click();
  await page.getByRole('textbox', { name: 'Mã xác minh (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Xem đơn hàng' }).click();
  await expect(page.getByRole('heading', { name: `Đơn #${code}` })).toBeVisible();
}

const requestDialog = (page: Page) => page.getByRole('dialog', { name: 'Gửi yêu cầu huỷ đơn' });

async function sendRequest(page: Page): Promise<void> {
  await page.getByRole('button', { name: REQUEST_BUTTON }).click();
  await requestDialog(page).getByRole('button', { name: REQUEST_BUTTON }).click();
}

test('BR-ADM-33 / AC-ADM-36 (FE): a to_ship order only gets "Gửi yêu cầu huỷ", reason up to 250, then it waits', async ({
  page,
}) => {
  const code = await placeGuestOrder(page);
  await trackGuestOrder(page, code);
  await expect(page.getByRole('button', { name: 'Hủy đơn', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: REQUEST_BUTTON }).click();
  const dialog = requestDialog(page);
  await expect(dialog).toContainText('nine2fine sẽ xem xét yêu cầu');
  await dialog.getByLabel(/Lý do huỷ/).fill('x'.repeat(251));
  await dialog.getByRole('button', { name: REQUEST_BUTTON }).click();
  await expect(dialog.getByText('Lý do tối đa 250 ký tự.')).toBeVisible();
  await dialog.getByLabel(/Lý do huỷ/).fill('x'.repeat(250));
  await expect(dialog.getByText('250/250 ký tự')).toBeVisible();
  await dialog.getByRole('button', { name: REQUEST_BUTTON }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu huỷ đơn' }),
  ).toBeVisible();
  await expect(page.getByText('Chờ duyệt huỷ').first()).toBeVisible();
  await expect(page.getByText('Đã gửi yêu cầu huỷ, nine2fine sẽ phản hồi sớm.')).toBeVisible();
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hủy đơn', exact: true })).toHaveCount(0);
  await expect(page.locator('.history')).toContainText('Bạn đã gửi yêu cầu huỷ đơn');
});

test('AC-ADM-39 (FE) / BR-ADM-31: a rejected request shows the reason and the hotline, with no way to ask again', async ({
  page,
}) => {
  const code = await placeGuestOrder(page);
  await trackGuestOrder(page, code);
  await sendRequest(page);
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);

  await setFlags(page, { cancelDecision: 'rejected' });
  await trackGuestOrder(page, code);
  const rejected = page.getByTestId('cancel-rejected');
  await expect(rejected).toContainText('Yêu cầu huỷ chưa được chấp nhận');
  await expect(rejected).toContainText('Đơn đã được đóng gói');
  await expect(rejected.getByRole('link', { name: '1900 6868 29' })).toHaveAttribute(
    'href',
    'tel:1900686829',
  );
  await expect(page.getByText('Đang chuẩn bị hàng').first()).toBeVisible();
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hủy đơn', exact: true })).toHaveCount(0);
});

test('BR-ADM-30 (FE): an approved request shows the order as cancelled', async ({ page }) => {
  const code = await placeGuestOrder(page);
  await trackGuestOrder(page, code);
  await sendRequest(page);
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);

  await setFlags(page, { cancelDecision: 'approved' });
  await trackGuestOrder(page, code);
  await expect(page.getByText('Đã hủy').first()).toBeVisible();
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
});

test('AC-ADM-37 (FE): a to_pay order is still cancelled at once; a member to_ship order sends a request', async ({
  page,
}) => {
  await page.goto('/auth/login?returnUrl=%2Faccount%2Forders%2FN2F261002001');
  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã xác thực (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn #N2F261002001' })).toBeVisible();
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hủy đơn', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Hủy đơn hàng?' })
    .getByRole('button', { name: 'Hủy đơn' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã hủy đơn #N2F261002001' }),
  ).toBeVisible();

  // Member order at to_ship (COD, signed in): the detail page asks for a request, not a cancel.
  await addBlazer(page);
  await page.goto('/checkout');
  await expect(page.getByRole('radio', { name: /Nguyễn Minh.*Mặc định/ })).toBeChecked();
  await expect(page.getByText('Dự kiến giao:')).toBeVisible();
  await page.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }).check();
  const submit = page.getByRole('button', { name: /Đặt đơn trải nghiệm/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/order-success\/N2F\d{10}$/);
  const code = /(N2F\d{10})$/.exec(page.url())![1];
  await page.goto(`/account/orders/${code}`);
  await expect(page.getByRole('heading', { name: `Đơn #${code}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy đơn', exact: true })).toHaveCount(0);
  await sendRequest(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu huỷ đơn' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: REQUEST_BUTTON })).toHaveCount(0);
});
