import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AuthError, AuthErrorCode } from './data-access/auth-api';

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-code': 'Mã xác thực không đúng hoặc đã hết hạn.',
  'invalid-credentials': 'Email hoặc mật khẩu chưa đúng.',
  'email-registered': 'Email này đã có tài khoản. Vui lòng đăng nhập.',
  'email-not-registered': 'Email này chưa có tài khoản nine2fine.',
  'rate-limited': 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  unavailable: 'Không thể kết nối. Vui lòng thử lại.',
};

export function authErrorMessage(error: unknown): string {
  return MESSAGES[error instanceof AuthError ? error.code : 'unavailable'];
}

export const CODE_PATTERN = /^\d{8}$/;
export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Tối thiểu 8 ký tự.', test: (value: string) => value.length >= 8 },
  {
    id: 'mix',
    label: 'Cần ít nhất 1 ký tự in hoa, và 1 ký tự số.',
    test: (value: string) => /[A-Z]/.test(value) && /\d/.test(value),
  },
];

export function passwordPolicy(rules: readonly PasswordRule[] = PASSWORD_RULES): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    rules.every((rule) => rule.test(control.value)) ? null : { passwordPolicy: true };
}

/** Validator for a confirmation field; pair with re-validation when the source changes. */
export function matches(source: () => string): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    control.value === source() ? null : { mismatch: true };
}
