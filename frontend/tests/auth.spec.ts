import { expect, Page, test } from '@playwright/test';
import {
  DEMO_VERIFICATION_CODE,
  MOCK_OFFLINE_EMAIL,
  MOCK_RACE_EMAIL,
  MOCK_RATE_LIMITED_EMAIL,
  MOCK_ACCOUNTS,
} from '../src/mocks/accounts';

const member = MOCK_ACCOUNTS[0];
const disabled = MOCK_ACCOUNTS[1];
const CODE_LABEL = 'Mã xác thực (8 số)';
const SIGN_IN = { name: 'Đăng nhập', exact: true } as const;

async function submitEmail(page: Page, email: string, url = '/auth/login'): Promise<void> {
  await page.goto(url);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
}

async function toPasswordStep(page: Page, email = member.email): Promise<void> {
  await submitEmail(page, email);
  await page.getByRole('button', { name: 'Sử dụng mật khẩu' }).click();
}

test.describe('storefront sign-in', () => {
  test('AC-AUTH-12/13/39: code sign-in returns to origin and can sign out', async ({
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
    await page.getByLabel('Email').fill(`  ${member.email.toUpperCase()} `);
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nhập mã 8 số');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByText(/Gửi lại mã trong \d+ giây/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Gửi lại mã sau/ })).toBeDisabled();

    await page.getByLabel(CODE_LABEL).fill('00000000');
    await page.getByRole('button', SIGN_IN).click();
    const error = page.getByRole('alert').filter({ hasText: 'Mã xác thực không đúng' });
    await expect(error).toBeVisible();
    await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
    await expect(page.getByLabel(CODE_LABEL)).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.getByRole('link', { name: `Tài khoản của ${member.firstName}` }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await page
      .getByRole('navigation', { name: 'Tài khoản' })
      .getByRole('button', { name: 'Đăng xuất' })
      .click();
    await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
    // The session is gone on the server side too: a reload stays signed out (AC-AUTH-70).
    await page.reload();
    await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
  });

  test('AC-AUTH-25/67: session survives a reload and auth pages redirect away', async ({
    page,
  }) => {
    await submitEmail(page, member.email, '/auth/login?returnUrl=%2Fshop');
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/shop$/);
    await page.reload();
    await expect(
      page.getByRole('link', { name: `Tài khoản của ${member.firstName}` }),
    ).toBeVisible();
    await page.goto('/auth/login?returnUrl=%2Fshop');
    await expect(page).toHaveURL(/\/shop$/);
    await page.goto('/auth/register');
    await expect(page).not.toHaveURL(/\/auth\//);
  });

  test('AC-AUTH-01/02: email is trimmed before it is checked', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill('minh@');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Nhập địa chỉ email hợp lệ.')).toBeVisible();
    await page.getByLabel('Email').fill('a@b.c');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Nhập địa chỉ email hợp lệ.')).toBeVisible();
    await page.getByLabel('Email').fill(`  ${member.email.toUpperCase()}  `);
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nhập mã 8 số');
  });

  test('AC-AUTH-05: lookup rate limit shows the wait; AC-AUTH-94: offline keeps the email', async ({
    page,
  }) => {
    await submitEmail(page, MOCK_RATE_LIMITED_EMAIL);
    await expect(page.getByRole('alert')).toContainText(
      'Bạn thao tác quá nhanh. Vui lòng thử lại sau 10 phút.',
    );
    await page.getByLabel('Email').fill(MOCK_OFFLINE_EMAIL);
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByRole('alert')).toContainText('Không thể kết nối. Vui lòng thử lại.');
    await expect(page.getByLabel('Email')).toHaveValue(MOCK_OFFLINE_EMAIL);
  });

  test('AC-AUTH-20/22: five wrong codes lock code sign-in; password sign-in still works', async ({
    page,
  }) => {
    await submitEmail(page, member.email);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await page.getByLabel(CODE_LABEL).fill('11111111');
      await page.getByRole('button', SIGN_IN).click();
      await expect(page.getByRole('alert').filter({ hasText: 'không đúng' })).toBeVisible();
    }
    await page.getByLabel(CODE_LABEL).fill('11111111');
    await page.getByRole('button', SIGN_IN).click();
    const locked = page
      .getByRole('alert')
      .filter({ hasText: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
    await expect(locked).toBeVisible();
    // A right code is refused during the lock.
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await page.getByRole('button', SIGN_IN).click();
    await expect(locked).toBeVisible();
    await page.getByRole('button', { name: 'Sử dụng mật khẩu' }).click();
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill(member.password ?? '');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/new-in$/);
  });

  test('AC-AUTH-42/44: wrong password, then lock after five with a way out', async ({ page }) => {
    await toPasswordStep(page);
    const password = page.getByRole('textbox', { name: 'Mật khẩu', exact: true });
    await password.fill('WrongPass1');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu chưa đúng.');
    await expect(password).toHaveValue('WrongPass1');
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await page.getByRole('button', SIGN_IN).click();
      await expect(page.getByRole('alert')).toContainText(
        attempt < 5 ? 'Email hoặc mật khẩu chưa đúng.' : 'Thử lại sau 15 phút',
      );
    }
    await expect(page.getByRole('alert')).toContainText('đăng nhập bằng mã xác thực');
    // Right password during the lock is refused as well.
    await password.fill(member.password ?? '');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Thử lại sau 15 phút');
    // The code route is the way out and clears the lock.
    await page.getByRole('button', { name: 'Sử dụng mã xác thực' }).click();
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/new-in$/);
  });

  test('AC-AUTH-50: disabled account is told only after the right password', async ({ page }) => {
    await toPasswordStep(page, disabled.email);
    const password = page.getByRole('textbox', { name: 'Mật khẩu', exact: true });
    await password.fill('WrongPass1');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu chưa đúng.');
    await password.fill(disabled.password ?? '');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page.getByRole('alert')).toContainText('Tài khoản của bạn đang bị tạm khóa');
    await expect(page.getByRole('link', { name: 'phthang0872@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:phthang0872@gmail.com',
    );
  });

  for (const bad of ['%2F%2Fevil.example', '%2Fauth%2Fregister', '%2Fadmin%2Flogin']) {
    test(`AC-AUTH-31 returnUrl ${bad} is dropped`, async ({ page }) => {
      await submitEmail(page, member.email, `/auth/login?returnUrl=${bad}`);
      await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
      await page.getByRole('button', SIGN_IN).click();
      await expect(page).toHaveURL(/\/new-in$/);
    });
  }
});

