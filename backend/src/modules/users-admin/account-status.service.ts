import { Prisma } from '@prisma/client';
import type { user_role } from '@prisma/client';
import prisma from '../../config/prisma';
import { USERS_ASSUMPTIONS } from '../../config/assumptions';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import { staffDisplayName } from '../order/order-event';
import { revokeAllUserSessions } from '../auth/session.service';
import { insertAccountEvent } from './account-event';
import { loadCustomer } from './customer.query';
import { countOtherActiveAdmins, loadStaff } from './staff.query';

/**
 * Lõi đổi trạng thái / vai trò tài khoản (plan mục 5): khoá, mở khoá, đổi vai trò cho khách và nhân viên.
 * Một giao dịch gồm: đổi `is_active` / `role` + thu hồi mọi phiên + đúng 1 dòng nhật ký (BR-USR-16, 24).
 * Mọi thao tác NHÂN VIÊN lấy chung một khoá cố vấn mức giao dịch trước khi đếm admin, nên không bao giờ còn 0 admin hoạt động (BR-USR-23).
 */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

export interface AccountActor {
  id: string;
  sessionId: string;
  role: 'staff' | 'admin';
  name: string;
}

export type AccountOp =
  | { op: 'lock'; reason: string }
  | { op: 'unlock'; reason: string }
  | { op: 'role'; role: 'staff' | 'admin'; reason: string };

export interface ChangeParams {
  actor: AccountActor;
  kind: 'customer' | 'staff';
  targetId: string;
  input: AccountOp;
  key?: string;
  path: string;
}

export interface ChangeResult {
  dto: unknown;
  replayed: boolean;
}

/** Kiểm lại người gọi TRONG giao dịch: phiên còn hiệu lực + còn hoạt động -> 401; không còn là admin -> 403 (BR-USR-01, 03, 16). */
export async function assertActorStillAdmin(tx: Db, actor: { id: string; sessionId: string }): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ role: string; is_active: boolean; sid: string | null; revoked_at: Date | null }>>(Prisma.sql`
    SELECT u."role"::text AS role, u."is_active", s."session_id" AS sid, s."revoked_at"
    FROM "users" u
    LEFT JOIN "sessions" s ON s."session_id" = ${actor.sessionId}::uuid AND s."user_id" = u."user_id"
    WHERE u."user_id" = ${actor.id}::uuid`);
  const r = rows[0];
  if (!r || !r.sid || r.revoked_at || !r.is_active) throw Errors.unauthenticated();
  if (r.role !== 'admin') throw Errors.forbidden();
}

interface TargetRow {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: user_role;
  is_active: boolean;
}

async function run(tx: Db, p: ChangeParams, at: Date): Promise<unknown> {
  const roles = p.kind === 'customer' ? ['member'] : ['staff', 'admin'];
  // 1. Khoá toàn cục cho thao tác nhân viên (mức giao dịch: tự nhả khi commit / rollback, chạy được qua pgbouncer transaction mode).
  if (p.kind === 'staff') await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USERS_ASSUMPTIONS.adminGuardKey}::bigint)`;
  // 2. Kiểm lại người gọi sau khi có khoá (thấy trạng thái đã commit của người đi trước).
  await assertActorStillAdmin(tx, p.actor);
  // 3. Khoá dòng đích (NO KEY UPDATE: không chặn FK KEY SHARE của nhật ký).
  const targets = await tx.$queryRaw<TargetRow[]>(Prisma.sql`
    SELECT "user_id", "email", "first_name", "last_name", "role", "is_active" FROM "users"
    WHERE "user_id" = ${p.targetId}::uuid AND "role"::text = ANY(${roles})
    FOR NO KEY UPDATE`);
  const target = targets[0];
  if (!target) throw Errors.notFound(p.kind === 'customer' ? 'Không tìm thấy khách hàng.' : 'Không tìm thấy nhân viên.');
  // 4. self-change đứng TRƯỚC mọi no-op (AC-USR-41).
  if (p.kind === 'staff' && target.user_id === p.actor.id) throw Errors.selfChange();

  const targetName = staffDisplayName({ firstName: target.first_name, lastName: target.last_name });
  const snap = (role: user_role) => ({ id: target.user_id, email: target.email, name: targetName, role });
  const input = p.input;

  if (input.op === 'lock') {
    if (target.is_active) {
      if (p.kind === 'staff' && target.role === 'admin' && (await countOtherActiveAdmins(tx, target.user_id)) === 0) throw Errors.lastAdmin();
      await tx.$executeRaw`UPDATE "users" SET "is_active" = false, "updated_at" = ${ts(at)} WHERE "user_id" = ${target.user_id}::uuid`;
      const n = await revokeAllUserSessions(target.user_id, 'account-disabled', tx);
      await insertAccountEvent(tx, { at, action: 'locked', actor: p.actor, target: snap(target.role), reason: input.reason, sessionsRevoked: n });
    }
  } else if (input.op === 'unlock') {
    if (!target.is_active) {
      await tx.$executeRaw`UPDATE "users" SET "is_active" = true, "updated_at" = ${ts(at)} WHERE "user_id" = ${target.user_id}::uuid`;
      await insertAccountEvent(tx, { at, action: 'unlocked', actor: p.actor, target: snap(target.role), reason: input.reason });
    }
  } else if (input.role !== target.role) {
    const before = target.role as 'staff' | 'admin';
    if (before === 'admin' && target.is_active && (await countOtherActiveAdmins(tx, target.user_id)) === 0) throw Errors.lastAdmin();
    await tx.$executeRaw`UPDATE "users" SET "role" = ${input.role}::"user_role", "updated_at" = ${ts(at)} WHERE "user_id" = ${target.user_id}::uuid`;
    const n = await revokeAllUserSessions(target.user_id, 'role-changed', tx);
    await insertAccountEvent(tx, {
      at, action: 'role-changed', actor: p.actor, target: snap(input.role), roleBefore: before, roleAfter: input.role, reason: input.reason, sessionsRevoked: n,
    });
  }

  // 6. Đọc lại cùng giao dịch.
  const dto = p.kind === 'customer' ? await loadCustomer(tx, target.user_id, 'admin') : await loadStaff(tx, target.user_id);
  if (!dto) throw Errors.notFound();
  return dto;
}

export async function changeAccountState(p: ChangeParams): Promise<ChangeResult> {
  if (!UUID_RE.test(p.targetId)) throw Errors.notFound();
  const hash = p.key ? requestHash({ method: p.input.op === 'role' ? 'PUT' : 'POST', path: p.path, body: p.input }, p.actor.id) : '';
  for (let attempt = 1; ; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const at = clockNow();
        if (p.key) {
          const acq = await acquireIdempotency(tx, 'admin-action', p.key, hash, at);
          if (acq.kind === 'replay') return { dto: acq.snapshot, replayed: true };
        }
        const dto = await run(tx, p, at);
        if (p.key) await completeIdempotency(tx, 'admin-action', p.key, { snapshot: dto });
        return { dto, replayed: false };
      }, TX);
      if (!out.replayed) logger.info('admin-account-change', { userId: p.actor.id, op: p.input.op, kind: p.kind });
      return out;
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}
