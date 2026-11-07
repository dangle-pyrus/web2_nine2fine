import { Prisma } from '@prisma/client';
import type { Db } from '../../lib/sql';
import { addCalendarDays, addWorkingDays, isWorkingDay, vnDateISO, vnHour } from '../../lib/vn-time';
import type { Settings } from '../store/settings.service';

export interface DeliveryWindow {
  from: string;
  to: string;
}

/**
 * Ngày giao dự kiến (BR-CHK-11): đơn vào `to_ship` trước giờ cắt (16:00 VN) và hôm nay là ngày làm việc -> đếm từ hôm nay
 * (ngày 0); ngược lại từ ngày làm việc kế tiếp. from = start + min ngày làm việc, to = start + max ngày làm việc.
 */
export function estimateDelivery(
  at: Date,
  settings: Pick<Settings, 'cutoffHour' | 'deliveryDaysMin' | 'deliveryDaysMax'>,
  holidays: ReadonlySet<string>,
): DeliveryWindow {
  const today = vnDateISO(at);
  const start =
    vnHour(at) < settings.cutoffHour && isWorkingDay(today, holidays) ? today : addWorkingDays(today, 1, holidays);
  return {
    from: addWorkingDays(start, settings.deliveryDaysMin, holidays),
    to: addWorkingDays(start, settings.deliveryDaysMax, holidays),
  };
}

/** Tập ngày nghỉ trong 60 ngày tới (đủ cho mọi phép đếm 2-4 ngày làm việc). */
export async function loadHolidays(db: Db, at: Date): Promise<Set<string>> {
  const today = vnDateISO(at);
  const rows = await db.$queryRaw<Array<{ d: string }>>(
    Prisma.sql`SELECT to_char("holiday_date", 'YYYY-MM-DD') AS d FROM "holidays"
               WHERE "holiday_date" >= ${today}::date AND "holiday_date" <= ${addCalendarDays(today, 60)}::date`,
  );
  return new Set(rows.map((r) => r.d));
}

export async function estimateDeliveryFromDb(db: Db, at: Date, settings: Settings): Promise<DeliveryWindow> {
  return estimateDelivery(at, settings, await loadHolidays(db, at));
}
