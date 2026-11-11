import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { USER_PERMISSIONS } from '../src/config/assumptions';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { assertLocalTestDb, TEST_DB_URL } from './guard';
import {
  advance, assertNoSecrets, countEvents, get, loginAdmin, loginMember, loginStaff, makeMember, makeStaff, mails, newKey, post, resetState, uGet, uPost, uPut,
  useClock, freshIp,
} from './helpers';

/** Lát 7.1 (nền): T-USR-01..06 ↔ AC-USR-01, 02 (đóng AC-AUTH-85), 03, 06, 09, 10 (BE). */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let member: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  await resetState();
  admin = await loginAdmin('admin-f@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-f@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
  member = await makeMember({ email: 'm-f@example.com' });
});
beforeEach(() => {
  resetCheckoutRateLimits();
  mails.length = 0;
});

const newStaffBody = (i = 1) => ({ name: `Nhân Viên ${i}`, email: `nv${i}-${Date.now()}@nine2fine.test`, role: 'staff' });

describe('T-USR-01 AC-USR-01: không phiên / sai loại phiên / tài khoản khoá -> 401 no-store, DB không đổi', () => {
  it('bốn API đại diện', async () => {
    const memberLogin = await loginMember('storefront-f@example.com');
    const inactive = await loginStaff('inactive-f@nine2fine.test');
    await prisma.user.update({ where: { user_id: inactive.user.user_id }, data: { isActive: false } });
    const before = { users: await prisma.user.count(), events: await countEvents() };
    for (const cookie of [undefined, memberLogin.cookie, inactive.cookie]) {
      const calls = [
        await uGet('/customers', cookie),
        await uGet('/staff', cookie),
        await uPost(`/customers/${member.user_id}/lock`, { reason: 'Hoàn hàng gian lận' }, cookie),
        await uPost('/staff', newStaffBody(), cookie, { 'Idempotency-Key': newKey() }),
      ];
      for (const r of calls) {
        expect(r.status).toBe(401);
        expect(r.body.error.code).toBe('unauthenticated');
        expect(r.headers['cache-control']).toMatch(/no-store/);
        assertNoSecrets(r);
      }
    }
    expect({ users: await prisma.user.count(), events: await countEvents() }).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: member.user_id } })).isActive).toBe(true);
  });
});

describe('T-USR-02 AC-USR-02 (đóng AC-AUTH-85): staff gọi API nhân viên -> 403 forbidden; admin -> 200/201', () => {
  it('ma trận quyền khớp USER_PERMISSIONS', () => {
    expect(USER_PERMISSIONS.staff).toEqual(['customers.view']);
    expect(USER_PERMISSIONS.admin).toEqual(expect.arrayContaining(['customers.view', 'customers.contact', 'customers.edit', 'settings.staff']));
  });

  it('staff: 403 mọi API nhân viên + khoá khách + lịch sử, kể cả thân sai; không nhật ký, không thư', async () => {
    const target = await makeStaff2();
    const S = staff.cookie;
    const rs = [
      await uGet('/staff', S),
      await uPost('/staff', newStaffBody(), S, { 'Idempotency-Key': newKey() }),
      await uPost('/staff', { bậy: 1 }, S), // thân sai + thiếu khoá: vẫn 403 (quyền trước Zod)
      await uPut(`/staff/${target.user_id}/role`, { role: 'admin' }, S),
      await uPut(`/staff/${target.user_id}/role`, { role: 'member' }, S),
      await uPost(`/staff/${target.user_id}/lock`, { reason: 'Vi phạm quy định' }, S),
      await uPost(`/staff/${target.user_id}/unlock`, {}, S),
      await uPost(`/customers/${member.user_id}/lock`, { reason: 'Hoàn hàng gian lận' }, S),
      await uPost(`/customers/${member.user_id}/lock`, {}, S),
      await uPost(`/customers/${member.user_id}/unlock`, {}, S),
      await uGet(`/accounts/${member.user_id}/history`, S),
    ];
    for (const r of rs) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('forbidden');
      expect(r.headers['cache-control']).toMatch(/no-store/);
      assertNoSecrets(r);
    }
    expect(await countEvents()).toBe(0);
    expect(mails).toHaveLength(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: target.user_id } })).role).toBe('staff');
    // staff vẫn đọc được khách
    expect((await uGet('/customers', S)).status).toBe(200);
    expect((await uGet(`/customers/${member.user_id}`, S)).status).toBe(200);
  });

  it('admin: cùng các API cho 200 / 201', async () => {
    const A = admin.cookie;
    const target = await makeStaff2();
    expect((await uGet('/staff', A)).status).toBe(200);
    expect((await uPost('/staff', newStaffBody(2), A, { 'Idempotency-Key': newKey() })).status).toBe(201);
    expect((await uPut(`/staff/${target.user_id}/role`, { role: 'admin' }, A)).status).toBe(200);
    expect((await uPost(`/customers/${member.user_id}/lock`, { reason: 'Hoàn hàng gian lận' }, A)).status).toBe(200);
    expect((await uGet(`/accounts/${member.user_id}/history`, A)).status).toBe(200);
    expect((await uGet('/customers', A)).status).toBe(200);
    // dọn trạng thái cho các ca sau
    await prisma.user.update({ where: { user_id: member.user_id }, data: { isActive: true } });
  });
});

