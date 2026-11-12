/** Small formatting helpers shared by the Slice 8 screens (Tổng quan, Báo cáo, Nhật ký). */
import { percent } from '../../core/format';

const TZ = 'Asia/Ho_Chi_Minh';

/** 14:05 in Vietnam time, from an ISO instant. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  });
}

/** "Thứ Tư" for an ISO instant in Vietnam time. */
export function weekdayName(iso: string): string {
  const name = new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', timeZone: TZ });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Today in Vietnam time as `YYYY-MM-DD`. */
export function todayVn(now: Date | number = Date.now()): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Shifts a `YYYY-MM-DD` day by whole days (calendar arithmetic, no time zone involved). */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** Days between two `YYYY-MM-DD` values, both ends included (`from` = `to` is 1). */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** True when the text is a real calendar day written `YYYY-MM-DD`. */
export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 12/11 from `2026-11-12`. */
export function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** 12/11/2026 from `2026-11-12`. */
export function longDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

export interface Delta {
  text: string;
  dir: 'up' | 'down' | '';
}

/**
 * "▲ 10,0% so với 7 ngày trước"; "—" when there is nothing to compare with (BR-DSH-08). `change` is
 * a ratio (0.1 = +10%) or null.
 */
export function deltaText(change: number | null | undefined, against: string): Delta {
  if (change === null || change === undefined || !Number.isFinite(change))
    return { text: `— ${against}`, dir: '' };
  const arrow = change > 0 ? '▲ ' : change < 0 ? '▼ ' : '';
  return {
    text: `${arrow}${percent(Math.abs(change))} ${against}`,
    dir: change > 0 ? 'up' : change < 0 ? 'down' : '',
  };
}

/** Ratio between a value and its previous period; null when the previous is missing or 0. */
export function ratioChange(value: number, previous: number | null): number | null {
  return previous === null || previous === 0 ? null : (value - previous) / previous;
}

/** Axis ticks of a revenue chart: 1,2tr, 450k. */
export function shortMoney(value: number): string {
  const format = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  return value >= 1_000_000
    ? `${format(Math.round(value / 100_000) / 10)}tr`
    : value >= 1000
      ? `${format(Math.round(value / 1000))}k`
      : format(value);
}

export interface RangeErrors {
  from?: string;
  to?: string;
}

/**
 * Same day-range rules as the server (BR-RPT-01, BR-AUD-03), checked before any request: real
 * dates, `to` not after today, `from` not after `to`, at most `maxDays` days.
 */
export function validateDayRange(
  from: string,
  to: string,
  today: string,
  maxDays: number,
): RangeErrors {
  const errors: RangeErrors = {};
  if (!isRealDay(from)) errors.from = 'Chọn ngày bắt đầu hợp lệ.';
  if (!isRealDay(to)) errors.to = 'Chọn ngày kết thúc hợp lệ.';
  if (errors.from || errors.to) return errors;
  if (to > today) errors.to = 'Ngày kết thúc không được sau hôm nay.';
  else if (from > to) errors.from = 'Ngày bắt đầu không được sau ngày kết thúc.';
  else if (daysInclusive(from, to) > maxDays)
    errors.to = `Khoảng tối đa ${maxDays} ngày. Chọn lại ngày bắt đầu hoặc ngày kết thúc.`;
  return errors;
}
