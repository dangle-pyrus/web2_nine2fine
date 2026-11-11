import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/prisma';
import { logger } from '../src/lib/logger';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import {
  advance, assertNoSecrets, call, post, countEvents, flushMail, freshIp, loginAdmin, loginAdminAgain, loginStaff, makeMember, makeStaff, mails, newKey, resetState, sendCode,
  uGet, uPost, uPut, useClock,
} from './helpers';

/** Lát 7.6 (Should): lịch sử thao tác, bất biến nhật ký, trạng thái "Chờ đặt mật khẩu". T-USR-51..53 ↔ AC-USR-30, 42, 43 (dữ liệu), AC-USR-21. */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
const A = () => admin.cookie;
const S = () => staff.cookie;

beforeAll(async () => {
  await resetState();
  admin = await loginAdmin('admin-h@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-h@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(() => {
  resetCheckoutRateLimits();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mails.length = 0;
});

describe('T-USR-51 AC-USR-30: lịch sử thao tác của một tài khoản', () => {
  it('khách 3 thao tác (khoá, mở, khoá): admin thấy 3 dòng mới trước đủ người / vai trò / hành động / lý do; staff 403; id lạ 404', async () => {
    const m = await makeMember({ email: 'khach-h@example.com', firstName: 'Hoa', lastName: 'Lê' });
    useClock(new Date().toISOString());
    expect((await uPost(`/customers/${m.user_id}/lock`, { reason: 'Hoàn hàng gian lận lần một' }, A())).status).toBe(200);
    advance(1000);
    expect((await uPost(`/customers/${m.user_id}/unlock`, { reason: 'Đã xác minh' }, A())).status).toBe(200);
    advance(1000);
    expect((await uPost(`/customers/${m.user_id}/lock`, { reason: 'Hoàn hàng gian lận lần hai' }, A())).status).toBe(200);
    advance(1000);
    const h = await uGet(`/accounts/${m.user_id}/history`, A());
    expect(h.status).toBe(200);
    expect(h.headers['cache-control']).toMatch(/no-store/);
    assertNoSecrets(h);
    expect(h.body.map((e: { action: string }) => e.action)).toEqual(['locked', 'unlocked', 'locked']);
    expect(h.body.map((e: { reason: string }) => e.reason)).toEqual(['Hoàn hàng gian lận lần hai', 'Đã xác minh', 'Hoàn hàng gian lận lần một']);
    expect(h.body[0]).toMatchObject({
      actor: { id: admin.user.user_id, name: 'Trị Quản', role: 'admin' },
      target: { id: m.user_id, email: 'khach-h@example.com', name: 'Lê Hoa', role: 'member' },
      roleBefore: null, roleAfter: null, sessionsRevoked: 0,
    });
    expect(Object.keys(h.body[0]).sort()).toEqual(['action', 'actor', 'at', 'id', 'reason', 'roleAfter', 'roleBefore', 'sessionsRevoked', 'target']);
    expect(h.body[0].at > h.body[1].at && h.body[1].at > h.body[2].at).toBe(true);

    vi.useRealTimers();
    const denied = await uGet(`/accounts/${m.user_id}/history`, S());
    expect(denied.status).toBe(403);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'abc']) expect((await uGet(`/accounts/${id}/history`, A())).status).toBe(404);
    expect((await uGet(`/accounts/${m.user_id}/history`)).status).toBe(401);
  });

  it('chỉ 20 dòng mới nhất', async () => {
    const m = await makeMember({ email: 'nhieu-dong-h@example.com' });
    const base = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < 25; i++) {
      await prisma.accountEvent.create({
        data: {
          at: new Date(base + i * 1000), action: 'unlocked', actorUserId: admin.user.user_id, actorName: 'Trị Quản', actorRole: 'admin',
          targetUserId: m.user_id, targetEmail: m.email, targetName: 'Lê Khách', targetRole: 'member', reason: `lần ${i}`,
        },
      });
    }
    const h = await uGet(`/accounts/${m.user_id}/history`, A());
    expect(h.body).toHaveLength(20);
    expect(h.body[0].reason).toBe('lần 24');
    expect(h.body[19].reason).toBe('lần 5');
  });
});