const makeStaff2 = () => makeStaff();

describe('T-USR-03 AC-USR-03: đổi vai trò bằng SQL có hiệu lực ở yêu cầu kế tiếp, không cần đăng nhập lại', () => {
  it('A hạ bằng SQL -> 403; S nâng bằng SQL -> 200', async () => {
    const a = await loginAdmin('admin-f3@nine2fine.test');
    const s = await loginStaff('staff-f3@nine2fine.test');
    expect((await uGet('/staff', a.cookie)).status).toBe(200);
    expect((await uGet('/staff', s.cookie)).status).toBe(403);
    await prisma.user.update({ where: { user_id: a.user.user_id }, data: { role: 'staff' } });
    await prisma.user.update({ where: { user_id: s.user.user_id }, data: { role: 'admin' } });
    expect((await uGet('/staff', a.cookie)).status).toBe(403);
    expect((await uGet('/staff', s.cookie)).status).toBe(200);
    expect((await uGet('/customers', a.cookie)).status).toBe(200);
  });
});

describe('T-USR-04 AC-USR-06: giới hạn tần suất', () => {
  it('61 yêu cầu ghi / 60 giây -> 429 + Retry-After + retryAfterSeconds', async () => {
    const a = await loginAdmin('admin-f4@nine2fine.test');
    const ip = freshIp();
    let last: Awaited<ReturnType<typeof post>> | undefined;
    for (let i = 0; i < 61; i++) {
      last = await post(`/api/admin/customers/${member.user_id}/unlock`, {}, { cookie: a.cookie, ip });
      if (i < 60) expect(last.status).toBe(200);
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('rate-limited');
    expect(last!.body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(last!.headers['retry-after']).toBeDefined();
  });

  it('11 lần tạo nhân viên / 60 phút -> 10 lần đầu 201, lần 11 429; sau 60 phút lại được', async () => {
    resetCheckoutRateLimits();
    useClock('2026-11-11T08:00:00.000Z');
    const a = await loginAdmin('admin-f4b@nine2fine.test');
    for (let i = 0; i < 10; i++) {
      const r = await uPost('/staff', { name: `Người ${i + 10}`, email: `rl${i}@nine2fine.test`, role: 'staff' }, a.cookie, { 'Idempotency-Key': newKey() });
      expect(r.status).toBe(201);
      advance(5_000);
    }
    const r11 = await uPost('/staff', { name: 'Người 20', email: 'rl-x@nine2fine.test', role: 'staff' }, a.cookie, { 'Idempotency-Key': newKey() });
    expect(r11.status).toBe(429);
    expect(r11.headers['retry-after']).toBeDefined();
    advance(60 * 60_000);
    const again = await loginAdmin('admin-f4c@nine2fine.test');
    const r12 = await uPost('/staff', { name: 'Người 21', email: 'rl-y@nine2fine.test', role: 'staff' }, again.cookie, { 'Idempotency-Key': newKey() });
    expect(r12.status).toBe(201);
    const r13 = await uPost('/staff', { name: 'Người 22', email: 'rl-z@nine2fine.test', role: 'staff' }, a.cookie, { 'Idempotency-Key': newKey() });
    expect([201, 401]).toContain(r13.status); // phiên 8 giờ vẫn còn; bộ đếm đã sang cửa sổ mới
  });
});

describe('T-USR-05 AC-USR-09: migration admin_users_schema', () => {
  const MIGRATION = '20261111000100_admin_users_schema';
  const sql = readFileSync(path.resolve(__dirname, `../prisma/migrations/${MIGRATION}/migration.sql`), 'utf8');

  it('chỉ cộng thêm: không DROP / TRUNCATE / RENAME / đổi kiểu / UPDATE / INSERT; CREATE INDEX IF NOT EXISTS', () => {
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '').replace(/^--.*$/gm, '');
    expect(stripped).not.toMatch(/\b(DROP|TRUNCATE|RENAME|DELETE\s+FROM|UPDATE\s+"?\w+"?\s+SET|INSERT\s+INTO)\b/i);
    expect(stripped).not.toMatch(/ALTER\s+COLUMN[^;]*\bTYPE\b/i);
    for (const m of stripped.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/gi)) expect.fail(`CREATE INDEX thiếu IF NOT EXISTS: ${m[0]}`);
    // Mọi ALTER TABLE chỉ trên bảng mới.
    for (const m of stripped.matchAll(/ALTER TABLE\s+"(\w+)"/g)) expect(m[1]).toBe('account_events');
  });

  it('migrate deploy lần 2 không có gì; diff rỗng; số dòng users / sessions / orders không đổi', async () => {
    assertLocalTestDb();
    const counts = async () => ({ users: await prisma.user.count(), sessions: await prisma.session.count(), orders: await prisma.order.count() });
    const before = await counts();
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL };
    const out = execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: path.resolve(__dirname, '..') }).toString();
    expect(out).toMatch(/No pending migrations to apply/);
    const diff = execSync(
      `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ${TEST_DB_URL.replace('n2f_test', 'n2f_shadow')}`,
      { env, stdio: 'pipe', cwd: path.resolve(__dirname, '..') },
    ).toString();
    expect(diff).toMatch(/No difference detected/);
    expect(await counts()).toEqual(before);
  });

  it('mọi bảng public mới bật RLS (account_events)', async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'account_events'`;
    expect(rows).toEqual([{ relname: 'account_events', relrowsecurity: true }]);
  });

  it('CHECK hình dạng nhật ký từ chối dòng sai', async () => {
    const raw = (action: string, extraCols: string, extraVals: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO account_events (action, actor_name, actor_role, target_email, target_name, target_role${extraCols}) VALUES ('${action}','A','admin','t@e.test','T','member'${extraVals})`,
      );
    await expect(raw('deleted', '', '')).rejects.toThrow(); // action lạ
    await expect(raw('locked', ', reason', ", 'abcd'")).rejects.toThrow(); // lý do khoá < 5
    await expect(raw('locked', ', reason, role_after', ", 'Lý do dài đủ', 'admin'")).rejects.toThrow(); // khoá không có role_after
    await expect(raw('role-changed', ', role_before, role_after', ", 'admin', 'admin'")).rejects.toThrow(); // trước = sau
    await expect(raw('staff-created', ', role_after, sessions_revoked', ", 'staff', 2")).rejects.toThrow(); // tạo không thu hồi
    await expect(raw('unlocked', ', reason', `, '${'x'.repeat(251)}'`)).rejects.toThrow(); // lý do > 250
    await expect(prisma.$executeRawUnsafe(`INSERT INTO account_events (action, actor_name, actor_role, target_email, target_name, target_role) VALUES ('unlocked','A','member','t@e.test','T','member')`)).rejects.toThrow(); // actor là member
    await expect(raw('unlocked', ', reason', ", ''")).resolves.toBe(1);
    await prisma.$executeRawUnsafe('DELETE FROM account_events');
  });
});

