import { addCalendarDays, daysBetween, vnDateISO, vnDayBoundsUtc, vnStartOfDay } from '../../lib/vn-time';

/** Khoảng nửa mở [from, to) tính bằng thời điểm UTC. */
export interface Span {
  from: Date;
  to: Date;
}
export interface Periods {
  cur: Span;
  prev: Span;
}

export type DashboardRange = 'today' | '7d' | '30d';
export const DASHBOARD_RANGES: readonly DashboardRange[] = ['today', '7d', '30d'];

/**
 * Kỳ này và kỳ so sánh, nửa mở, UTC.
 * - `{from, to}` (báo cáo, ngày VN gồm hai đầu): kỳ trước = cùng số ngày liền trước `from`.
 * - Tổng quan (nâng cấp 2026-11-15, docs/api/openapi.yaml, tag admin-dashboard):
 *   - `today`: [00:00 VN hôm nay, now) so với NGUYÊN ngày hôm qua [00:00, 24:00) VN.
 *   - `7d` / `30d` (DASH-03/06, đổi 2026-11-20): N ngày VN gần nhất gồm hôm nay so với N ngày LIỀN TRƯỚC
 *     (cùng độ dài, ngày cuối kỳ trước = ngày trước ngày đầu kỳ này). Trước đây so với tuần lịch / tháng lịch trước.
 */
export function periodsOf(input: DashboardRange | { from: string; to: string }, now: Date): Periods {
  if (typeof input === 'object') {
    const n = daysBetween(input.from, input.to) + 1;
    const cur = vnDayBoundsUtc(input.from, input.to);
    return { cur, prev: { from: vnStartOfDay(addCalendarDays(input.from, -n)), to: cur.from } };
  }
  const today = vnDateISO(now);
  const tomorrow = vnStartOfDay(addCalendarDays(today, 1));
  if (input === 'today') {
    const from = vnStartOfDay(today);
    return { cur: { from, to: now }, prev: { from: vnStartOfDay(addCalendarDays(today, -1)), to: from } };
  }
  const days = input === '7d' ? 7 : 30;
  const firstDay = addCalendarDays(today, -(days - 1));
  return {
    cur: { from: vnStartOfDay(firstDay), to: tomorrow },
    prev: { from: vnStartOfDay(addCalendarDays(firstDay, -days)), to: vnStartOfDay(firstDay) },
  };
}
