import { ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { getLockSeconds, recordFailure } from '../auth/rate-limit.service';

/** Chống dò mã (BR-VOU-09): 10 mã không tồn tại / 15 phút / IP thì khoá kiểm mã 15 phút. Lưu DB nên sống qua khởi động lại. */
const missKey = (ip: string) => `voucher-miss:ip:${ip}`;

export async function assertVoucherNotLocked(ip: string): Promise<void> {
  const sec = await getLockSeconds(missKey(ip));
  if (sec > 0) throw Errors.rateLimited(Math.min(sec, ASSUMPTIONS.voucherMissWindowMs / 1000));
}

export async function recordVoucherMisses(ip: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await recordFailure(missKey(ip), {
      max: ASSUMPTIONS.voucherMissMax,
      gapMs: ASSUMPTIONS.voucherMissWindowMs,
      lockMs: ASSUMPTIONS.voucherMissWindowMs,
    });
  }
}
