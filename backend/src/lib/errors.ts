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
  | 'not-found'
  | 'invalid-address'
  | 'stock-changed'
  | 'price-changed'
  | 'voucher-changed'
  | 'idempotency-conflict'
  | 'possible-duplicate'
  | 'not-cancellable'
  | 'invalid-transition'
  | 'order-state-changed'
  | 'condition-not-met'
  | 'invalid-password'
  | 'unavailable'
  | 'publish-incomplete'
  | 'invalid-image'
  | 'duplicate'
  | 'version-conflict'
  | 'product-in-use'
  | 'variant-in-use'
  | 'voucher-in-use'
  | 'self-change'
  | 'last-admin'
  | 'not-returnable'
  | 'return-window-closed'
  | 'return-exists'
  | 'not-eligible'
  | 'already-reviewed'
  | 'wishlist-full';

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
  'not-found': 404,
  'invalid-address': 422,
  'stock-changed': 409,
  'price-changed': 409,
  'voucher-changed': 409,
  'idempotency-conflict': 409,
  'possible-duplicate': 409,
  'not-cancellable': 409,
  'invalid-transition': 409,
  'order-state-changed': 409,
  'condition-not-met': 409,
  'invalid-password': 422,
  unavailable: 500,
  'publish-incomplete': 422,
  'invalid-image': 422,
  duplicate: 409,
  'version-conflict': 409,
  'product-in-use': 409,
  'variant-in-use': 409,
  'voucher-in-use': 409,
  'self-change': 409,
  'last-admin': 409,
  'not-returnable': 409,
  'return-window-closed': 409,
  'return-exists': 409,
  'not-eligible': 409,
  'already-reviewed': 409,
  'wishlist-full': 409,
};

