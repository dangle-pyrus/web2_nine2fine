import prisma from '../../config/prisma';
import { addMs, MINUTE, now, secondsUntil } from '../../lib/clock';
import { generateOtp, hashOtp } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { clearKeys, getLockSeconds, getStates, hitWindow, keys, lockOf, recordFailure, setLock, windowOf } from './rate-limit.service';

export type CodePurpose = 'login' | 'register' | 'reset-password';
type DbPurpose = 'login' | 'register' | 'reset_password';

export const toDbPurpose = (p: CodePurpose): DbPurpose => (p === 'reset-password' ? 'reset_password' : p);

export const OTP_TTL_MS = 10 * MINUTE;
const MAX_WRONG = 5;
const LOCK_MS = 15 * MINUTE;
const VERIFY_IP_FAIL_LIMIT = 30;

/** Tạo mã mới (vô hiệu mã cũ cùng email + mục đích, BR-AUTH-07). Trả mã dạng rõ để gửi thư; DB chỉ lưu HMAC. */
export async function issueCode(email: string, purpose: CodePurpose, userId: string | null): Promise<string> {
  const code = generateOtp();
  const dbPurpose = toDbPurpose(purpose);
  const t = now();
  await prisma.$transaction([
    prisma.authActionToken.updateMany({
      where: { email, purpose: dbPurpose, used_at: null, invalidated_at: null },
      data: { invalidated_at: t },
    }),
    prisma.authActionToken.create({
      data: {
        email,
        user_id: userId,
        purpose: dbPurpose,
        tokenHash: hashOtp(email, dbPurpose, code),
        expiresAt: addMs(t, OTP_TTL_MS),
      },
    }),
  ]);
  return code;
}

/** Số giây đang bị khoá xác thực bằng mã của email (0 nếu không khoá). */
export const codeLockSeconds = (email: string): Promise<number> => getLockSeconds(keys.codeLock(email));

/**
 * Kiểm mã và tiêu mã (dùng 1 lần, nguyên tử). Mọi thất bại -> invalid-code cùng thông điệp.
 * Chỉ tính "sai" khi mã gửi lên không khớp bất kỳ mã nào đã phát cho email + mục đích
 * (mã đúng nhưng hết hạn / đã dùng / đã bị thay không tính, AC-AUTH-12; email không có mã vẫn tính, AC-AUTH-21).
 */
export async function verifyAndConsumeCode(
  email: string,
  purpose: CodePurpose,
  code: string,
  ip: string,
): Promise<{ userId: string | null }> {
  const dbPurpose = toDbPurpose(purpose);
  const t = now();

  const states = await getStates([keys.codeVerifyFailIp(ip), keys.codeLock(email), keys.codeVerify(email, purpose)]);
  const ipFails = windowOf(states.get(keys.codeVerifyFailIp(ip)), 15 * MINUTE, t);
  if (ipFails.count >= VERIFY_IP_FAIL_LIMIT) throw Errors.rateLimited(ipFails.retryAfterSeconds);
  const lockSec = lockOf(states.get(keys.codeLock(email)), t);
  if (lockSec > 0) throw Errors.codeLocked(lockSec);

  const token = await prisma.authActionToken.findFirst({
    where: { email, purpose: dbPurpose, tokenHash: hashOtp(email, dbPurpose, code) },
    orderBy: { createdAt: 'desc' },
  });

  if (token) {
    const valid = token.used_at === null && token.invalidated_at === null && token.expiresAt > t;
    if (!valid) throw Errors.invalidCode();
    const consumed = await prisma.authActionToken.updateMany({
      where: { token_id: token.token_id, used_at: null, invalidated_at: null },
      data: { used_at: t },
    });
    if (consumed.count !== 1) throw Errors.invalidCode(); // thua cuộc đua với yêu cầu đồng thời
    if (states.has(keys.codeVerify(email, purpose))) await clearKeys([keys.codeVerify(email, purpose)]);
    return { userId: token.user_id };
  }

  // Sai thật sự: tăng bộ đếm theo email + mục đích và theo IP.
  const failure = await recordFailure(keys.codeVerify(email, purpose), {
    max: MAX_WRONG,
    gapMs: LOCK_MS,
    lockMs: LOCK_MS,
  });
  await hitWindow(keys.codeVerifyFailIp(ip), VERIFY_IP_FAIL_LIMIT, 15 * MINUTE);
  if (failure.lockedUntil) {
    await setLock(keys.codeLock(email), failure.lockedUntil);
    await prisma.authActionToken.updateMany({
      where: { email, purpose: dbPurpose, used_at: null, invalidated_at: null },
      data: { invalidated_at: t },
    });
    throw Errors.codeLocked(secondsUntil(failure.lockedUntil));
  }
  throw Errors.invalidCode();
}
