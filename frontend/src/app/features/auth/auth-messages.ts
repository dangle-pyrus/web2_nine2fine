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

/** Email codes (sign-in, sign-up, password reset, order lookup): one length everywhere, valid 5 minutes.
 * Must match the backend `OTP_POLICY.digits` (backend/src/config/assumptions.ts). */
export const OTP_DIGITS = 6;
export const OTP_TTL_MINUTES = 5;
export const CODE_PATTERN = new RegExp(`^\\d{${OTP_DIGITS}}$`);
/** Same text as the backend validation message. */
export const CODE_MESSAGE = `Nhập đủ ${OTP_DIGITS} chữ số của mã xác thực.`;

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Nhập địa chỉ email hợp lệ.',
  code: CODE_MESSAGE,
  firstName: "Tên chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
  lastName: "Họ chỉ gồm chữ cái, dấu cách, dấu ' và dấu -.",
  birthDate: 'Ngày sinh chưa hợp lệ.',
  acceptedTerms: 'Bạn cần đồng ý để tạo tài khoản.',
  newPassword: 'Mật khẩu chưa đạt yêu cầu. Xem các điều kiện bên dưới.',
  password: 'Mật khẩu chưa đạt yêu cầu. Xem các điều kiện bên dưới.',
  registrationToken: 'Phiên đăng ký đã hết hạn. Vui lòng xác thực email lại.',
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

/** Keeps the digits of a typed or pasted code ("123 456", "123-456") and caps it at `OTP_DIGITS`. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_DIGITS);
}

/**
 * Same rule as the backend `EMAIL_RE` (backend/src/lib/validate.ts): ASCII only; the local part is
 * letters, digits and `. _ % + -` (no leading, trailing or doubled dot); every domain label is
 * non-empty (so `a@.gmail.com` fails) and the ending has at least 2 letters.
 */
const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)[a-z0-9._%+-]{1,64}(?<!\.)@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
/** Accented letters, emoji or other non-ASCII characters. */
const NON_ASCII = /[^!-~]/;

export const EMAIL_MESSAGE = 'Nhập địa chỉ email hợp lệ.';
export const EMAIL_ACCENT_MESSAGE = 'Email không được chứa chữ có dấu hoặc ký tự đặc biệt.';

/** AC-AUTH-02: judged after trimming; 6 to 254 characters and the pattern above. */
export function validEmail(raw: string): boolean {
  const email = raw.trim();
  return (
    email.length >= 6 && email.length <= 254 && !NON_ASCII.test(email) && EMAIL_PATTERN.test(email)
  );
}

/** `{ emailAccent }` for accented / non-ASCII input, `{ email }` for any other bad address. */
export function emailValidator(control: AbstractControl<string>): ValidationErrors | null {
  const email = (control.value ?? '').trim();
  if (NON_ASCII.test(email)) return { emailAccent: true };
  return validEmail(email) ? null : { email: true };
}

/** Message for the errors `emailValidator` returns. */
export function emailErrorMessage(errors: ValidationErrors | null): string {
  return errors?.['emailAccent'] ? EMAIL_ACCENT_MESSAGE : EMAIL_MESSAGE;
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
