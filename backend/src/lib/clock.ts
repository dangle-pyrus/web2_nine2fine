/** Một điểm duy nhất lấy "bây giờ" để test dùng đồng hồ giả (vi.setSystemTime). */
export const now = (): Date => new Date();
export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const secondsUntil = (target: Date, from: Date = now()): number =>
  Math.max(1, Math.ceil((target.getTime() - from.getTime()) / SECOND));
