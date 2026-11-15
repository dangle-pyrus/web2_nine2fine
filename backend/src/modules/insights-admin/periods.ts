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
 *   - `7d`: 7 ngày VN gần nhất gồm hôm nay so với NGUYÊN tuần lịch liền trước tuần hiện tại (Thứ Hai đến Chủ nhật).
 *   - `30d`: 30 ngày VN gần nhất gồm hôm nay so với NGUYÊN tháng lịch trước (ngày 1 đến ngày cuối tháng).
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
  if (input === '7d') {
    const isoDow = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // Thứ Hai = 1 .. Chủ nhật = 7
    const monday = addCalendarDays(today, -(isoDow - 1));
    return {
      cur: { from: vnStartOfDay(addCalendarDays(today, -6)), to: tomorrow },
      prev: { from: vnStartOfDay(addCalendarDays(monday, -7)), to: vnStartOfDay(monday) },
    };
  }
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const firstOfPrev = `${addCalendarDays(firstOfMonth, -1).slice(0, 8)}01`;
  return {
    cur: { from: vnStartOfDay(addCalendarDays(today, -29)), to: tomorrow },
    prev: { from: vnStartOfDay(firstOfPrev), to: vnStartOfDay(firstOfMonth) },
  };
}
