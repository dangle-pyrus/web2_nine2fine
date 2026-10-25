/** Data formats of the admin (guideline 7.3, Phụ lục A.4). Times are shown in GMT+7. */
const TZ = 'Asia/Ho_Chi_Minh';

const moneyFormat = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const numberFormat = new Intl.NumberFormat('vi-VN');
const percentFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TZ,
});
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
});

/** 1.250.000 ₫ */
export function money(value: number | null | undefined): string {
  return value == null ? '—' : moneyFormat.format(value);
}

/** 12.480 */
export function num(value: number | null | undefined): string {
  return value == null ? '—' : numberFormat.format(value);
}

/** 12,5% (value is a ratio: 0.125). */
export function percent(ratio: number | null | undefined): string {
  return ratio == null || !Number.isFinite(ratio) ? '—' : `${percentFormat.format(ratio * 100)}%`;
}

/** 25/10/2026 */
export function date(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}

/** 25/10/2026 15:44 */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = new Date(iso);
  return `${dateFormat.format(value)} ${timeFormat.format(value)}`;
}

/** "5 phút trước" within the last 24 hours, otherwise the full date and time. */
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 0 || minutes >= 24 * 60) return dateTime(iso);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  return `${Math.floor(minutes / 60)} giờ trước`;
}

/** 0912 345 678 */
export function phone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

/** 0912 *** 678 for roles that may not see full contact details (guideline 6.9). */
export function maskPhone(value: string | null | undefined): string {
  const formatted = phone(value);
  const parts = formatted.split(' ');
  return parts.length === 3 ? `${parts[0]} *** ${parts[2]}` : formatted;
}

/** an***@gmail.com */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return '—';
  const [user, domain] = value.split('@');
  if (!domain) return value;
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Strips the dots a user types in a money field: "1.250.000" → 1250000. */
export function parseMoney(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** ISO date (YYYY-MM-DD) in GMT+7. */
export function isoDay(value: Date | number | string): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** URL slug: accent-free lower case words joined by dashes. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
