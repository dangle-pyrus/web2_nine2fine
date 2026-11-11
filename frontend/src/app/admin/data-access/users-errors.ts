import { defaultMessage } from './http-support';
import { AdminApiError } from './models';

/** What each field-level `validation` error says on screen (the server's own text is not shown). */
const FIELD_MESSAGES: Record<string, string> = {
  reason: 'Lý do cần từ 5 đến 250 ký tự.',
  name: 'Họ tên cần từ 2 đến 100 ký tự.',
  email: 'Email chưa đúng định dạng (tối đa 254 ký tự).',
  role: 'Vai trò chỉ có thể là Nhân viên hoặc Quản trị viên.',
  q: 'Từ khoá tối đa 100 ký tự.',
  tier: 'Hạng không hợp lệ.',
  view: 'Chế độ xem không hợp lệ.',
  sort: 'Kiểu sắp xếp không hợp lệ.',
  page: 'Trang không hợp lệ.',
  limit: 'Số dòng mỗi trang không hợp lệ.',
  'Idempotency-Key': 'Yêu cầu thiếu mã chống gửi trùng. Tải lại trang rồi thử lại.',
};

/** Field a `validation` or `duplicate` error points at, if any. */
export function errorField(error: unknown): string | undefined {
  return error instanceof AdminApiError ? error.detail.field : undefined;
}

/**
 * One sentence per `error.code` of Slice 7 (BR-USR-23, AC-USR-10). Never the server's text, never
 * an empty string: a dropped connection and an unknown failure read as "Không kết nối được".
 */
export function usersErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) return defaultMessage('unavailable');
  switch (error.code) {
    case 'self-change':
      return 'Bạn không thể tự khoá hoặc tự đổi vai trò của chính mình. Nhờ một quản trị viên khác làm việc này.';
    case 'last-admin':
      return 'Cửa hàng cần ít nhất một quản trị viên đang hoạt động. Nâng một nhân viên khác lên quản trị viên trước, rồi thử lại.';
    case 'duplicate':
      return 'Email này đã có tài khoản (khách hàng hoặc nhân viên). Dùng email khác.';
    case 'forbidden':
      return 'Tài khoản của bạn không có quyền thực hiện thao tác này.';
    case 'rate-limited':
      return error.retryAfterSeconds
        ? `Bạn thao tác quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
        : defaultMessage('rate-limited');
    case 'idempotency-conflict':
      return 'Yêu cầu này trùng mã với một thao tác khác. Đóng hộp thoại, tải lại trang rồi làm lại.';
    case 'not-found':
      return 'Không tìm thấy tài khoản này. Tải lại trang để xem dữ liệu mới.';
    case 'unauthenticated':
      return defaultMessage('unauthenticated');
    case 'validation':
      return FIELD_MESSAGES[error.detail.field ?? ''] ?? defaultMessage('validation');
    default:
      return defaultMessage('unavailable');
  }
}
