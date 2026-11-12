import type { StoreConfig } from '../store/settings.service';
import type { StoreSettingsInput } from './settings.schemas';

/** Nhãn tiếng Việt của từng trường cài đặt (BR-SET-09). Thứ tự = thứ tự hiển thị trong nhật ký. */
export const SETTING_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['info.legalName', 'Tên pháp nhân'],
  ['info.registrationNumber', 'Mã số thuế / số ĐKKD'],
  ['info.registrationIssuer', 'Nơi cấp'],
  ['info.registrationDate', 'Ngày cấp'],
  ['info.address', 'Địa chỉ'],
  ['info.hotline', 'Hotline'],
  ['info.email', 'Email chăm sóc khách hàng'],
  ['info.privacyEmail', 'Email dữ liệu cá nhân'],
  ['info.hours', 'Giờ làm việc'],
  ['info.notificationUrl', 'Liên kết thông báo Bộ Công Thương'],
  ['info.social.facebook', 'Facebook'],
  ['info.social.instagram', 'Instagram'],
  ['info.social.tiktok', 'TikTok'],
  ['info.social.youtube', 'YouTube'],
  ['operations.shippingFee', 'Phí vận chuyển'],
  ['operations.freeShippingThreshold', 'Ngưỡng miễn phí vận chuyển'],
  ['operations.bankHoldMinutes', 'Thời gian giữ đơn chuyển khoản (phút)'],
  ['operations.codMaxTotal', 'Giá trị COD tối đa'],
  ['operations.deliveryDaysMin', 'Số ngày giao tối thiểu'],
  ['operations.deliveryDaysMax', 'Số ngày giao tối đa'],
  ['operations.cutoffHour', 'Giờ chốt đơn'],
  ['cart.maxPerVariant', 'Số lượng tối đa mỗi biến thể'],
  ['cart.maxItemsPerOrder', 'Số sản phẩm tối đa mỗi đơn'],
  ['cart.maxCartLines', 'Số dòng giỏ tối đa'],
  ['cart.cartRetentionDays', 'Số ngày giữ giỏ'],
  ['cart.codRefusalLimit', 'Số lần từ chối COD tối đa'],
  ['cart.codRefusalMonths', 'Số tháng tính từ chối COD'],
  ['cart.codOpenOrderLimit', 'Số đơn COD đang mở tối đa'],
];

const MAX = 300;
const cut = (s: string): string => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);

/** Bản phẳng `đường dẫn -> chuỗi` (số -> `String`, ngày chưa nhập -> ''). */
export function flatten(c: StoreConfig): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (prefix: string, v: unknown): void => {
    if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}.${k}` : k, x);
    } else out.set(prefix, v === null ? '' : String(v));
  };
  walk('', c);
  return out;
}

/** Trộn thân đã chuẩn hoá vào cấu hình hiện có: `notificationUrl`, `social.*`, `cart` vắng = giữ nguyên. */
export function mergeConfig(current: StoreConfig, b: StoreSettingsInput): StoreConfig {
  const i = b.info;
  return {
    info: {
      legalName: i.legalName,
      registrationNumber: i.registrationNumber,
      registrationIssuer: i.registrationIssuer,
      registrationDate: i.registrationDate,
      address: i.address,
      hotline: i.hotline,
      email: i.email,
      privacyEmail: i.privacyEmail,
      hours: i.hours,
      notificationUrl: i.notificationUrl ?? current.info.notificationUrl,
      social: {
        facebook: i.social?.facebook ?? current.info.social.facebook,
        instagram: i.social?.instagram ?? current.info.social.instagram,
        tiktok: i.social?.tiktok ?? current.info.social.tiktok,
        youtube: i.social?.youtube ?? current.info.social.youtube,
      },
    },
    operations: { ...b.operations },
    cart: b.cart ? { ...b.cart } : { ...current.cart },
  };
}

export interface SettingChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** Các trường đổi giá trị (so sau chuẩn hoá), theo thứ tự `SETTING_LABELS`; `before` / `after` cắt 300 ký tự. */
export function diffConfig(current: StoreConfig, next: StoreConfig): SettingChange[] {
  const a = flatten(current);
  const b = flatten(next);
  const out: SettingChange[] = [];
  for (const [field, label] of SETTING_LABELS) {
    const before = a.get(field) ?? '';
    const after = b.get(field) ?? '';
    if (before !== after) out.push({ field, label, before: cut(before), after: cut(after) });
  }
  return out;
}
