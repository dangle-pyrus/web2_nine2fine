import { Prisma } from '@prisma/client';
import type { order_actor, order_event_kind, order_status, payment_status, user_role } from '@prisma/client';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';

/** Nhân viên thực hiện: tên + vai trò được CHỤP vào sự kiện (đổi tên / xoá user sau này không đổi vết kiểm toán). */
export interface EventActorUser {
  id: string;
  name: string;
  role: Extract<user_role, 'staff' | 'admin'>;
}

export const staffDisplayName = (u: { firstName: string; lastName: string }): string =>
  `${u.lastName} ${u.firstName}`.replace(/\s+/g, ' ').trim().slice(0, 100);

export interface OrderEventInput {
  orderId: string;
  at: Date;
  fromStatus: order_status | null;
  toStatus: order_status;
  paymentStatus: payment_status;
  actor: order_actor;
  kind: order_event_kind;
  /** Phần khách được thấy. */
  detail?: string | null;
  /** Chỉ khi `actor = shop`. */
  actorUser?: EventActorUser;
  reasonCode?: string | null;
  /** Chỉ admin API đọc. */
  internalNote?: string | null;
  /** Tên thư cần gửi cho sự kiện này (NULL = không có thư). */
  emailTemplate?: string | null;
}

/** MỌI ghi sự kiện đơn đi qua đây (BR-ADM-11: mỗi thao tác đúng 1 dòng, cùng giao dịch). Trả `event_id`. */
export async function insertOrderEvent(tx: Db, e: OrderEventInput): Promise<string> {
  const u = e.actorUser;
  const [row] = await tx.$queryRaw<Array<{ event_id: string }>>(Prisma.sql`
    INSERT INTO "order_events" ("order_id", "at", "from_status", "to_status", "payment_status", "actor", "detail", "kind",
      "actor_user_id", "actor_name", "actor_role", "reason_code", "internal_note", "email_template")
    VALUES (${e.orderId}::uuid, ${ts(e.at)}, ${e.fromStatus}::"order_status", ${e.toStatus}::"order_status",
      ${e.paymentStatus}::"payment_status", ${e.actor}::"order_actor", ${e.detail ?? null}, ${e.kind}::"order_event_kind",
      ${u ? u.id : null}::uuid, ${u ? u.name : null}, ${u ? u.role : null}::"user_role", ${e.reasonCode ?? null},
      ${e.internalNote ?? null}, ${e.emailTemplate ?? null})
    RETURNING "event_id"`);
  return row.event_id;
}
