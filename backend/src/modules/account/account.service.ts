import type { Prisma, User } from '@prisma/client';
import prisma from '../../config/prisma';
import { ACCOUNT_ASSUMPTIONS } from '../../config/assumptions';
import { getConfig } from '../../config/env';
import { now } from '../../lib/clock';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { AppError, Errors } from '../../lib/errors';
import { isoDate, vnShift } from '../../lib/vn-time';
import { sendMailInBackground } from '../../mail/mailer';
import { passwordChangedMail } from '../../mail/templates';
import { clearKeys, getLockSeconds, keys, recordFailure } from '../auth/rate-limit.service';
import { PASSWORD_MSG, PasswordInput, ProfilePatch } from './account.schemas';

/** Hồ sơ, mật khẩu, hạng thành viên (PRD Slice 5 BR-ACC-03..08, 15). */

export interface AccountProfileDto {
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  hasPassword: boolean;
}

export const toProfileDto = (u: User): AccountProfileDto => ({
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  birthDate: u.dateOfBirth ? isoDate(u.dateOfBirth) : null,
  phone: u.phone_number ?? null,
  hasPassword: !!u.passwordHash,
});

async function loadUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user || !user.isActive) throw Errors.unauthenticated();
  return user;
}

export async function getProfile(userId: string): Promise<AccountProfileDto> {
  return toProfileDto(await loadUser(userId));
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<AccountProfileDto> {
  await loadUser(userId);
  const data: Prisma.UserUpdateInput = {};
  if ('birthDate' in patch) data.dateOfBirth = patch.birthDate ? new Date(`${patch.birthDate}T00:00:00.000Z`) : null;
  if ('phone' in patch) data.phone_number = patch.phone ?? null;
  const user = await prisma.user.update({ where: { user_id: userId }, data });
  return toProfileDto(user);
}

const changeLocked = (sec: number) =>
  new AppError(
    'password-locked',
    `Bạn đã nhập sai mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau ${Math.max(1, Math.ceil(sec / 60))} phút.`,
    { retryAfterSeconds: sec, field: 'currentPassword' },
  );

/**
 * BR-ACC-05..08. Tạo (chưa có mật khẩu) hoặc đổi (kiểm mật khẩu hiện tại, khoá 5 lần sai / 15 phút).
 * Thành công: mọi phiên khác của tài khoản bị thu hồi, phiên hiện tại giữ; thư báo gửi nền.
 */
export async function setPassword(userId: string, currentSessionId: string, input: PasswordInput): Promise<void> {
  const user = await loadUser(userId);
  const lockKey = keys.pwChangeFail(userId);
  if (input.newPassword.toLowerCase() === user.email.toLowerCase()) {
    throw Errors.validation(PASSWORD_MSG.newPassword, 'newPassword');
  }
  if (user.passwordHash) {
    if (input.currentPassword === null) throw Errors.validation(PASSWORD_MSG.currentPassword, 'currentPassword');
    const locked = await getLockSeconds(lockKey);
    if (locked > 0) throw changeLocked(locked);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      const r = await recordFailure(lockKey, {
        max: ACCOUNT_ASSUMPTIONS.passwordChangeMaxFails,
        gapMs: ACCOUNT_ASSUMPTIONS.passwordChangeGapMs,
        lockMs: ACCOUNT_ASSUMPTIONS.passwordChangeLockMs,
      });
      if (r.lockedUntil && r.count > ACCOUNT_ASSUMPTIONS.passwordChangeMaxFails) {
        throw changeLocked(Math.max(1, Math.ceil((r.lockedUntil.getTime() - now().getTime()) / 1000)));
      }
      throw Errors.invalidPassword();
    }
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw Errors.validation(PASSWORD_MSG.samePassword, 'newPassword');
    }
  }
  const passwordHash = await hashPassword(input.newPassword);
  const t = now();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { user_id: userId }, data: { passwordHash, updatedAt: t } });
    await tx.session.updateMany({
      where: { userId, revoked_at: null, NOT: { session_id: currentSessionId } },
      data: { revoked_at: t, revoke_reason: 'password-changed' },
    });
  });
  await clearKeys([lockKey, keys.pwFail(user.email)]);
  sendMailInBackground(passwordChangedMail(user.email, getConfig().supportEmail));
}

export interface MembershipDto {
  tier: 'bronze' | 'silver' | 'gold';
  spent: number;
  nextTierAt: number | null;
  reviewDate: string;
}

/** BR-ACC-15: tổng `total` đơn `completed` của thành viên, giao (hoặc đặt) trong năm dương lịch VN hiện tại. */
export async function getMembership(userId: string): Promise<MembershipDto> {
  await loadUser(userId);
  const year = vnShift(now()).getUTCFullYear();
  // Mốc năm theo giờ VN: 00:00 01/01 VN = 17:00 31/12 UTC năm trước.
  const from = new Date(Date.UTC(year, 0, 1) - 7 * 3600_000);
  const to = new Date(Date.UTC(year + 1, 0, 1) - 7 * 3600_000);
  const rows = await prisma.$queryRaw<Array<{ spent: bigint | number | null }>>`
    SELECT COALESCE(SUM("total"), 0)::bigint AS spent FROM "orders"
    WHERE "user_id" = ${userId}::uuid AND "status" = 'completed'
      AND COALESCE("delivered_at", "created_at") >= ${from} AND COALESCE("delivered_at", "created_at") < ${to}`;
  const spent = Number(rows[0]?.spent ?? 0);
  const tiers = ACCOUNT_ASSUMPTIONS.tiers;
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (spent >= tiers[i].minSpent) idx = i;
  return {
    tier: tiers[idx].tier,
    spent,
    nextTierAt: idx + 1 < tiers.length ? tiers[idx + 1].minSpent : null,
    reviewDate: `${year}-12-31`,
  };
}
