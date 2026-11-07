export type ErrorCode =
  | 'validation'
  | 'underage'
  | 'invalid-code'
  | 'code-locked'
  | 'rate-limited'
  | 'password-locked'
  | 'invalid-credentials'
  | 'account-disabled'
  | 'email-registered'
  | 'unauthenticated'
  | 'forbidden'
  | 'origin-not-allowed'
  | 'unavailable';

const STATUS: Record<ErrorCode, number> = {
  validation: 422,
  underage: 422,
  'invalid-code': 422,
  'code-locked': 429,
  'rate-limited': 429,
  'password-locked': 429,
  'invalid-credentials': 401,
  'account-disabled': 403,
  'email-registered': 409,
  unauthenticated: 401,
  forbidden: 403,
  'origin-not-allowed': 403,
  unavailable: 500,
};

export interface AppErrorExtras {
  field?: string;
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extras: AppErrorExtras = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

const minutes = (s: number) => Math.max(1, Math.ceil(s / 60));

export const Errors = {
  validation: (message: string, field?: string) => new AppError('validation', message, { field }),
  underage: () => new AppError('underage', 'Bạn cần đủ 13 tuổi để tạo tài khoản.', { field: 'birthDate' }),
  invalidCode: () => new AppError('invalid-code', 'Mã xác thực không đúng hoặc đã hết hạn.'),
  codeLocked: (sec: number) =>
    new AppError('code-locked', `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes(sec)} phút.`, {
      retryAfterSeconds: sec,
    }),
  rateLimited: (sec: number) =>
    new AppError('rate-limited', `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${sec} giây.`, {
      retryAfterSeconds: sec,
    }),
  passwordLocked: (sec: number) =>
    new AppError(
      'password-locked',
      `Bạn đã nhập sai quá nhiều lần. Thử lại sau ${minutes(sec)} phút hoặc đăng nhập bằng mã xác thực.`,
      { retryAfterSeconds: sec },
    ),
  invalidCredentials: () => new AppError('invalid-credentials', 'Email hoặc mật khẩu chưa đúng.'),
  accountDisabled: (supportEmail: string) =>
    new AppError(
      'account-disabled',
      `Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ nine2fine để được hỗ trợ (${supportEmail}).`,
    ),
  emailRegistered: () => new AppError('email-registered', 'Email này đã có tài khoản. Vui lòng đăng nhập.'),
  unauthenticated: () => new AppError('unauthenticated', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.'),
  forbidden: () => new AppError('forbidden', 'Bạn không có quyền thực hiện thao tác này.'),
  originNotAllowed: () => new AppError('origin-not-allowed', 'Yêu cầu không được chấp nhận.'),
  unavailable: () => new AppError('unavailable', 'Không thể kết nối. Vui lòng thử lại.'),
};