export interface AppErrorExtras {
  field?: string;
  /** Slice 8: MỌI lỗi theo trường của `PUT /admin/settings/store` (phần tử đầu trùng `field` / message). */
  fieldErrors?: Array<{ field: string; message: string }>;
  retryAfterSeconds?: number;
  /** Slice 3: báo giá mới nhất kèm lỗi 409 (kiểu `Quote` của contract). */
  quote?: unknown;
  stockIssues?: Array<{ variantId: string; available: number }>;
  removedVoucherCodes?: string[];
  existingOrderCode?: string;
  /** Slice 4: trạng thái đơn hiện tại (`invalid-transition`, `order-state-changed`, `condition-not-met`). */
  currentStatus?: string;
  /** Slice 9: trạng thái yêu cầu trả hàng hiện tại (`invalid-transition`). */
  currentReturnState?: string;
  /** Slice 4: `AdminOrder` hiện tại kèm `order-state-changed`. */
  order?: unknown;
  /** Slice 6. */
  missing?: string[];
  productId?: string;
  reason?: string;
  sku?: string;
  available?: number;
  reserved?: number;
  /** Slice 10: bản hiện tại kèm `version-conflict` của nội dung trang chủ / bảng size (kiểu theo contract). */
  current?: unknown;
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
  /** Slice 8: nhiều lỗi theo trường một lần (AC-SET-02). `issues` không rỗng. */
  validationMany: (issues: ReadonlyArray<{ field: string; message: string }>) =>
    new AppError('validation', issues[0].message, {
      field: issues[0].field,
      fieldErrors: issues.map((i) => ({ field: i.field, message: i.message })),
    }),
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
  notFound: (message = 'Không tìm thấy tài nguyên.') => new AppError('not-found', message),
  invalidAddress: (field = 'address.wardCode') =>
    new AppError('invalid-address', 'Địa chỉ giao hàng không hợp lệ. Vui lòng chọn lại tỉnh / thành và phường / xã.', { field }),
  stockChanged: (stockIssues: Array<{ variantId: string; available: number }>, quote?: unknown) =>
    new AppError('stock-changed', 'Một số sản phẩm không còn đủ hàng. Vui lòng kiểm tra lại giỏ hàng.', {
      stockIssues,
      quote,
    }),
  priceChanged: (quote?: unknown) =>
    new AppError(
      'price-changed',
      'Giá một số sản phẩm vừa thay đổi. Vui lòng xem lại tổng thanh toán và bấm Đặt hàng để xác nhận.',
      { quote },
    ),
  voucherChanged: (removedVoucherCodes: string[], quote?: unknown) =>
    new AppError('voucher-changed', 'Mã giảm giá vừa hết hiệu lực. Vui lòng xem lại tổng thanh toán.', {
      removedVoucherCodes,
      quote,
    }),
  idempotencyConflict: () =>
    new AppError('idempotency-conflict', 'Yêu cầu này trùng khoá nhưng khác nội dung. Vui lòng tải lại trang và thử lại.'),
  possibleDuplicate: (existingOrderCode: string) =>
    new AppError('possible-duplicate', 'Bạn vừa đặt một đơn giống hệt. Bạn có chắc muốn đặt thêm?', { existingOrderCode }),
  notCancellable: () => new AppError('not-cancellable', 'Đơn hàng này không thể huỷ.'),
  invalidTransition: (currentStatus: string) =>
    new AppError('invalid-transition', 'Thao tác này không hợp lệ với trạng thái hiện tại của đơn.', { currentStatus }),
  orderStateChanged: (order: unknown, currentStatus: string) =>
    new AppError('order-state-changed', 'Đơn vừa được cập nhật bởi người khác.', { order, currentStatus }),
  conditionNotMet: (message: string, currentStatus: string) =>
    new AppError('condition-not-met', message, { currentStatus }),
  invalidPassword: () =>
    new AppError('invalid-password', 'Mật khẩu hiện tại chưa đúng.', { field: 'currentPassword' }),
  unavailable: () => new AppError('unavailable', 'Không thể kết nối. Vui lòng thử lại.'),
  /** Slice 6 (admin kho & sản phẩm). */
  publishIncomplete: (missing: string[], productId?: string) =>
    new AppError('publish-incomplete', 'Sản phẩm chưa đủ điều kiện hiển thị: thiếu ảnh, biến thể hoặc thông tin bắt buộc.', {
      missing,
      productId,
    }),
  invalidImage: (reason: 'format' | 'size' | 'dimensions') =>
    new AppError(
      'invalid-image',
      reason === 'size'
        ? 'Ảnh quá lớn (tối đa 5 MB).'
        : reason === 'dimensions'
          ? 'Kích thước ảnh chưa phù hợp (cạnh ngắn tối thiểu 600 px, cạnh dài tối đa 6.000 px).'
          : 'Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.',
      { reason },
    ),
  duplicate: (field: string, message = 'Giá trị này đã được dùng.') => new AppError('duplicate', message, { field }),
  versionConflict: () =>
    new AppError(
      'version-conflict',
      'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới; thay đổi của bạn chưa được lưu.',
    ),
  productInUse: () =>
    new AppError('product-in-use', 'Sản phẩm đã từng hiển thị hoặc đã có đơn; hãy Ẩn thay vì xoá.'),
  variantInUse: (sku: string) =>
    new AppError('variant-in-use', 'Biến thể đã có đơn nên không bỏ được. Đặt tồn về 0 để ngừng bán.', { sku }),
  voucherInUse: (message = 'Mã đã có lượt dùng nên không xoá hoặc đổi loại / giá trị được.') =>
    new AppError('voucher-in-use', message),
  /** Slice 7 (admin khách hàng & nhân viên). */
  selfChange: () => new AppError('self-change', 'Bạn không thể tự khoá hoặc tự đổi vai trò của chính mình.'),
  lastAdmin: () => new AppError('last-admin', 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.'),
  stockChangedAdmin: (available: number, reserved: number) =>
    new AppError('stock-changed', 'Số lượng vừa thay đổi. Kiểm tra lại số hiện tại rồi thử lại.', { available, reserved }),
  /** Slice 9 (trả hàng). */
  notReturnable: () => new AppError('not-returnable', 'Đơn hàng này hiện chưa thể trả hàng.'),
  returnWindowClosed: () => new AppError('return-window-closed', 'Đơn hàng đã quá thời hạn trả hàng.'),
  returnExists: () => new AppError('return-exists', 'Đơn hàng này đã có yêu cầu trả hàng.'),
  invalidReturnTransition: (currentReturnState: string) =>
    new AppError('invalid-transition', 'Thao tác này không hợp lệ với trạng thái hiện tại của yêu cầu trả hàng.', { currentReturnState }),
  /** Slice 10 (gói P1). */
  notEligible: () => new AppError('not-eligible', 'Chỉ người đã nhận hàng mới đánh giá được sản phẩm này.'),
  alreadyReviewed: () => new AppError('already-reviewed', 'Bạn đã đánh giá sản phẩm này rồi.'),
  wishlistFull: (max: number) => new AppError('wishlist-full', `Danh sách yêu thích đã đủ ${max} sản phẩm.`),
  versionConflictWith: (current: unknown) =>
    new AppError(
      'version-conflict',
      'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới; thay đổi của bạn chưa được lưu.',
      { current },
    ),
};
