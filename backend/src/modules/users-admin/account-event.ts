import type { user_role } from '@prisma/client';
import prisma from '../../config/prisma';
import { USERS_ASSUMPTIONS } from '../../config/assumptions';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';

/**
 * Nhật ký thao tác tài khoản (BR-USR-24): CHỈ INSERT / SELECT. Không có update / delete nào trong mã
 * (T-USR-52 quét tĩnh `src/`); không dùng trigger vì FK `ON DELETE SET NULL` sinh UPDATE ngầm khi dọn người dùng.
 */

export type AccountAction = 'staff-created' | 'locked' | 'unlocked' | 'role-changed';

export interface AccountEventInput {
  at: Date;
  action: AccountAction;
  actor: { id: string; name: string; role: 'staff' | 'admin' };
  target: { id: string; email: string; name: string; role: user_role };
  roleBefore?: 'staff' | 'admin' | null;
  roleAfter?: 'staff' | 'admin' | null;
  reason?: string;
  sessionsRevoked?: number;
}

export async function insertAccountEvent(tx: Db, e: AccountEventInput): Promise<void> {
  await tx.accountEvent.create({
    data: {
      at: e.at,
      action: e.action,
      actorUserId: e.actor.id,
      actorName: e.actor.name.slice(0, 100),
      actorRole: e.actor.role,
      targetUserId: e.target.id,
      targetEmail: e.target.email.slice(0, 254),
      targetName: e.target.name.slice(0, 100),
      targetRole: e.target.role,
      roleBefore: e.roleBefore ?? null,
      roleAfter: e.roleAfter ?? null,
      reason: e.reason ?? '',
      sessionsRevoked: e.sessionsRevoked ?? 0,
    },
  });
}

export interface AccountEventDto {
  id: string;
  at: string;
  action: AccountAction;
  actor: { id: string | null; name: string; role: 'staff' | 'admin' };
  target: { id: string | null; email: string; name: string; role: user_role };
  roleBefore: 'staff' | 'admin' | null;
  roleAfter: 'staff' | 'admin' | null;
  reason: string;
  sessionsRevoked: number;
}

/** 20 dòng mới nhất của một tài khoản (khách hoặc nhân viên); id không tồn tại -> null. */
export async function listAccountEvents(accountId: string): Promise<AccountEventDto[] | null> {
  if (!UUID_RE.test(accountId)) return null;
  const user = await prisma.user.findUnique({ where: { user_id: accountId }, select: { user_id: true } });
  if (!user) return null;
  const rows = await prisma.accountEvent.findMany({
    where: { targetUserId: accountId },
    orderBy: [{ at: 'desc' }, { eventId: 'desc' }],
    take: USERS_ASSUMPTIONS.historyLimit,
  });
  return rows.map((r) => ({
    id: r.eventId,
    at: r.at.toISOString(),
    action: r.action as AccountAction,
    actor: { id: r.actorUserId, name: r.actorName, role: r.actorRole as 'staff' | 'admin' },
    target: { id: r.targetUserId, email: r.targetEmail, name: r.targetName, role: r.targetRole },
    roleBefore: r.roleBefore as 'staff' | 'admin' | null,
    roleAfter: r.roleAfter as 'staff' | 'admin' | null,
    reason: r.reason,
    sessionsRevoked: r.sessionsRevoked,
  }));
}
