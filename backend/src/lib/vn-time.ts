/** Giờ Việt Nam (UTC+7, không DST) tính bằng cách cộng 7 giờ (plan mục 4, R3). */
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Date "dịch" +7h: đọc bằng getUTC* để lấy giờ / ngày Việt Nam. */
export const vnShift = (d: Date): Date => new Date(d.getTime() + VN_OFFSET_MS);

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const isoDate = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Ngày hiện tại theo giờ VN, `YYYY-MM-DD`. */
export const vnDateISO = (d: Date): string => isoDate(vnShift(d));
export const vnHour = (d: Date): number => vnShift(d).getUTCHours();

/** `YYMMDD` theo ngày VN (mã đơn). */
export const vnYYMMDD = (d: Date): string => {
  const v = vnShift(d);
  return `${pad(v.getUTCFullYear() % 100)}${pad(v.getUTCMonth() + 1)}${pad(v.getUTCDate())}`;
};

const parseISO = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const addDays = (s: string, n: number): string => isoDate(new Date(parseISO(s).getTime() + n * 86_400_000));

/** Ngày làm việc: không phải Chủ nhật, không nằm trong tập ngày nghỉ. */
export const isWorkingDay = (iso: string, holidays: ReadonlySet<string>): boolean =>
  parseISO(iso).getUTCDay() !== 0 && !holidays.has(iso);

/** Cộng `n` ngày làm việc (n >= 0); `start` là ngày 0 và không cần là ngày làm việc. */
export function addWorkingDays(startIso: string, n: number, holidays: ReadonlySet<string>): string {
  let cur = startIso;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur, holidays)) left--;
  }
  return cur;
}

export { addDays as addCalendarDays };

/** Đầu ngày VN `YYYY-MM-DD` (00:00 GMT+7) thành thời điểm UTC. */
export const vnStartOfDay = (iso: string): Date => new Date(parseISO(iso).getTime() - VN_OFFSET_MS);
/** Khoảng [from 00:00, to + 1 ngày 00:00) theo giờ VN, bao gồm cả hai đầu ngày; thiếu đầu nào thì để trống. */
export function vnDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  return {
    ...(from ? { gte: vnStartOfDay(from) } : {}),
    ...(to ? { lt: vnStartOfDay(addDays(to, 1)) } : {}),
  };
}
