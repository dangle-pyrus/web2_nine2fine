import { defaultMessage } from './http-support';
import { AdminApiError } from './models';

/** What each rejected field says on screen: the ranges of docs/api/openapi.yaml (BR-SET-02..06). */
const FIELD_MESSAGES: Record<string, string> = {
  range: 'Khoảng thời gian chỉ có thể là Hôm nay, 7 ngày hoặc 30 ngày.',
  from: 'Ngày bắt đầu không hợp lệ.',
  to: 'Ngày kết thúc không hợp lệ.',
  sort: 'Kiểu sắp xếp không hợp lệ.',
  targetType: 'Loại đối tượng không hợp lệ.',
  page: 'Trang không hợp lệ.',
  limit: 'Số dòng mỗi trang cần từ 1 đến 50.',
  updatedAt: 'Phiên bản cài đặt không hợp lệ. Tải lại trang rồi thử lại.',
  'info.legalName': 'Tên pháp lý cần từ 2 đến 120 ký tự.',
  'info.registrationNumber': 'Mã số thuế / số ĐKKD gồm 10 hoặc 13 chữ số.',
  'info.registrationIssuer': 'Nơi cấp tối đa 100 ký tự.',
  'info.registrationDate': 'Ngày cấp phải là ngày có thật và không sau hôm nay.',
  'info.address': 'Địa chỉ cần từ 10 đến 200 ký tự.',
  'info.hotline':
    'Hotline cần 8 đến 11 chữ số, bắt đầu bằng 0, 1800 hoặc 1900 (được dùng dấu cách, chấm, gạch ngang).',
  'info.email': 'Email chăm sóc khách hàng chưa đúng định dạng (tối đa 254 ký tự).',
  'info.privacyEmail': 'Email dữ liệu cá nhân chưa đúng định dạng (tối đa 254 ký tự).',
  'info.hours': 'Giờ làm việc tối đa 100 ký tự.',
  'info.notificationUrl': 'Liên kết thông báo phải bắt đầu bằng https:// (tối đa 300 ký tự).',
  'info.social.facebook': 'Liên kết Facebook phải bắt đầu bằng https:// (tối đa 300 ký tự).',
  'info.social.instagram': 'Liên kết Instagram phải bắt đầu bằng https:// (tối đa 300 ký tự).',
  'info.social.tiktok': 'Liên kết TikTok phải bắt đầu bằng https:// (tối đa 300 ký tự).',
  'info.social.youtube': 'Liên kết YouTube phải bắt đầu bằng https:// (tối đa 300 ký tự).',
  'operations.shippingFee': 'Phí vận chuyển từ 0 đến 500.000 ₫, là bội số của 1.000.',
  'operations.freeShippingThreshold':
    'Ngưỡng miễn phí vận chuyển từ 0 đến 50.000.000 ₫, là bội số của 1.000.',
  'operations.bankHoldMinutes': 'Thời gian giữ chuyển khoản từ 10 đến 1.440 phút.',
  'operations.codMaxTotal': 'Trần đơn COD từ 100.000 đến 50.000.000 ₫.',
  'operations.deliveryDaysMin': 'Số ngày giao tối thiểu từ 1 đến 30, không lớn hơn số ngày tối đa.',
  'operations.deliveryDaysMax': 'Số ngày giao tối đa từ 1 đến 30, không nhỏ hơn số ngày tối thiểu.',
  'operations.cutoffHour': 'Giờ chốt đơn từ 0 đến 23.',
  'cart.maxPerVariant': 'Số lượng tối đa mỗi biến thể từ 1 đến 20.',
  'cart.maxItemsPerOrder': 'Số sản phẩm tối đa mỗi đơn từ 1 đến 100.',
  'cart.maxCartLines': 'Số dòng tối đa trong giỏ từ 1 đến 100.',
  'cart.cartRetentionDays': 'Số ngày giữ giỏ từ 1 đến 180.',
  'cart.codRefusalLimit': 'Số lần từ chối nhận hàng COD từ 1 đến 10.',
  'cart.codRefusalMonths': 'Số tháng tính từ chối COD từ 1 đến 24.',
  'cart.codOpenOrderLimit': 'Số đơn COD đang mở tối đa từ 1 đến 10.',
};

/** The sentence for one rejected field; falls back to the server's own text, then a generic one. */
export function insightsFieldMessage(field: string, serverText?: string): string {
  return FIELD_MESSAGES[field] ?? (serverText || defaultMessage('validation'));
}

/** Field → sentence for every error of a `422` (all of `PUT /admin/settings/store`, one else). */
export function insightsFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AdminApiError) || error.code !== 'validation') return {};
  const result: Record<string, string> = {};
  for (const [field, text] of Object.entries(error.fields))
    result[field] = insightsFieldMessage(field, text);
  return result;
}

/**
 * One sentence per `error.code` of Slice 8 (BR-INS-07, AC-INS-10). A dropped connection and an
 * unknown failure read as "Không kết nối được máy chủ".
 */
export function insightsErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) return defaultMessage('unavailable');
  switch (error.code) {
    case 'forbidden':
      return 'Bạn không có quyền xem hoặc sửa mục này. Liên hệ quản trị viên nếu cần.';
    case 'unauthenticated':
      return defaultMessage('unauthenticated');
    case 'rate-limited':
      return error.retryAfterSeconds
        ? `Bạn thao tác quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
        : defaultMessage('rate-limited');
    case 'version-conflict':
      return 'Cài đặt vừa được người khác thay đổi. Bản mới nhất đã được tải về; thay đổi của bạn chưa được lưu và vẫn còn trên màn hình để đối chiếu.';
    case 'validation': {
      const field = error.detail.field;
      return field ? insightsFieldMessage(field) : defaultMessage('validation');
    }
    default:
      return defaultMessage('unavailable');
  }
}
