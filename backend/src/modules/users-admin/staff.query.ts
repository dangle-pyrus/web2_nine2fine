import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { USERS_ASSUMPTIONS } from '../../config/assumptions';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import { staffDisplayName } from '../order/order-event';

/** Nhân viên = users.role IN (staff, admin). SELECT liệt kê cột: không bao giờ chọn `password_hash`. */

export interface StaffDto {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'admin';
  status: 'active' | 'disabled';
  passwordSet: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

interface StaffRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'staff' | 'admin';
  is_active: boolean;
  password_set: boolean;
  created_at: Date;
  last_active_at: Date | null;
}

const toDto = (r: StaffRow): StaffDto => ({
  id: r.user_id,
  name: staffDisplayName({ firstName: r.first_name, lastName: r.last_name }),
  email: r.email,
  role: r.role,
  status: r.is_active ? 'active' : 'disabled',
  passwordSet: r.password_set,
  createdAt: r.created_at.toISOString(),
  lastActiveAt: r.last_active_at ? r.last_active_at.toISOString() : null,
});

const select = (where: Prisma.Sql) => Prisma.sql`
  SELECT u."user_id", u."first_name", u."last_name", u."email", u."role"::text AS "role", u."is_active",
         (u."password_hash" IS NOT NULL) AS "password_set", u."created_at",
         (SELECT MAX(s."last_used_at") FROM "sessions" s WHERE s."user_id" = u."user_id") AS "last_active_at"
  FROM "users" u WHERE u."role" IN ('staff', 'admin') ${where}
  ORDER BY u."created_at" ASC, u."user_id" ASC LIMIT ${USERS_ASSUMPTIONS.maxStaff}`;

export async function listStaff(db: Db = prisma): Promise<StaffDto[]> {
  return (await db.$queryRaw<StaffRow[]>(select(Prisma.empty))).map(toDto);
}

export async function loadStaff(db: Db, id: string): Promise<StaffDto | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db.$queryRaw<StaffRow[]>(select(Prisma.sql`AND u."user_id" = ${id}::uuid`));
  return rows[0] ? toDto(rows[0]) : null;
}

/** Số admin đang hoạt động khác `excludeId` (BR-USR-23). Hàm riêng để test thay thế được. */
export async function countOtherActiveAdmins(db: Db, excludeId: string): Promise<number> {
  const [r] = await db.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT COUNT(*)::int AS n FROM "users" WHERE "role" = 'admin' AND "is_active" AND "user_id" <> ${excludeId}::uuid`,
  );
  return Number(r?.n ?? 0);
}
