import { vnShift } from './vn-time';

export interface WorkHours {
  fromHour: number;
  toHour: number;
  /** Thứ theo `Date#getUTCDay` của giờ VN: 0 = Chủ nhật. */
  days: readonly number[];
}

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;

/**
 * Cộng `hours` GIỜ LÀM VIỆC vào `start` (BR-ADM-40, S4-Q3). Chỉ đếm trong [fromHour, toHour) của các thứ trong `days` theo giờ VN.
 * Đặt ngoài giờ thì đồng hồ bắt đầu chạy lúc mở cửa kế tiếp. Không có lịch nghỉ lễ (PRD chỉ nêu T2-T7).
 * Kết quả đúng 18:00 giữ nguyên 18:00 (không đẩy sang hôm sau).
 */
export function addWorkingHours(start: Date, hours: number, cfg: WorkHours): Date {
  let cur = vnShift(start).getTime(); // ms "giờ VN" đọc bằng getUTC*
  let left = hours * HOUR_MS;
  const dayStart = (ms: number) => ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);
  for (let guard = 0; guard < 10_000; guard++) {
    const d0 = dayStart(cur);
    const open = d0 + cfg.fromHour * HOUR_MS;
    const close = d0 + cfg.toHour * HOUR_MS;
    const working = cfg.days.includes(new Date(cur).getUTCDay());
    if (!working || cur >= close) {
      cur = d0 + DAY_MS + cfg.fromHour * HOUR_MS; // mở cửa ngày kế (vòng sau kiểm tiếp ngày có làm việc không)
      continue;
    }
    if (cur < open) cur = open;
    if (left <= 0) break;
    const take = Math.min(close - cur, left);
    cur += take;
    left -= take;
    if (left <= 0) break;
  }
  return new Date(cur - VN_OFFSET_MS);
}
