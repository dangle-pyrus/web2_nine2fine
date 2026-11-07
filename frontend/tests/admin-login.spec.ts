import { expect, Page, test } from '@playwright/test';

const ADMIN = 'admin@nine2fine.vn';
const ADMIN_PASSWORD = 'Admin2026Mock';
const SIGN_IN = { name: 'Đăng nhập', exact: true } as const;

async function fill(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
}

test.describe('admin sign-in', () => {
  test('layout: one form, no demo account block', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập quản trị' })).toBeVisible();
    await expect(page.getByText('Tài khoản demo')).toHaveCount(0);
    await expect(page.getByText('admin123')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toHaveAttribute('autocapitalize', 'off');
  });

  test('BR-AUTH-17: empty and malformed input is explained under the field', async ({ page }) => {
    await page.goto('/admin/login');
    const submit = page.getByRole('button', SIGN_IN);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('Nhập email.')).toBeVisible();
    await expect(page.getByText('Nhập mật khẩu.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await fill(page, 'abc@', 'x');
    await submit.click();
    await expect(page.getByText('Nhập địa chỉ email hợp lệ.')).toBeVisible();
  });

  test('AC-AUTH-42: wrong credentials give one message and keep the input', async ({ page }) => {
    await page.goto('/admin/login');
    await fill(page, ADMIN, 'WrongPass1');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu chưa đúng.');
    await expect(page.getByLabel('Email')).toHaveValue(ADMIN);
    await expect(page.getByLabel('Mật khẩu')).toHaveValue('WrongPass1');
  });

  test('AC-AUTH-44: five wrong passwords lock the account, even for the right one', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await fill(page, 'kho@nine2fine.vn', 'WrongPass1');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await page.getByRole('button', SIGN_IN).click();
      await expect(page.getByRole('alert')).toContainText(
        attempt < 5 ? 'Email hoặc mật khẩu chưa đúng.' : 'thử lại sau 15 phút',
      );
    }
    await page.getByLabel('Mật khẩu').fill('Staff2026Mock');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText(
      'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    );
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('AC-AUTH-50: disabled staff sees the support email only with the right password', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await fill(page, 'han.pg@nine2fine.vn', 'Staff2026Mock');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Tài khoản của bạn đang bị tạm khóa');
    await expect(page.getByRole('link', { name: 'phthang0872@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:phthang0872@gmail.com',
    );
  });

  test('AC-AUTH-79/86: signed out /admin/orders returns there after sign-in', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?returnUrl=%2Fadmin%2Forders/);
    await expect(page.getByText('Phiên đăng nhập đã hết hạn.')).toHaveCount(0);
    await fill(page, ADMIN, ADMIN_PASSWORD);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/admin\/orders$/);
  });

  for (const target of ['%2Fnew-in', '%2F%2Fevil.example', '%2Fadmin%2Flogin']) {
    test(`returnUrl ${target} outside /admin is ignored (decision 2026-11-07)`, async ({
      page,
    }) => {
      await page.goto(`/admin/login?returnUrl=${target}`);
      await fill(page, ADMIN, ADMIN_PASSWORD);
      await page.getByRole('button', SIGN_IN).click();
      await expect(page).toHaveURL(/\/admin\/?$/);
    });
  }

  test('AC-AUTH-87: signed-in staff opening /admin/login goes to /admin', async ({ page }) => {
    await page.goto('/admin/login');
    await fill(page, ADMIN, ADMIN_PASSWORD);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await page.goto('/admin/login?returnUrl=%2Fadmin%2Finventory');
    await expect(page).toHaveURL(/\/admin\/inventory$/);
  });

  test('BR-AUTH-26: expired-session banner uses the info tone', async ({ page }) => {
    await page.goto('/admin/login');
    await page.evaluate(() => history.replaceState({ expired: true }, ''));
    await page.reload();
    const banner = page.locator('.banner--info');
    await expect(banner).toContainText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    await expect(page.locator('.banner--critical')).toHaveCount(0);
  });

  test('sign out ends the admin session', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The sign-out menu is covered on desktop.');
    await page.goto('/admin/login');
    await fill(page, ADMIN, ADMIN_PASSWORD);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await page
      .getByRole('button', { name: /Đăng xuất/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?returnUrl=/);
  });
});
