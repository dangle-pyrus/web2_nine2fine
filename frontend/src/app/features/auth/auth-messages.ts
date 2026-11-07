import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AuthError } from './data-access/auth-api';

/** Support address shown when an account is locked (decision 2026-11-07). */
export const SUPPORT_EMAIL = 'phthang0872@gmail.com';

/** A user-facing message; the flags add the links the plain text cannot carry. */
export interface AuthMessage {
  text: string;
  /** Append "Email hỗ trợ: <mailto link>". */
  support?: boolean;
  /** Append a link to the sign-in page. */
  signInLink?: boolean;
}

/** Waiting time as the backend gave it: under a minute in seconds, otherwise rounded-up minutes. */
export function formatWait(seconds: number | undefined): string {
  if (!seconds || seconds < 1) return 'ít phút';
  return seconds < 60 ? `${Math.ceil(seconds)} giây` : `${Math.ceil(seconds / 60)} phút`;
}

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Nhập địa chỉ email hợp lệ.',
  code: 'Nhập đủ 8 chữ số của mã xác thực.',
  firstName: "Tên chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
  lastName: "Họ chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
  birthDate: 'Ngày sinh chưa hợp lệ.',
  acceptedTerms: 'Bạn cần đồng ý để tạo tài khoản.',
  newPassword: 'Mật khẩu chưa đạt yêu cầu. Xem các điều kiện bên dưới.',
};

/**
 * Text for a failed auth request, chosen only from `error.code` (never from the HTTP status or the
 * server wording). `retryAfterSeconds` fills the wait, `field` picks the text of a field error.
 */
export function authMessage(error: unknown): AuthMessage {
  const failure = error instanceof AuthError ? error : new AuthError('unavailable');
  const wait = formatWait(failure.retryAfterSeconds);
  switch (failure.code) {
    case 'validation':
      return {
        text:
          (failure.field && FIELD_MESSAGES[failure.field]) ||
          'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
      };
    case 'underage':
      return { text: 'Bạn cần đủ 13 tuổi để tạo tài khoản.' };
    case 'invalid-code':
      return { text: 'Mã xác thực không đúng hoặc đã hết hạn.' };
    case 'code-locked':
      return { text: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${wait}.` };
    case 'password-locked':
      return {
        text: `Bạn đã nhập sai quá nhiều lần. Thử lại sau ${wait} hoặc đăng nhập bằng mã xác thực.`,
      };
    case 'rate-limited':
      return { text: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${wait}.` };
    case 'invalid-credentials':
      return { text: 'Email hoặc mật khẩu chưa đúng.' };
    case 'account-disabled':
      return {
        text: 'Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ.',
        support: true,
      };
    case 'email-registered':
      return { text: 'Email này đã có tài khoản. Vui lòng đăng nhập.', signInLink: true };
    default:
      // unauthenticated, forbidden, origin-not-allowed and unavailable all read as "try again".
      return { text: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

export const CODE_PATTERN = /^\d{8}$/;

/** Keeps the digits of a typed or pasted code ("1234 5678", "1234-5678") and caps it at 8. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** AC-AUTH-02: judged after trimming; 6 to 254 characters, one `@`, a dot in the domain. */
export function validEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length >= 6 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function emailValidator(control: AbstractControl<string>): ValidationErrors | null {
  return validEmail(control.value) ? null : { email: true };
}

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string, email: string) => boolean;
}

/** BR-AUTH-20. The email rule ignores case; an empty email never matches. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: 'Từ 8 đến 64 ký tự.',
    test: (value) => value.length >= 8 && value.length <= 64,
  },
  { id: 'upper', label: 'Có ít nhất 1 chữ in hoa (A–Z).', test: (value) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Có ít nhất 1 chữ số (0–9).', test: (value) => /[0-9]/.test(value) },
  {
    id: 'email',
    label: 'Không trùng với email của bạn.',
    test: (value, email) => !email || value.toLowerCase() !== email.trim().toLowerCase(),
  },
];

export function passwordPolicy(
  email: () => string,
  rules: readonly PasswordRule[] = PASSWORD_RULES,
): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    rules.every((rule) => rule.test(control.value, email())) ? null : { passwordPolicy: true };
}

/** Validator for a confirmation field; pair with re-validation when the source changes. */
export function matches(source: () => string): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    control.value === source() ? null : { mismatch: true };
}
