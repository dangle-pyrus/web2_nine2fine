import { Prisma, user_role } from '@prisma/client';
import { OTP_POLICY } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { getConfig } from '../../config/env';
import { addMs, HOUR, MINUTE, now, secondsUntil } from '../../lib/clock';
import { generateSessionToken, hashOtp, hashPassword, verifyPassword, verifyPasswordDummy } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { runInBackground, sendMailInBackground } from '../../mail/mailer';
import { accountDisabledMail, alreadyRegisteredMail, codeMail, passwordChangedMail } from '../../mail/templates';
import { parseRealDate } from './auth.schemas';
import { CodePurpose, codeLockSeconds, issueCode, verifyAndConsumeCode } from './otp.service';
import { clearKeys, getLockSeconds, getStates, hitWindow, keys, lockOf, recordFailure, windowOf } from './rate-limit.service';
import { Audience, createSession, CreatedSession, revokeAllUserSessions, SessionUser } from './session.service';

export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: user_role;
}

export const toAuthUser = (u: SessionUser): AuthUserDto => ({
  id: u.user_id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
});

export interface ClientInfo {
  ip: string;
  userAgent?: string;
}

const RESEND_SECONDS = OTP_POLICY.resendSeconds;

export async function lookupEmail(email: string, ip: string): Promise<{ registered: boolean }> {
  const byIp = await hitWindow(keys.lookupIp(ip), 20, 15 * MINUTE);
  if (!byIp.allowed) throw Errors.rateLimited(byIp.retryAfterSeconds);
  const byEmail = await hitWindow(keys.lookupEmail(email), 10, 15 * MINUTE);
  if (!byEmail.allowed) throw Errors.rateLimited(byEmail.retryAfterSeconds);
  const user = await prisma.user.findUnique({ where: { email }, select: { user_id: true } });
  return { registered: user !== null };
}

/** Phản hồi luôn giống nhau dù email có tài khoản hay không (BR-AUTH-03, 09). */
export async function requestCode(
  email: string,
  purpose: CodePurpose,
  ip: string,
  fresh = false,
): Promise<{ resendAfterSeconds: number }> {
  // Đang khoá vì nhập sai mã 5 lần: không gửi mã mới (kể cả khi nhập lại email).
  const lockSec = await codeLockSeconds(email);
  if (lockSec > 0) throw Errors.codeLocked(lockSec);

  // (a) Chờ 60 giây: không tạo mã mới, mã cũ còn hiệu lực, trả số giây còn lại.
  // Ngoại lệ: vừa nhập (lại) email (`fresh`) thì phát mã mới ngay, mã cũ bị vô hiệu, vẫn tính hạn mức (b), (c).
  if (!fresh) {
    const cooldownSec = await getLockSeconds(keys.codeSendCooldown(email, purpose));
    if (cooldownSec > 0) return { resendAfterSeconds: Math.min(cooldownSec, RESEND_SECONDS) };
  }

  // (c) 10 lần / giờ / IP, (b) 5 lần / 30 phút / email / mục đích (OTP_POLICY).
  const byIp = await hitWindow(keys.codeSendIp(ip), OTP_POLICY.sendPerIpMax, OTP_POLICY.sendPerIpWindowMs);
  if (!byIp.allowed) throw Errors.rateLimited(byIp.retryAfterSeconds);
  const byEmail = await hitWindow(keys.codeSendEmail(email, purpose), OTP_POLICY.sendPerEmailMax, OTP_POLICY.sendPerEmailWindowMs);
  if (!byEmail.allowed) throw Errors.rateLimited(byEmail.retryAfterSeconds);

  const t = now();
  await prisma.authRateLimit.upsert({
    where: { key: keys.codeSendCooldown(email, purpose) },
    create: { key: keys.codeSendCooldown(email, purpose), count: 0, windowStart: t, lockedUntil: addMs(t, RESEND_SECONDS * 1000) },
    update: { lockedUntil: addMs(t, RESEND_SECONDS * 1000) },
  });

  // Mọi việc phụ thuộc "email có tài khoản hay không" chạy nền, để thời gian phản hồi không lộ thông tin (BR-AUTH-03).
  // Cooldown đã đặt ở trên nên không có cửa sổ gửi trùng; lỗi phát mã / gửi thư được log (không kèm mã).
  runInBackground('code-dispatch', () => dispatchCode(email, purpose));
  return { resendAfterSeconds: RESEND_SECONDS };
}

async function dispatchCode(email: string, purpose: CodePurpose): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  const supportEmail = getConfig().supportEmail;
  if (purpose === 'register') {
    if (user) sendMailInBackground(alreadyRegisteredMail(email));
    else sendMailInBackground(codeMail(email, purpose, await issueCode(email, purpose, null)));
  } else if (user) {
    if (user.isActive) sendMailInBackground(codeMail(email, purpose, await issueCode(email, purpose, user.user_id)));
    else sendMailInBackground(accountDisabledMail(email, supportEmail));
  }
}

async function startSession(
  user: { user_id: string; email: string; firstName: string; lastName: string; role: user_role },
  method: 'password' | 'otp' | 'register',
  audience: Audience,
  client: ClientInfo,
  tx?: Prisma.TransactionClient,
): Promise<{ user: AuthUserDto; session: CreatedSession }> {
  const session = await createSession({ user, method, audience, ip: client.ip, userAgent: client.userAgent, tx });
  return { user: toAuthUser(user), session };
}

