import { Prisma } from '@prisma/client';
import { Db, ts } from '../../lib/sql';
import { vnDayBoundsUtc } from '../../lib/vn-time';
import type { AuditQuery } from './insights.schemas';

/**
 * Nhật ký hợp nhất, CHỈ ĐỌC (BR-AUD-01..05, plan mục 9): UNION ALL của bốn nguồn có sẵn, không bảng riêng. Chỉ liệt kê cột
 * (không `SELECT *`): không bao giờ chọn `internal_note`, `detail`, `email_*`, IP, UA. Mỗi nhánh lọc `at` trước (chỉ mục `at`).
 * Cửa sổ ngày VN `[00:00 from, 00:00 to + 1)` tính ở JS rồi qua `ts()` (không phụ thuộc múi giờ phiên).
 */

const ORDER_KINDS = ['call_attempt', 'confirmed', 'shipped', 'delivered', 'cancelled', 'cancel_approved', 'cancel_rejected', 'stock_restocked', 'stock_written_off', 'note',
  'return_approved', 'return_rejected', 'return_received', 'return_refunded'];

const ACTION_LABELS: Record<string, string> = {
  'order.call-attempt': 'Gọi xác nhận đơn',
  'order.confirmed': 'Xác nhận đơn',
  'order.shipped': 'Bàn giao cho đơn vị vận chuyển',
  'order.delivered': 'Xác nhận giao thành công',
  'order.cancelled': 'Huỷ đơn',
  'order.cancel-approved': 'Duyệt yêu cầu huỷ đơn',
  'order.cancel-rejected': 'Từ chối yêu cầu huỷ đơn',
  'order.stock-restocked': 'Nhập lại kho hàng hoàn',
  'order.stock-written-off': 'Xuất huỷ hàng hoàn',
  'order.note-added': 'Thêm ghi chú nội bộ cho đơn',
  'order.return-approved': 'Duyệt yêu cầu trả hàng',
  'order.return-rejected': 'Từ chối / đóng yêu cầu trả hàng',
  'order.return-received': 'Nhận hàng trả về',
  'order.return-refunded': 'Xác nhận hoàn tiền trả hàng',
  'account.staff-created': 'Tạo tài khoản nhân viên',
  'account.locked': 'Khoá tài khoản',
  'account.unlocked': 'Mở khoá tài khoản',
  'account.role-changed': 'Đổi vai trò tài khoản',
  'settings.updated': 'Cập nhật cài đặt cửa hàng',
};
const STOCK_REASON_LABELS: Record<string, string> = {
  received: 'Nhập hàng',
  return: 'Khách trả hàng',
  damaged: 'Hư hỏng',
  count: 'Kiểm kê',
  correction: 'Điều chỉnh sai sót',
};

interface Row {
  id: string;
  at: Date;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string;
  reason: string;
  role_before: string | null;
  role_after: string | null;
  changes: unknown;
  delta: number | null;
  inv_reason: string | null;
}

const window = (col: string, from: Date, to: Date) => Prisma.sql`${Prisma.raw(col)} >= ${ts(from)} AND ${Prisma.raw(col)} < ${ts(to)}`;