describe('T-USR-52 AC-USR-42, AC-USR-21: nhật ký chỉ thêm, đủ trường, không lộ dữ liệu nhạy cảm', () => {
  it('tạo → khoá → mở → đổi vai trò: lịch sử đủ trường; ca bị từ chối không dòng; PUT / PATCH / DELETE dòng và DELETE tài khoản -> 404', async () => {
    const infos = vi.spyOn(logger, 'info');
    const errors = vi.spyOn(logger, 'error');
    const warns = vi.spyOn(logger, 'warn');
    const created = await uPost('/staff', { name: 'Đặng Thu Hương', email: 'huong-h@nine2fine.test', role: 'staff' }, A(), { 'Idempotency-Key': newKey() });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await uPost(`/staff/${id}/lock`, { reason: 'Nghỉ việc tạm thời' }, A())).status).toBe(200);
    expect((await uPost(`/staff/${id}/unlock`, { reason: 'Quay lại làm việc' }, A())).status).toBe(200);
    expect((await uPut(`/staff/${id}/role`, { role: 'admin', reason: 'Lên quản lý ca' }, A())).status).toBe(200);
    // ca bị từ chối: không dòng
    const before = await countEvents();
    expect((await uPost(`/staff/${admin.user.user_id}/lock`, { reason: 'Tự khoá bản thân' }, A())).status).toBe(409);
    expect((await uPost(`/staff/${id}/lock`, { reason: 'ab' }, A())).status).toBe(422);
    expect((await uPost(`/staff/${id}/lock`, { reason: 'Không đủ quyền' }, S())).status).toBe(403);
    expect((await uPost('/staff', { name: 'Hà', email: 'huong-h@nine2fine.test', role: 'staff' }, A(), { 'Idempotency-Key': newKey() })).status).toBe(409);
    expect(await countEvents()).toBe(before);

    const h = await uGet(`/accounts/${id}/history`, A());
    expect(h.body.map((e: { action: string }) => e.action)).toEqual(['role-changed', 'unlocked', 'locked', 'staff-created']);
    expect(h.body[0]).toMatchObject({ roleBefore: 'staff', roleAfter: 'admin', reason: 'Lên quản lý ca', target: { id, email: 'huong-h@nine2fine.test', name: 'Đặng Thu Hương', role: 'admin' } });
    expect(h.body[1]).toMatchObject({ roleBefore: null, roleAfter: null, reason: 'Quay lại làm việc' });
    expect(h.body[2]).toMatchObject({ sessionsRevoked: 0, reason: 'Nghỉ việc tạm thời' });
    expect(h.body[3]).toMatchObject({ roleBefore: null, roleAfter: 'staff', actor: { id: admin.user.user_id, role: 'admin' } });

    // Không có đường sửa / xoá dòng nhật ký hay xoá tài khoản.
    const eventId = h.body[0].id as string;
    for (const [method, p] of [
      ['put', `/api/admin/accounts/${id}/history`],
      ['patch', `/api/admin/accounts/${id}/history`],
      ['delete', `/api/admin/accounts/${id}/history`],
      ['put', `/api/admin/accounts/${id}/history/${eventId}`],
      ['delete', `/api/admin/accounts/${id}/history/${eventId}`],
      ['delete', `/api/admin/staff/${id}`],
      ['patch', `/api/admin/staff/${id}`],
      ['delete', `/api/admin/customers/${id}`],
      ['post', `/api/admin/accounts/${id}/history`],
    ] as const) {
      const r = await call(method, p, {}, { cookie: A(), ip: freshIp() });
      expect([p, r.status]).toEqual([p, 404]);
    }
    expect(await prisma.user.count({ where: { user_id: id } })).toBe(1);
    expect(await countEvents({ targetUserId: id })).toBe(4);

    // AC-USR-21: log ứng dụng không chứa email / tên / lý do
    await flushMail();
    const logged = JSON.stringify([...infos.mock.calls, ...errors.mock.calls, ...warns.mock.calls]);
    for (const leak of ['huong-h', 'Đặng', 'Hương', 'Nghỉ việc', 'Quay lại', 'Lên quản lý', 'Tự khoá']) expect(logged).not.toContain(leak);
  });

  it('quét tĩnh: không có accountEvent.update/delete* và UPDATE / DELETE FROM "account_events" trong backend/src', () => {
    const root = path.resolve(__dirname, '../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect([f, /accountEvent\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(src)]).toEqual([f, false]);
      expect([f, /(UPDATE|DELETE\s+FROM|TRUNCATE)\s+(TABLE\s+)?"?account_events"?/i.test(src)]).toEqual([f, false]);
    }
  });

  it('dòng nhật ký còn nguyên khi tài khoản liên quan bị dọn (FK SET NULL giữ ảnh chụp tên / email)', async () => {
    const b = await makeStaff({ email: 'b-h@nine2fine.test', role: 'admin', firstName: 'Bình', lastName: 'Võ' });
    const bc = await loginAdminAgain(b.email);
    const m = await makeMember({ email: 'khach-h2@example.com', firstName: 'Cúc', lastName: 'Hồ' });
    expect((await uPost(`/customers/${m.user_id}/lock`, { reason: 'Vi phạm điều khoản' }, bc)).status).toBe(200);
    await prisma.session.deleteMany({ where: { userId: b.user_id } });
    await prisma.$executeRaw`DELETE FROM users WHERE user_id = ${b.user_id}::uuid`;
    const h = await uGet(`/accounts/${m.user_id}/history`, A());
    expect(h.body).toHaveLength(1);
    expect(h.body[0].actor).toEqual({ id: null, name: 'Võ Bình', role: 'admin' });
    expect(h.body[0].target).toMatchObject({ id: m.user_id, email: 'khach-h2@example.com', name: 'Hồ Cúc' });
  });
});

