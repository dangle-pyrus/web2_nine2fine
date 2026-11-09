import { AccountError, AccountErrorCode } from './data-access/account-api';

const MESSAGES: Record<AccountErrorCode, string> = {
  unauthorized: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  validation: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  underage: 'Bạn cần đủ 13 tuổi.',
  'password-locked': 'Bạn đã nhập sai mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau.',
  'rate-limited': 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  'not-found': 'Không tìm thấy thông tin yêu cầu.',
  'invalid-password': 'Mật khẩu hiện tại chưa đúng.',
  'not-cancellable':
    'Đơn hàng này không huỷ được trực tuyến nữa (đã bàn giao vận chuyển, đã có yêu cầu huỷ hoặc đã huỷ). Vui lòng gọi hotline để được hỗ trợ.',
  'not-returnable': 'Đơn hàng này không còn trong thời hạn hoặc điều kiện trả hàng.',
  'invalid-address': 'Địa chỉ chưa hợp lệ. Vui lòng kiểm tra Tỉnh/Thành phố và Phường/Xã.',
  'file-too-large': 'Ảnh lớn hơn 5 MB.',
  'unsupported-type': 'Chỉ nhận tệp ảnh.',
  unavailable: 'Không thể kết nối. Vui lòng thử lại.',
};

/** Codes whose server sentence is more precise than ours (which field, how long to wait). */
const SERVER_WORDED: ReadonlySet<AccountErrorCode> = new Set([
  'validation',
  'underage',
  'password-locked',
  'rate-limited',
]);

export function accountErrorMessage(error: unknown): string {
  if (!(error instanceof AccountError)) return MESSAGES.unavailable;
  if (SERVER_WORDED.has(error.code) && error.detail) return error.detail;
  return MESSAGES[error.code];
}