function branches(q: AuditQuery, from: Date, to: Date): Prisma.Sql {
  const t = q.targetType;
  const parts: Prisma.Sql[] = [];
  if (!t || t === 'order') {
    parts.push(Prisma.sql`
      SELECT ('order:' || e.event_id::text) AS id, e.at AS at, e.actor_user_id AS actor_id,
             COALESCE(e.actor_name, 'Nhân viên')::text AS actor_name, COALESCE(e.actor_role::text, 'staff') AS actor_role,
             (CASE e.kind::text WHEN 'note' THEN 'order.note-added' ELSE 'order.' || replace(e.kind::text, '_', '-') END)::text AS action,
             'order'::text AS target_type, o.code::text AS target_id, ('#' || o.code)::text AS target_label,
             COALESCE(e.reason_code, '')::text AS reason, NULL::text AS role_before, NULL::text AS role_after,
             NULL::jsonb AS changes, NULL::int AS delta, NULL::text AS inv_reason
      FROM order_events e JOIN orders o ON o.order_id = e.order_id
      WHERE ${window('e.at', from, to)} AND e.actor = 'shop' AND e.kind::text IN (${Prisma.join(ORDER_KINDS)})`);
  }
  if (!t || t === 'inventory') {
    parts.push(Prisma.sql`
      SELECT ('inventory:' || a.adjustment_id::text) AS id, a.at AS at, a.actor_user_id AS actor_id,
             a.actor_name::text AS actor_name, a.actor_role::text AS actor_role,
             'inventory.adjusted'::text AS action,
             'inventory'::text AS target_type, a.variant_id::text AS target_id, (v.sku || ' - ' || p.name)::text AS target_label,
             a.note::text AS reason, NULL::text AS role_before, NULL::text AS role_after,
             NULL::jsonb AS changes, a.delta::int AS delta, a.reason::text AS inv_reason
      FROM inventory_adjustments a
      JOIN product_variants v ON v.variant_id = a.variant_id
      JOIN products p ON p.product_id = v.product_id
      WHERE ${window('a.at', from, to)}`);
  }
  if (!t || t === 'customer' || t === 'staff') {
    const role = t === 'customer' ? Prisma.sql`AND c.target_role = 'member'` : t === 'staff' ? Prisma.sql`AND c.target_role <> 'member'` : Prisma.empty;
    parts.push(Prisma.sql`
      SELECT ('account:' || c.event_id::text) AS id, c.at AS at, c.actor_user_id AS actor_id,
             c.actor_name::text AS actor_name, c.actor_role::text AS actor_role,
             ('account.' || c.action)::text AS action,
             (CASE WHEN c.target_role = 'member' THEN 'customer' ELSE 'staff' END)::text AS target_type,
             c.target_user_id::text AS target_id, c.target_name::text AS target_label,
             c.reason::text AS reason, c.role_before::text AS role_before, c.role_after::text AS role_after,
             NULL::jsonb AS changes, NULL::int AS delta, NULL::text AS inv_reason
      FROM account_events c
      WHERE ${window('c.at', from, to)} ${role}`);
  }
  if (!t || t === 'settings') {
    parts.push(Prisma.sql`
      SELECT ('settings:' || s.event_id::text) AS id, s.at AS at, s.actor_user_id AS actor_id,
             s.actor_name::text AS actor_name, s.actor_role::text AS actor_role,
             'settings.updated'::text AS action,
             'settings'::text AS target_type, 'store'::text AS target_id, 'Cài đặt cửa hàng'::text AS target_label,
             ''::text AS reason, NULL::text AS role_before, NULL::text AS role_after,
             s.changes AS changes, NULL::int AS delta, NULL::text AS inv_reason
      FROM store_settings_events s
      WHERE ${window('s.at', from, to)}`);
  }
  return Prisma.join(parts, ' UNION ALL ');
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : '0');

function toEntry(r: Row) {
  const role = r.actor_role === 'admin' ? 'admin' : 'staff';
  let label = ACTION_LABELS[r.action] ?? r.action;
  if (r.action === 'inventory.adjusted') {
    const why = STOCK_REASON_LABELS[r.inv_reason ?? ''];
    label = `Điều chỉnh tồn kho ${signed(r.delta ?? 0)}${why ? ` (${why})` : ''}`;
  }
  const changes = r.target_type === 'settings' && Array.isArray(r.changes) ? (r.changes as Array<Record<string, string>>) : null;
  return {
    id: r.id,
    at: r.at.toISOString(),
    actor: { id: r.actor_id, name: r.actor_name, role: role as 'staff' | 'admin' },
    action: { code: r.action, label },
    target: { type: r.target_type, id: r.target_id, label: r.target_label },
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.role_before && r.action === 'account.role-changed' ? { roleBefore: r.role_before } : {}),
    ...(r.role_after && (r.action === 'account.role-changed' || r.action === 'account.staff-created') ? { roleAfter: r.role_after } : {}),
    ...(changes ? { changes: changes.map((c) => ({ field: c.field, label: c.label, before: c.before, after: c.after })) } : {}),
  };
}

export async function listAudit(db: Db, q: AuditQuery) {
  const { from, to } = vnDayBoundsUtc(q.from, q.to);
  const union = branches(q, from, to);
  const [rows, [cnt]] = await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT u.* FROM (${union}) u
      ORDER BY u.at DESC, u.id COLLATE "C" DESC
      LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`),
    db.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT COUNT(*) AS n FROM (${union}) u`),
  ]);
  return { items: rows.map(toEntry), total: Number(cnt.n), page: q.page, limit: q.limit };
}