describe('T-USR-06 AC-USR-10 (BE): lỗi có code + HTTP đúng, không lộ stack / SQL / password_hash', () => {
  it('401, 403, 404, 409, 422 của API Slice 7', async () => {
    const A = admin.cookie;
    const staffTarget = await makeStaff2();
    const cases: Array<[Awaited<ReturnType<typeof get>>, number, string]> = [
      [await uGet('/customers'), 401, 'unauthenticated'],
      [await uGet('/staff', staff.cookie), 403, 'forbidden'],
      [await uGet('/customers/not-a-uuid', A), 404, 'not-found'],
      [await uGet(`/customers/${staffTarget.user_id}`, A), 404, 'not-found'],
      [await uPost(`/staff/${admin.user.user_id}/lock`, { reason: 'Tự khoá bản thân' }, A), 409, 'self-change'],
      [await uPut(`/staff/${admin.user.user_id}/role`, { role: 'staff' }, A), 409, 'self-change'],
      [await uPost('/staff', newStaffBody(), A), 422, 'validation'], // thiếu Idempotency-Key
      [await uPost(`/customers/${member.user_id}/lock`, { reason: 'abc' }, A), 422, 'validation'],
      [await uPost('/staff', { name: 'Hà', email: 'khong-hop-le', role: 'staff' }, A, { 'Idempotency-Key': newKey() }), 422, 'validation'],
      [await uPost('/staff', { name: 'Hà Nội', email: member.email, role: 'staff' }, A, { 'Idempotency-Key': newKey() }), 409, 'duplicate'],
    ];
    for (const [r, status, code] of cases) {
      expect(r.status).toBe(status);
      expect(r.body.error.code).toBe(code);
      expect(typeof r.body.error.message).toBe('string');
      assertNoSecrets(r);
    }
    expect(cases[9][0].body.error.field).toBe('email');
    expect(cases[7][0].body.error.field).toBe('reason');
    expect(await countEvents()).toBe(0);
  });

});
