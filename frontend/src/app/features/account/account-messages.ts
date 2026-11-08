import { AccountError, AccountErrorCode } from './data-access/account-api';

const MESSAGES: Record<AccountErrorCode, string> = {
  unauthorized: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
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

export function accountErrorMessage(error: unknown): string {
  return MESSAGES[error instanceof AccountError ? error.code : 'unavailable'];
}