describe('T-USR-53 AC-USR-43 (phần dữ liệu): "Chờ đặt mật khẩu" / lần hoạt động cuối', () => {
  it('passwordSet=false cho N chưa đặt mật khẩu và true sau khi đặt; lastActiveAt cho N2; N3 disabled', async () => {
    const created = await uPost('/staff', { name: 'Chờ Mật Khẩu', email: 'cho-h@nine2fine.test', role: 'staff' }, A(), { 'Idempotency-Key': newKey() });
    expect(created.body).toMatchObject({ passwordSet: false, lastActiveAt: null, status: 'active' });
    const n2 = await makeStaff({ email: 'n2-h@nine2fine.test', role: 'staff' });
    await loginAdminAgain(n2.email);
    const n3 = await makeStaff({ email: 'n3-h@nine2fine.test', role: 'staff', isActive: false });
    const list = await uGet('/staff', A());
    const by = Object.fromEntries(list.body.map((m: { email: string }) => [m.email, m]));
    expect(by['cho-h@nine2fine.test']).toMatchObject({ passwordSet: false, lastActiveAt: null });
    expect(by['n2-h@nine2fine.test'].passwordSet).toBe(true);
    expect(by['n2-h@nine2fine.test'].lastActiveAt).not.toBeNull();
    expect(by['n3-h@nine2fine.test']).toMatchObject({ status: 'disabled', lastActiveAt: null });
    expect(n3.user_id).toBeTruthy();

    const { code } = await sendCode('cho-h@nine2fine.test', 'reset-password');
    expect((await post('/api/auth/password/reset', { email: 'cho-h@nine2fine.test', code, newPassword: 'Nine2fine9' })).status).toBe(204);
    const after = (await uGet('/staff', A())).body.find((m: { email: string }) => m.email === 'cho-h@nine2fine.test');
    expect(after.passwordSet).toBe(true);
  });
});