test.describe('storefront register', () => {
  async function openRegister(page: Page, email = 'new.member@example.com'): Promise<void> {
    await submitEmail(page, email);
    await expect(page).toHaveURL(/\/auth\/register$/);
  }
  const first = (page: Page) => page.getByRole('textbox', { name: 'Tên', exact: true });
  const last = (page: Page) => page.getByRole('textbox', { name: 'Họ', exact: true });
  async function birth(page: Page, day: string, month: string, year: string): Promise<void> {
    await page.getByRole('textbox', { name: 'Ngày', exact: true }).fill(day);
    await page.getByRole('textbox', { name: 'Tháng', exact: true }).fill(month);
    await page.getByRole('textbox', { name: 'Năm', exact: true }).fill(year);
  }

  test('AC-AUTH-27/28/31: required fields, name rules and optional birth date', async ({
    page,
  }) => {
    await openRegister(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByText('new.member@example.com')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Đăng ký nhận email/ })).not.toBeChecked();

    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
    await expect(page.getByText('Nhập đủ 8 chữ số của mã xác thực.')).toBeVisible();
    await expect(page.getByText('Nhập tên của bạn.')).toBeVisible();
    await expect(page.getByText('Nhập họ của bạn.')).toBeVisible();
    await expect(page.getByText('Bạn cần đồng ý để tạo tài khoản.')).toBeVisible();

    await page.getByLabel(CODE_LABEL).fill('1234-5678');
    await expect(page.getByLabel(CODE_LABEL)).toHaveValue('12345678');
    await first(page).fill('An<3');
    await last(page).fill('x'.repeat(51));
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByText("Tên chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.")).toBeVisible();
    await expect(page.getByText('Họ tối đa 50 ký tự.')).toBeVisible();
    await expect(page.getByText('Ngày sinh chưa hợp lệ.')).toHaveCount(0);
  });

  test('AC-AUTH-32/32a/32b/32c: birth date must be real, 13 or older, year within limit', async ({
    page,
  }) => {
    await openRegister(page);
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await first(page).fill('An');
    await last(page).fill('Trần');
    await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
    const submit = page.getByRole('button', { name: 'Tạo tài khoản' });
    const year = new Date().getFullYear();

    await birth(page, '31', '02', '2000');
    await submit.click();
    await expect(page.getByText('Ngày sinh chưa hợp lệ.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ngày', exact: true })).toBeFocused();

    await birth(page, '01', '01', '1899');
    await submit.click();
    await expect(page.getByText('Ngày sinh chưa hợp lệ.')).toBeVisible();

    await birth(page, '01', '01', String(year - 9));
    await submit.click();
    await expect(page.getByText('Bạn cần đủ 13 tuổi để tạo tài khoản.')).toBeVisible();

    await birth(page, '01', '01', String(year - 10));
    await submit.click();
    await expect(page.getByText('Bạn cần đủ 13 tuổi để tạo tài khoản.')).toBeVisible();

    await birth(page, '28', '02', '2001');
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText('Đang tạo tài khoản…');
    await expect(page).toHaveURL(/\/new-in$/);
  });

  test('AC-AUTH-31/36: register without birth date signs in and shows the name', async ({
    page,
  }) => {
    await openRegister(page);
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await first(page).fill('  Minh  ');
    await last(page).fill('Nguyễn   Văn');
    await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page).toHaveURL(/\/new-in$/);
    await expect(page.getByRole('link', { name: 'Tài khoản của Minh' })).toBeVisible();
  });

  test('AC-AUTH-93: wrong code shows under the code field', async ({ page }) => {
    await openRegister(page);
    await page.getByLabel(CODE_LABEL).fill('99999999');
    await first(page).fill('An');
    await last(page).fill('Trần');
    await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByText('Mã xác thực không đúng hoặc đã hết hạn.')).toBeVisible();
    await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
    await expect(first(page)).toHaveValue('An');
  });

  test('AC-AUTH-37: an account that appeared meanwhile offers sign-in', async ({ page }) => {
    await openRegister(page, MOCK_RACE_EMAIL);
    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    await first(page).fill('An');
    await last(page).fill('Trần');
    await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Email này đã có tài khoản.' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });

  test('AC-AUTH-30: opening register without an email goes to sign-in', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});

test.describe('forgot password', () => {
  test('AC-AUTH-51/51b/52/54/56: four rules, match check, then back to password sign-in', async ({
    page,
  }) => {
    await page.goto('/auth/forgot-password');
    await expect(page).toHaveURL(/\/auth\/login$/);

    await toPasswordStep(page);
    await page.getByRole('link', { name: 'Quên mật khẩu' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    const submit = page.getByRole('button', { name: 'Đổi mật khẩu' });
    await expect(submit).toBeDisabled();

    await page.getByLabel(CODE_LABEL).fill(DEMO_VERIFICATION_CODE);
    const fresh = page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true });
    await fresh.fill('short');
    await expect(page.getByText('Từ 8 đến 64 ký tự. Chưa đạt.')).toBeVisible();
    await expect(page.getByText('Có ít nhất 1 chữ in hoa (A–Z). Chưa đạt.')).toBeVisible();
    await expect(page.getByText('Có ít nhất 1 chữ số (0–9). Chưa đạt.')).toBeVisible();
    await fresh.fill(`${member.email.toUpperCase()}`);
    await expect(page.getByText('Không trùng với email của bạn. Chưa đạt.')).toBeVisible();
    await fresh.fill('x'.repeat(65));
    await expect(page.getByText('Từ 8 đến 64 ký tự. Chưa đạt.')).toBeVisible();
    await fresh.fill('NewPass2026');
    for (const rule of [
      'Từ 8 đến 64 ký tự.',
      'Có ít nhất 1 chữ in hoa (A–Z).',
      'Có ít nhất 1 chữ số (0–9).',
      'Không trùng với email của bạn.',
    ]) {
      await expect(page.getByText(`${rule} Đã đạt.`)).toBeVisible();
    }
    await page.getByLabel('Nhập lại mật khẩu mới').fill('NewPass2025');
    await page.getByLabel('Nhập lại mật khẩu mới').blur();
    await expect(page.getByText('Mật khẩu nhập lại chưa khớp.')).toBeVisible();
    await expect(submit).toBeDisabled();

    await page.getByLabel('Nhập lại mật khẩu mới').fill('NewPass2026');
    await submit.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã cập nhật mật khẩu' }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('NewPass2026');
    await page.getByRole('button', SIGN_IN).click();
    await expect(page).toHaveURL(/\/new-in$/);
  });

  test('AC-AUTH-59/60: wrong code shows under the field; cancel returns to the email step', async ({
    page,
  }) => {
    await toPasswordStep(page);
    await page.getByRole('link', { name: 'Quên mật khẩu' }).click();
    await page.getByLabel(CODE_LABEL).fill('00000000');
    await page.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill('NewPass2026');
    await page.getByLabel('Nhập lại mật khẩu mới').fill('NewPass2026');
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByText('Mã xác thực không đúng hoặc đã hết hạn.')).toBeVisible();
    await page.getByRole('link', { name: 'Hủy bỏ' }).click();
    await expect(page.getByLabel('Email')).toHaveValue(member.email);
  });
});

