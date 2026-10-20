import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

const member = MOCK_ACCOUNTS[0];

/** Signs in through the real UI; the mock session lives in memory, so avoid page reloads. */
async function signIn(page: Page, returnUrl: string, email = member.email): Promise<void> {
  await page.goto(returnUrl);
  await expect(page).toHaveURL(/\/auth\/login\?returnUrl=/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã số (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

async function openAccountLink(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Tài khoản' }).getByRole('link', { name }).click();
}

test('account guard, profile edit and password change', async ({ page }) => {
  await signIn(page, '/account/profile');
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole('heading', { name: 'Hồ sơ tài khoản' })).toBeVisible();
  await expect(page.getByText(member.email)).toBeVisible();
  // Tier depends on the optional demo seed (Bronze fixture, Silver when seeded).
  await expect(page.getByText(/^(Bronze|Silver|Gold) Member$/)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ lên hạng tiếp theo' })).toBeVisible();

  await page.getByRole('button', { name: 'Chỉnh sửa số điện thoại' }).click();
  const phone = page.getByLabel('Số điện thoại');
  await phone.fill('12345');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Nhập số điện thoại hợp lệ (0 hoặc +84).')).toBeVisible();
  await phone.fill('0987654321');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('0987654321')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thay đổi.' })).toBeVisible();

  await page.getByRole('button', { name: 'Chỉnh sửa mật khẩu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thay đổi mật khẩu' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Mật khẩu hiện tại', exact: true })
    .fill(member.password!);
  await dialog.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill(member.password!);
  await expect(dialog.getByText('Không trùng với mật khẩu hiện tại. Chưa đạt.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('Changed2026');
  await dialog
    .getByRole('textbox', { name: 'Nhập lại mật khẩu mới', exact: true })
    .fill('Changed2026');
  await dialog.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Đã đổi mật khẩu.')).toBeVisible();
});

test('addresses: list, set default, add with ward cascade, delete', async ({ page }) => {
  await signIn(page, '/account/addresses');
  const rows = page.locator('ul.list > li');
  // 3 fixture addresses, more when the optional demo seed is enabled.
  await expect(rows.nth(2)).toBeVisible();
  const initial = await rows.count();
  await expect(rows.first()).toContainText('Địa chỉ mặc định');

  await rows.nth(2).getByRole('button', { name: 'Đặt làm địa chỉ mặc định' }).click();
  await expect(rows.first()).toContainText('Trần An');
  await expect(rows.first()).toContainText('Địa chỉ mặc định');

  await page.getByRole('link', { name: 'Thêm địa chỉ' }).click();
  await expect(page.getByRole('heading', { name: 'Thêm địa chỉ nhận hàng' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm địa chỉ' }).click();
  await expect(page.getByText('Chọn Tỉnh/Thành phố.')).toBeVisible();
  await page.getByLabel('Tỉnh/Thành phố:').selectOption({ label: 'Thành phố Đà Nẵng' });
  await page.getByLabel('Phường/Xã:').selectOption({ label: 'Phường Sơn Trà' });
  await page.getByLabel('Tên đường, Tòa nhà, Số nhà:').fill('18 Võ Nguyên Giáp');
  await expect(page.getByLabel('Họ và tên:')).toHaveValue(`${member.lastName} ${member.firstName}`);
  await page.getByRole('switch', { name: 'Đặt làm địa chỉ trả hàng' }).check();
  await page.getByRole('button', { name: 'Thêm địa chỉ' }).click();

  await expect(page).toHaveURL(/\/account\/addresses$/);
  await expect(rows).toHaveCount(initial + 1);
  const added = rows.filter({ hasText: '18 Võ Nguyên Giáp' });
  await expect(added).toContainText('Địa chỉ trả hàng');
  await expect(rows.filter({ hasText: 'Địa chỉ trả hàng' })).toHaveCount(1);

  await added.getByRole('button', { name: /Xóa địa chỉ/ }).click();
  await page
    .getByRole('dialog', { name: 'Xóa địa chỉ?' })
    .getByRole('button', { name: 'Xóa địa chỉ' })
    .click();
  await expect(rows).toHaveCount(initial);
});

test('orders: status tabs in URL, cancel pending order, detail progress', async ({ page }) => {
  await signIn(page, '/account/orders');
  const cards = page.locator('n2f-order-card');
  const tabs = page.getByRole('navigation', { name: 'Lọc theo trạng thái đơn hàng' });
  // Counts come from the tab badges (active statuses only), so the test works with or without the
  // optional demo seed.
  const tabCount = async (name: RegExp) =>
    Number((await tabs.getByRole('link', { name }).locator('.count').allTextContents())[0] ?? 0);
  await expect(cards.first()).toBeVisible();
  // Every tab is named like the badge of the orders it holds.
  for (const name of [
    /Chờ thanh toán/,
    /Đang chuẩn bị/,
    /Đang vận chuyển/,
    /Đang giao hàng/,
    /^Hoàn thành/,
    /Đã hủy/,
    /Trả hàng/,
  ]) {
    await expect(tabs.getByRole('link', { name })).toBeVisible();
  }

  const shipping = await tabCount(/Đang vận chuyển/);
  await tabs.getByRole('link', { name: /Đang vận chuyển/ }).click();
  await expect(page).toHaveURL(/status=shipping/);
  await expect(cards).toHaveCount(shipping);
  const card = cards.filter({ hasText: 'N2F260930004' });
  await expect(card).toContainText('Đang vận chuyển');
  // The order ID is visible on the card, not only to screen readers.
  await expect(card.getByRole('heading', { name: 'Đơn #N2F260930004' })).toBeVisible();

  const pending = await tabCount(/Chờ thanh toán/);
  await tabs.getByRole('link', { name: /Chờ thanh toán/ }).click();
  await cards.filter({ hasText: 'N2F261002001' }).getByRole('button', { name: 'Hủy đơn' }).click();
  await page
    .getByRole('dialog', { name: 'Hủy đơn hàng?' })
    .getByRole('button', { name: 'Hủy đơn' })
    .click();
  await expect(page.getByRole('status').filter({ hasText: /Đã hủy đơn/ })).toBeVisible();
  await expect(cards).toHaveCount(pending - 1);
  if (pending === 1) {
    await expect(page.getByText('Không có đơn nào ở mục “Chờ thanh toán”.')).toBeVisible();
  }
  await tabs.getByRole('link', { name: /Đã hủy/ }).click();
  await expect(cards.filter({ hasText: 'N2F261002001' })).toContainText('Bạn đã hủy đơn');

  await tabs.getByRole('link', { name: 'Tất cả', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm đơn hàng' }).fill('N2F260929002');
  await expect(cards).toHaveCount(1);
  await cards.getByRole('link', { name: /Chi tiết đơn/ }).click();
  await expect(page.getByRole('heading', { name: 'Đơn #N2F260929002' })).toBeVisible();
  const progress = page.getByRole('list', { name: 'Tiến trình đơn hàng' });
  await expect(progress.locator('[aria-current="step"]')).toContainText('Đang giao');
  await expect(page.locator('.summary .total')).toContainText('Thanh toán khi nhận hàng');
  await expect(page.getByRole('heading', { name: 'Lịch sử đơn hàng' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sao chép mã vận đơn/ })).toBeVisible();
});

test('new member sees Figma empty states and creates a first password', async ({ page }) => {
  await page.goto('/auth/login?returnUrl=%2Faccount%2Fvouchers');
  await page.getByLabel('Email').fill('first.timer@example.com');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Mã số (8 số)' }).fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('textbox', { name: 'Tên', exact: true }).fill('Lan');
  await page.getByRole('textbox', { name: 'Họ', exact: true }).fill('Phạm');
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  await expect(page).toHaveURL(/\/account\/vouchers$/);
  await expect(page.getByText('Bạn chưa có mã giảm giá nào.')).toBeVisible();
  await openAccountLink(page, 'Lịch sử mua hàng');
  await expect(page.getByRole('link', { name: 'Mua hàng ngay' })).toBeVisible();
  await openAccountLink(page, 'Địa chỉ');
  await expect(
    page.getByText('Bạn chưa có địa chỉ nhận hàng nào.', { exact: false }),
  ).toBeVisible();

  await openAccountLink(page, 'Tài khoản');
  await expect(page.getByText('Chưa tạo mật khẩu')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo mật khẩu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo mật khẩu' });
  await dialog.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('FirstPass9');
  await dialog.getByRole('textbox', { name: 'Nhập lại mật khẩu', exact: true }).fill('FirstPass9');
  await dialog.getByRole('button', { name: 'Tạo mật khẩu' }).click();
  await expect(page.getByText('Đã tạo mật khẩu.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Tài khoản' })
    .getByRole('button', { name: 'Đăng xuất' })
    .click();
  await expect(page).toHaveURL(/\/new-in$/);
  await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
});
