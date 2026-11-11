import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { getConfig } from '../../config/env';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import { staffInviteMail } from '../../mail/templates';
import { sendMailInBackground } from '../../mail/mailer';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import { assertActorStillAdmin, type AccountActor } from './account-status.service';
import { insertAccountEvent } from './account-event';
import { loadStaff, type StaffDto } from './staff.query';

/**
 * Tạo nhân viên KHÔNG mật khẩu (S7-Q1, BR-USR-19, 20): tài khoản đang hoạt động, `password_hash` NULL, thư hướng dẫn
 * "Quên mật khẩu" gửi SAU commit. Không giảm số admin nên không cần khoá toàn cục.
 */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

export interface StaffCreateInput {
  name: string;
  email: string;
  role: 'staff' | 'admin';
}

/** "Trần Thu Hà" -> last_name "Trần Thu", first_name "Hà"; một từ -> last_name rỗng (khớp `staffDisplayName`). */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.split(' ');
  const firstName = parts.pop() ?? name;
  return { firstName, lastName: parts.join(' ') };
}

export async function createStaff(p: {
  actor: AccountActor;
  input: StaffCreateInput;
  key: string;
  path: string;
}): Promise<{ dto: StaffDto; replayed: boolean }> {
  const hash = requestHash({ method: 'POST', path: p.path, body: p.input }, p.actor.id);
  for (let attempt = 1; ; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const at = clockNow();
        const acq = await acquireIdempotency(tx, 'admin-action', p.key, hash, at);
        if (acq.kind === 'replay') return { dto: acq.snapshot as StaffDto, replayed: true };
        await assertActorStillAdmin(tx, p.actor);

        const dup = await tx.$queryRaw<Array<{ x: number }>>(Prisma.sql`SELECT 1 AS x FROM "users" WHERE lower("email") = ${p.input.email} LIMIT 1`);
        if (dup.length > 0) throw Errors.duplicate('email', 'Email này đã có tài khoản.');

        const { firstName, lastName } = splitName(p.input.name);
        const user = await tx.user.create({
          data: {
            email: p.input.email,
            passwordHash: null,
            firstName,
            lastName,
            role: p.input.role,
            isActive: true,
            marketingOptIn: false,
            // Cột NOT NULL; nhân viên chưa từng chấp nhận điều khoản storefront, giá trị chỉ mang tính kỹ thuật (plan mục 12 #7).
            terms_accepted_at: at,
            createdAt: at,
            updatedAt: at,
          },
        });
        await insertAccountEvent(tx, {
          at,
          action: 'staff-created',
          actor: p.actor,
          target: { id: user.user_id, email: user.email, name: p.input.name, role: p.input.role },
          roleAfter: p.input.role,
        });
        const dto = await loadStaff(tx, user.user_id);
        if (!dto) throw Errors.unavailable();
        await completeIdempotency(tx, 'admin-action', p.key, { snapshot: dto });
        return { dto, replayed: false };
      }, TX);
      if (!out.replayed) {
        logger.info('admin-staff-created', { userId: p.actor.id, role: p.input.role });
        // SAU commit; lỗi gửi chỉ log tên lỗi (runInBackground) và không làm hỏng việc tạo (AC-USR-34).
        sendMailInBackground(staffInviteMail(p.input.email, p.input.name, p.input.role, getConfig().appBaseUrl));
      }
      return out;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw Errors.duplicate('email', 'Email này đã có tài khoản.');
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}
