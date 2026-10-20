import { expect, Page, test } from '@playwright/test';
import { DEMO_VERIFICATION_CODE, MOCK_ACCOUNTS } from '../src/mocks/accounts';

const member = MOCK_ACCOUNTS[0];

async function submitEmail(page: Page, email: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
}

test('registered email signs in with code, returns to origin, and can sign out', async ({
  page,
  isMobile,
}) => {
  await page.goto('/shop');
  if (isMobile) {
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('navigation', { name: 'Menu di động' }).getByText('Đăng nhập').click();
    await page.goto('/auth/login?returnUrl=%2Fshop');
  } else {
    await page
      .getByRole('navigation', { name: 'Tiện ích' })
      .getByRole('link', { name: 'Đăng nhập' })
      .click();
  }
  await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fshop/);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByText('Nhập địa chỉ email hợp lệ.')).toBeVisible();

  await page.getByLabel('Email').fill(member.email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nhập mã 8 số');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText(/Gửi lại mã trong \d+ giây/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Gửi lại mã sau/ })).toBeDisabled();

  await page.getByLabel('Mã số (8 số)').fill('00000000');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mã xác thực không đúng');

  await page.getByLabel('Mã số (8 số)').fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await page.getByRole('link', { name: `Tài khoản của ${member.firstName}` }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await page
    .getByRole('navigation', { name: 'Tài khoản' })
    .getByRole('button', { name: 'Đăng xuất' })
    .click();
  await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
});

test('password sign-in toggles visibility and rejects wrong credentials', async ({ page }) => {
  await submitEmail(page, member.email);
  await page.getByRole('button', { name: 'Sử dụng mật khẩu' }).click();
  const password = page.getByRole('textbox', { name: 'Mật khẩu', exact: true });
  await password.fill('WrongPass1');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu chưa đúng.');
  await page.getByRole('button', { name: 'Chỉnh sửa Email' }).click();
  await expect(page.getByLabel('Email')).toHaveValue(member.email);
});

test('new email registers with validation; returnUrl rejects external targets', async ({
  page,
}) => {
  await page.goto('/auth/login?returnUrl=%2F%2Fevil.example');
  await page.getByLabel('Email').fill('new.member@example.com');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.getByText('new.member@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Nhập tên của bạn.')).toBeVisible();
  await expect(page.getByText('Bạn cần đồng ý để tạo tài khoản.')).toBeVisible();

  await page.getByLabel('Mã số (8 số)').fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('textbox', { name: 'Tên', exact: true }).fill('An');
  await page.getByRole('textbox', { name: 'Họ', exact: true }).fill('Trần');
  await page.getByRole('textbox', { name: 'Ngày', exact: true }).fill('31');
  await page.getByRole('textbox', { name: 'Tháng', exact: true }).fill('02');
  await page.getByRole('textbox', { name: 'Năm', exact: true }).fill('2001');
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Ngày sinh chưa hợp lệ.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Ngày', exact: true }).fill('28');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/new-in$/);
});

test('reset password enforces rules then returns to password sign-in', async ({ page }) => {
  await page.goto('/auth/forgot-password');
  await expect(page).toHaveURL(/\/auth\/login$/);

  await submitEmail(page, member.email);
  await page.getByRole('button', { name: 'Sử dụng mật khẩu' }).click();
  await page.getByRole('link', { name: 'Quên mật khẩu' }).click();
  const submit = page.getByRole('button', { name: 'Đổi mật khẩu' });
  await expect(submit).toBeDisabled();

  await page.getByLabel('Mã số (8 số)').fill(DEMO_VERIFICATION_CODE);
  await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('short');
  await expect(page.getByText('Tối thiểu 8 ký tự. Chưa đạt.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('NewPass2026');
  await expect(page.getByText('Tối thiểu 8 ký tự. Đã đạt.')).toBeVisible();
  await page.getByLabel('Nhập lại mật khẩu mới').fill('NewPass2025');
  await page.getByLabel('Nhập lại mật khẩu mới').blur();
  await expect(page.getByText('Mật khẩu nhập lại chưa khớp.')).toBeVisible();
  await expect(submit).toBeDisabled();

  await page.getByLabel('Nhập lại mật khẩu mới').fill('NewPass2026');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Đã cập nhật mật khẩu');
  await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('NewPass2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/new-in$/);
});