test.describe('resend countdown', () => {
  test('AC-AUTH-13/14: countdown, then resend is enabled; re-entering keeps the remaining time', async ({
    page,
  }) => {
    await page.clock.install();
    await submitEmail(page, member.email);
    await page.clock.runFor(1000);
    const resend = page.getByRole('button', { name: /Gửi lại mã/ });
    await expect(resend).toBeDisabled();
    await expect(page.getByText(/Gửi lại mã trong \d+ giây/)).toBeVisible();
    // Switch to password and back after 20 s: no error, the rest of the minute remains.
    await page.getByRole('button', { name: 'Sử dụng mật khẩu' }).click();
    await page.clock.runFor(20_000);
    await page.getByRole('button', { name: 'Sử dụng mã xác thực' }).click();
    await page.clock.runFor(1000);
    await expect(page.getByText(/Gửi lại mã trong (3\d|4\d) giây/)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.clock.runFor(61_000);
    await expect(page.getByText('Chưa nhận được mã? Bấm biểu tượng để gửi lại.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gửi lại mã xác thực' })).toBeEnabled();
  });

  test('AC-AUTH-15: sixth send inside 30 minutes is blocked with the wait in minutes', async ({
    page,
  }) => {
    await page.clock.install();
    await submitEmail(page, member.email);
    await page.clock.runFor(1000);
    for (let sent = 1; sent < 5; sent += 1) {
      await page.clock.runFor(61_000);
      await page.getByRole('button', { name: 'Gửi lại mã xác thực' }).click();
      await page.clock.runFor(1000);
    }
    await page.clock.runFor(61_000);
    await page.getByRole('button', { name: 'Gửi lại mã xác thực' }).click();
    await page.clock.runFor(1000);
    await expect(page.getByRole('alert')).toContainText(
      /Bạn thao tác quá nhanh. Vui lòng thử lại sau \d+ phút./,
    );
    await expect(page.getByRole('button', { name: 'Gửi lại mã xác thực' })).toBeEnabled();
  });
});