export async function loginWithCode(email: string, code: string, client: ClientInfo) {
  const { userId } = await verifyAndConsumeCode(email, 'login', code, client.ip);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || (userId && user.user_id !== userId)) throw Errors.invalidCode();
  if (!user.isActive) throw Errors.accountDisabled(getConfig().supportEmail);
  await clearKeys([keys.pwFail(email)]);
  return startSession(user, 'otp', 'storefront', client);
}

const PW_MAX_FAILS = 5;
const PW_WINDOW = 15 * MINUTE;
const PW_IP_LIMIT = 20;

/** Dùng chung cho storefront và admin (BR-AUTH-18: cùng bộ đếm khoá). */
export async function loginWithPassword(email: string, password: string, audience: Audience, client: ClientInfo) {
  const states = await getStates([keys.pwFailIp(client.ip), keys.pwFail(email)]);
  const ipState = windowOf(states.get(keys.pwFailIp(client.ip)), PW_WINDOW);
  if (ipState.count >= PW_IP_LIMIT) throw Errors.rateLimited(ipState.retryAfterSeconds);
  const lockSec = lockOf(states.get(keys.pwFail(email)));
  if (lockSec > 0) throw Errors.passwordLocked(lockSec);

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk =
    user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await verifyPasswordDummy(password);
  const roleOk = audience === 'storefront' || (user !== null && user.role !== 'member');

  if (!user || !passwordOk || !roleOk) {
    const failure = await recordFailure(keys.pwFail(email), { max: PW_MAX_FAILS, gapMs: PW_WINDOW, lockMs: PW_WINDOW });
    await hitWindow(keys.pwFailIp(client.ip), PW_IP_LIMIT, PW_WINDOW);
    if (failure.lockedUntil) throw Errors.passwordLocked(secondsUntil(failure.lockedUntil));
    throw Errors.invalidCredentials();
  }
  if (!user.isActive) throw Errors.accountDisabled(getConfig().supportEmail);
  if (states.has(keys.pwFail(email))) await clearKeys([keys.pwFail(email)]);
  return startSession(user, 'password', audience, client);
}

export interface RegisterInput {
  email: string;
  code?: string;
  registrationToken?: string;
  password?: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  marketingOptIn: boolean;
}

/** Vé đăng ký sau khi xác thực OTP: đủ thời gian điền thông tin ở bước 2. */
const REGISTRATION_TICKET_MS = 30 * MINUTE;
const TICKET_PURPOSE = 'register-ticket';

/**
 * Bước 1 của đăng ký 2 bước: kiểm và tiêu mã OTP, trả vé dùng 1 lần cho bước nhập thông tin.
 * Email đã có tài khoản -> invalid-code (không lộ, giống AC-AUTH-38).
 */
export async function verifyRegistration(email: string, code: string, ip: string): Promise<{ registrationToken: string }> {
  await verifyAndConsumeCode(email, 'register', code, ip);
  if (await prisma.user.findUnique({ where: { email }, select: { user_id: true } })) throw Errors.emailRegistered();
  const token = generateSessionToken();
  const t = now();
  await prisma.authActionToken.create({
    data: {
      email,
      user_id: null,
      purpose: 'register',
      tokenHash: hashOtp(email, TICKET_PURPOSE, token),
      expiresAt: addMs(t, REGISTRATION_TICKET_MS),
    },
  });
  return { registrationToken: token };
}

async function consumeRegistrationTicket(email: string, token: string): Promise<void> {
  const t = now();
  const consumed = await prisma.authActionToken.updateMany({
    where: {
      email,
      purpose: 'register',
      tokenHash: hashOtp(email, TICKET_PURPOSE, token),
      used_at: null,
      invalidated_at: null,
      expiresAt: { gt: t },
    },
    data: { used_at: t },
  });
  if (consumed.count !== 1) throw Errors.validation('Phiên đăng ký đã hết hạn. Vui lòng xác thực email lại.', 'registrationToken');
}

export async function register(input: RegisterInput, client: ClientInfo) {
  if (input.registrationToken) await consumeRegistrationTicket(input.email, input.registrationToken);
  else await verifyAndConsumeCode(input.email, 'register', input.code ?? '', client.ip);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const t = now();
  let birth: Date | null = null;
  if (input.birthDate) {
    const [y, m, d] = parseRealDate(input.birthDate)!;
    birth = new Date(Date.UTC(y, m - 1, d));
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: input.email }, select: { user_id: true } })) {
        throw Errors.emailRegistered();
      }
      const user = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: birth,
          passwordHash,
          role: 'member',
          isActive: true,
          marketingOptIn: input.marketingOptIn,
          marketingOptInAt: input.marketingOptIn ? t : null,
          terms_accepted_at: t,
        },
      });
      return startSession(user, 'register', 'storefront', client, tx);
    });
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw Errors.emailRegistered();
    throw err;
  }
}

export async function resetPassword(email: string, code: string, newPassword: string, ip: string): Promise<void> {
  await verifyAndConsumeCode(email, 'reset-password', code, ip);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw Errors.invalidCode();
  const passwordHash = await hashPassword(newPassword);
  const t = now();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { user_id: user.user_id }, data: { passwordHash, updatedAt: t } });
    await tx.authActionToken.updateMany({
      where: { email, purpose: 'reset_password', used_at: null, invalidated_at: null },
      data: { invalidated_at: t },
    });
    await revokeAllUserSessions(user.user_id, 'password-reset', tx);
  });
  await clearKeys([keys.pwFail(email), keys.codeVerify(email, 'reset-password')]);
  sendMailInBackground(passwordChangedMail(email, getConfig().supportEmail));
}

