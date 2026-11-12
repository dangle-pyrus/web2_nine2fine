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

const WEEK_MS = 7 * 86_400_000;

/**
 * Kỳ này và kỳ so sánh (D3), nửa mở, UTC.
 * - `today`: [00:00 VN hôm nay, now) so với cùng khoảng giờ 7 ngày trước.
 * - `7d` / `30d`: n ngày VN gồm hôm nay so với n ngày liền trước.
 * - `{from, to}` (báo cáo, ngày VN gồm hai đầu): kỳ trước = cùng số ngày liền trước `from`.
 */
export function periodsOf(input: DashboardRange | { from: string; to: string }, now: Date): Periods {
  if (typeof input === 'object') {
    const n = daysBetween(input.from, input.to) + 1;
    const cur = vnDayBoundsUtc(input.from, input.to);
    return { cur, prev: { from: vnStartOfDay(addCalendarDays(input.from, -n)), to: cur.from } };
  }
  const today = vnDateISO(now);
  if (input === 'today') {
    const from = vnStartOfDay(today);
    return {
      cur: { from, to: now },
      prev: { from: new Date(from.getTime() - WEEK_MS), to: new Date(now.getTime() - WEEK_MS) },
    };
  }
  const n = input === '7d' ? 7 : 30;
  const curFrom = vnStartOfDay(addCalendarDays(today, -(n - 1)));
  return {
    cur: { from: curFrom, to: vnStartOfDay(addCalendarDays(today, 1)) },
    prev: { from: vnStartOfDay(addCalendarDays(today, -(2 * n - 1))), to: curFrom },
  };
}
