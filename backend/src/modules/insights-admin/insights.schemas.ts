import { INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { addCalendarDays, daysBetween, isRealDate, vnDateISO } from '../../lib/vn-time';
import { DASHBOARD_RANGES, DashboardRange } from './periods';

/**
 * Tham số truy vấn Slice 8. Mọi lỗi là `422 validation` kèm `field` (một lỗi đầu tiên, plan mục 7):
 * thứ tự `from`, `to`, khoảng, `sort`.
 */

type Raw = Record<string, unknown>;

/** Chuỗi một giá trị; vắng hoặc rỗng = undefined; mảng / object -> không hợp lệ (NaN-safe). */
function one(q: Raw, key: string): string | undefined | null {
  const v = q[key];
  if (v === undefined || v === '') return undefined;
  return typeof v === 'string' ? v : null;
}

export function parseRange(q: Raw): DashboardRange {
  const v = one(q, 'range');
  if (v === undefined) return 'today';
  if (v === null || !(DASHBOARD_RANGES as readonly string[]).includes(v)) {
    throw Errors.validation('Khoảng thời gian chỉ nhận today, 7d hoặc 30d.', 'range');
  }
  return v as DashboardRange;
}

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

/** `from` / `to` ngày VN gồm hai đầu; mặc định `to` = hôm nay, `from` = `to` - 29. */
export function parseDateRange(q: Raw, opts: { maxDays: number; allowFuture: boolean }, now: Date): DateRange {
  const today = vnDateISO(now);
  const fromRaw = one(q, 'from');
  const toRaw = one(q, 'to');
  if (fromRaw === null || (fromRaw !== undefined && !isRealDate(fromRaw))) {
    throw Errors.validation('Ngày bắt đầu không hợp lệ (định dạng YYYY-MM-DD).', 'from');
  }
  if (toRaw === null || (toRaw !== undefined && !isRealDate(toRaw))) {
    throw Errors.validation('Ngày kết thúc không hợp lệ (định dạng YYYY-MM-DD).', 'to');
  }
  const to = toRaw ?? today;
  const from = fromRaw ?? addCalendarDays(to, -INSIGHTS_ASSUMPTIONS.defaultSpanDays);
  if (from > to) throw Errors.validation('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'from');
  if (!opts.allowFuture && to > today) throw Errors.validation('Ngày kết thúc không được sau hôm nay.', 'to');
  const days = daysBetween(from, to) + 1;
  if (days > opts.maxDays) throw Errors.validation(`Khoảng tối đa ${opts.maxDays} ngày.`, 'to');
  return { from, to, days };
}

export type ReportSort = 'units' | 'revenue';
export function parseSort(q: Raw): ReportSort {
  const v = one(q, 'sort');
  if (v === undefined) return 'units';
  if (v === null || (v !== 'units' && v !== 'revenue')) throw Errors.validation('Cách sắp xếp chỉ nhận units hoặc revenue.', 'sort');
  return v;
}

export const parseReportQuery = (q: Raw, now: Date) => ({
  ...parseDateRange(q, { maxDays: INSIGHTS_ASSUMPTIONS.reportMaxDays, allowFuture: false }, now),
  sort: parseSort(q),
});

/** CSV: cùng quy tắc, không có `sort` (xếp theo `units`; `sort` lạ bị bỏ qua như tham số lạ khác). */
export const parseExportQuery = (q: Raw, now: Date) => ({
  ...parseDateRange(q, { maxDays: INSIGHTS_ASSUMPTIONS.reportMaxDays, allowFuture: false }, now),
  sort: 'units' as ReportSort,
});

export const AUDIT_TARGETS = ['order', 'inventory', 'customer', 'staff', 'settings'] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

export interface AuditQuery extends DateRange {
  targetType?: AuditTarget;
  page: number;
  limit: number;
}

function intParam(q: Raw, key: 'page' | 'limit', min: number, max: number, def: number, msg: string): number {
  const v = one(q, key);
  if (v === undefined) return def;
  if (v === null || !/^[0-9]{1,9}$/.test(v)) throw Errors.validation(msg, key);
  const n = Number(v);
  if (n < min || n > max) throw Errors.validation(msg, key);
  return n;
}

export function parseAuditQuery(q: Raw, now: Date): AuditQuery {
  const range = parseDateRange(q, { maxDays: INSIGHTS_ASSUMPTIONS.auditMaxDays, allowFuture: true }, now);
  const t = one(q, 'targetType');
  if (t === null || (t !== undefined && !(AUDIT_TARGETS as readonly string[]).includes(t))) {
    throw Errors.validation('Loại đối tượng không hợp lệ.', 'targetType');
  }
  const { default: defLimit, max: maxLimit } = INSIGHTS_ASSUMPTIONS.auditLimit;
  return {
    ...range,
    targetType: t as AuditTarget | undefined,
    page: intParam(q, 'page', 1, 1_000_000, 1, 'Trang không hợp lệ.'),
    limit: intParam(q, 'limit', 1, maxLimit, defLimit, `Số dòng mỗi trang phải từ 1 đến ${maxLimit}.`),
  };
}
