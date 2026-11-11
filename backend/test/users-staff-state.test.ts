import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import * as sessionService from '../src/modules/auth/session.service';
import * as accountEvent from '../src/modules/users-admin/account-event';
import * as staffQuery from '../src/modules/users-admin/staff.query';
import {
  activeAdmins, assertNoSecrets, countEvents, get, freshIp, loginAdmin, loginAdminAgain, loginStaff, makeMember, makeStaff, mails, resetState, uGet, uPost, uPut,
} from './helpers';

/** Lát 7.5: khoá / mở / đổi vai trò nhân viên. T-USR-40..47 ↔ AC-USR-26..29 (đóng AC-AUTH-75), 37..41, BR-USR-23. */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
const A = () => admin.cookie;

async function fresh(): Promise<void> {
  await resetState();
  admin = await loginAdmin('admin-t@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
}
beforeAll(fresh);
beforeEach(() => {
  resetCheckoutRateLimits();
  vi.restoreAllMocks();
  mails.length = 0;
});

const lock = (cookie: string, id: string, reason = 'Vi phạm quy định nội bộ') => uPost(`/staff/${id}/lock`, { reason }, cookie);
const unlock = (cookie: string, id: string, body: unknown = {}) => uPost(`/staff/${id}/unlock`, body, cookie);
const setRole = (cookie: string, id: string, role: unknown, reason?: string) => uPut(`/staff/${id}/role`, reason === undefined ? { role } : { role, reason }, cookie);
const dbUser = (id: string) => prisma.user.findUniqueOrThrow({ where: { user_id: id } });

let seq = 0;
async function staffWithSessions(role: 'staff' | 'admin', n = 2) {
  const email = `t${++seq}-${role}@nine2fine.test`;
  const u = await makeStaff({ email, role, firstName: `Tên${seq}`, lastName: 'Họ' });
  const cookies: string[] = [];
  for (let i = 0; i < n; i++) cookies.push(await loginAdminAgain(email));
  return { u, email, cookies };
}

describe('T-USR-40 AC-USR-26 (đóng AC-AUTH-75), 29: khoá nhân viên thu hồi mọi phiên', () => {
  it('N 2 máy: A khoá N -> N 401 ở cả hai máy ở yêu cầu kế tiếp; 2 phiên account-disabled; nhật ký sessions_revoked 2; mở khoá: cookie cũ 401, đăng nhập lại được', async () => {
    const { u, email, cookies } = await staffWithSessions('staff', 2);
    for (const c of cookies) expect((await uGet('/customers', c)).status).toBe(200);
    const r = await lock(A(), u.user_id);
    expect(r.status).toBe(200);
    assertNoSecrets(r);
    expect(r.body).toMatchObject({ id: u.user_id, status: 'disabled', role: 'staff' });
    for (const c of cookies) {
      const x = await uGet('/customers', c);
      expect(x.status).toBe(401);
      expect(x.body.error.code).toBe('unauthenticated');
      expect(x.headers['cache-control']).toMatch(/no-store/);
    }
    const sessions = await prisma.session.findMany({ where: { userId: u.user_id } });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.revoked_at !== null && s.revoke_reason === 'account-disabled')).toBe(true);
    const ev = await prisma.accountEvent.findFirstOrThrow({ where: { targetUserId: u.user_id } });
    expect(ev).toMatchObject({ action: 'locked', sessionsRevoked: 2, targetRole: 'staff', actorRole: 'admin' });

    const un = await unlock(A(), u.user_id, { reason: 'Đã xác minh' });
    expect(un.status).toBe(200);
    expect(un.body.status).toBe('active');
    for (const c of cookies) expect((await uGet('/customers', c)).status).toBe(401); // mở khoá không khôi phục phiên
    const again = await loginAdminAgain(email);
    expect((await uGet('/customers', again)).status).toBe(200);
    expect(await prisma.accountEvent.count({ where: { targetUserId: u.user_id, action: 'unlocked' } })).toBe(1);
    expect((await unlock(A(), u.user_id)).status).toBe(200);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(2);
  });
});

describe('T-USR-41 AC-USR-27 (đóng AC-AUTH-75): đổi vai trò thu hồi mọi phiên', () => {
  it('A2 2 máy: A hạ A2 -> API nhân viên 401 (không 403) ở cả 2 máy; role-changed; đăng nhập lại: nhân viên 403, khách / đơn 200', async () => {
    const { u, email, cookies } = await staffWithSessions('admin', 2);
    for (const c of cookies) expect((await uGet('/staff', c)).status).toBe(200);
    const r = await setRole(A(), u.user_id, 'staff', 'Chuyển sang vận hành');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ role: 'staff', status: 'active' });
    for (const c of cookies) {
      const x = await uGet('/staff', c);
      expect(x.status).toBe(401);
      expect(x.body.error.code).toBe('unauthenticated');
    }
    const sessions = await prisma.session.findMany({ where: { userId: u.user_id } });
    expect(sessions.every((s) => s.revoke_reason === 'role-changed')).toBe(true);
    const ev = await prisma.accountEvent.findFirstOrThrow({ where: { targetUserId: u.user_id } });
    expect(ev).toMatchObject({ action: 'role-changed', roleBefore: 'admin', roleAfter: 'staff', reason: 'Chuyển sang vận hành', sessionsRevoked: 2, targetRole: 'staff' });
    const fresh2 = await loginAdminAgain(email);
    expect((await uGet('/staff', fresh2)).status).toBe(403);
    expect((await uGet('/customers', fresh2)).status).toBe(200);
    expect((await get('/api/admin/orders', { cookie: fresh2, ip: freshIp() })).status).toBe(200);
  });
});

describe('T-USR-42 AC-USR-37: khoá / mở nhân viên, không tự khoá', () => {
  it('A khoá S (lý do 5 ký tự) ok; lý do rỗng 422; mở khoá ok; A khoá A -> 409 self-change; mỗi thao tác thành công 1 dòng', async () => {
    const { u } = await staffWithSessions('staff', 1);
    expect((await lock(A(), u.user_id, 'abcde')).status).toBe(200);
    for (const body of [{ reason: '' }, {}, { reason: 'abcd' }]) {
      const r = await uPost(`/staff/${u.user_id}/lock`, body, A());
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'reason' });
    }
    expect((await unlock(A(), u.user_id)).status).toBe(200);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(2);

    const me = await lock(A(), admin.user.user_id);
    expect(me.status).toBe(409);
    expect(me.body.error.code).toBe('self-change');
    expect((await dbUser(admin.user.user_id)).isActive).toBe(true);
    expect((await uGet('/staff', A())).status).toBe(200);
    expect(await countEvents({ targetUserId: admin.user.user_id })).toBe(0);
    expect((await lock(A(), '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await lock(A(), 'xyz')).status).toBe(404);
    const m = await makeMember({ email: 'khach-t@example.com' });
    expect((await lock(A(), m.user_id)).status).toBe(404); // khách không khoá qua API nhân viên
  });
});

describe('T-USR-43 AC-USR-38, 39: đổi vai trò', () => {
  it('A đổi S thành admin, S đăng nhập lại thấy /admin/staff 200; về staff; A đổi A -> 409 self-change; đặt đúng vai trò -> 200 không dòng; id của khách -> 404; role member -> 422', async () => {
    const { u, email } = await staffWithSessions('staff', 1);
    const up = await setRole(A(), u.user_id, 'admin');
    expect(up.status).toBe(200);
    expect(up.body.role).toBe('admin');
    const asAdmin = await loginAdminAgain(email);
    expect((await uGet('/staff', asAdmin)).status).toBe(200);
    expect((await setRole(A(), u.user_id, 'staff')).status).toBe(200);
    expect((await uGet('/staff', asAdmin)).status).toBe(401);
    expect(await prisma.accountEvent.count({ where: { targetUserId: u.user_id, action: 'role-changed' } })).toBe(2);

    const same = await setRole(A(), u.user_id, 'staff');
    expect(same.status).toBe(200);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(2);
    const stillLogged = await loginAdminAgain(email);
    expect((await setRole(A(), u.user_id, 'staff')).status).toBe(200);
    expect((await uGet('/customers', stillLogged)).status).toBe(200); // đặt đúng vai trò hiện tại không thu hồi phiên

    for (const role of ['admin', 'staff']) {
      const me = await setRole(A(), admin.user.user_id, role); // kể cả đúng vai trò hiện tại: self-change đứng trước no-op
      expect(me.status).toBe(409);
      expect(me.body.error.code).toBe('self-change');
    }
    const m = await makeMember({ email: 'khach-t43@example.com' });
    expect((await setRole(A(), m.user_id, 'staff')).status).toBe(404);
    for (const role of ['member', 'owner', undefined, 5]) {
      const r = await setRole(A(), u.user_id, role);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'role' });
    }
    expect((await uPut(`/staff/${u.user_id}/role`, { role: 'admin', reason: 'x'.repeat(251) }, A())).body.error).toMatchObject({ field: 'reason' });
    expect((await dbUser(u.user_id)).role).toBe('staff');
  });
});

describe('T-USR-45 AC-USR-41: self-change đứng trước mọi no-op, luôn còn admin', () => {
  it('A là admin hoạt động duy nhất, A3 admin bị khoá: tự khoá / tự hạ 409; hạ A3 200; mở A3 200', async () => {
    await fresh();
    const a3 = await makeStaff({ email: 'a3-t@nine2fine.test', role: 'admin', isActive: false });
    expect(await activeAdmins()).toBe(1);
    expect((await lock(A(), admin.user.user_id)).body.error.code).toBe('self-change');
    expect((await setRole(A(), admin.user.user_id, 'staff')).body.error.code).toBe('self-change');
    expect((await unlock(A(), admin.user.user_id)).body.error.code).toBe('self-change'); // đang hoạt động: vẫn 409, không phải 200 no-op
    expect(await activeAdmins()).toBe(1);
    const down = await setRole(A(), a3.user_id, 'staff'); // hạ admin đang khoá: không làm giảm admin hoạt động
    expect(down.status).toBe(200);
    expect((await unlock(A(), a3.user_id)).status).toBe(200);
    expect((await dbUser(a3.user_id)).isActive).toBe(true);
    expect(await activeAdmins()).toBe(1);
    expect((await uGet('/staff', A())).status).toBe(200);
  });
});

describe('T-USR-46 BR-USR-23: không bao giờ còn 0 admin hoạt động', () => {
  it('ba admin: hạ / khoá chéo tuần tự; mỗi bước còn >= 1', async () => {
    await fresh();
    const b = await staffWithSessions('admin', 1);
    const c = await staffWithSessions('admin', 1);
    expect(await activeAdmins()).toBe(3);
    expect((await lock(A(), b.u.user_id)).status).toBe(200);
    expect(await activeAdmins()).toBe(2);
    expect((await setRole(A(), b.u.user_id, 'staff')).status).toBe(200); // B đã khoá: không thay đổi số admin hoạt động
    expect(await activeAdmins()).toBe(2);
    expect((await lock(c.cookies[0], admin.user.user_id)).status).toBe(200); // C khoá A (còn C)
    expect(await activeAdmins()).toBe(1);
    // A đã bị thu hồi phiên: không thao tác được nữa
    expect((await lock(A(), c.u.user_id)).status).toBe(401);
    expect((await lock(c.cookies[0], c.u.user_id)).body.error.code).toBe('self-change');
    expect(await activeAdmins()).toBe(1);
  });

  it('lưới cuối last-admin: nếu đếm admin khác thấy 0 thì khoá / hạ admin bị chặn 409, không đổi gì', async () => {
    await fresh();
    const b = await staffWithSessions('admin', 1);
    vi.spyOn(staffQuery, 'countOtherActiveAdmins').mockResolvedValue(0);
    const l = await lock(A(), b.u.user_id);
    expect(l.status).toBe(409);
    expect(l.body.error.code).toBe('last-admin');
    const d = await setRole(A(), b.u.user_id, 'staff');
    expect(d.status).toBe(409);
    expect(d.body.error.code).toBe('last-admin');
    expect(await countEvents()).toBe(0);
    expect(await dbUser(b.u.user_id)).toMatchObject({ role: 'admin', isActive: true });
    expect(await prisma.session.count({ where: { userId: b.u.user_id, revoked_at: null } })).toBe(1);
    // hạ staff -> staff hay khoá staff không đi qua kiểm tra này
    const s = await makeStaff({ role: 'staff' });
    expect((await lock(A(), s.user_id)).status).toBe(200);
  });
});

describe('T-USR-47 AC-USR-28 (nhân viên): lỗi giữa chừng không đổi gì', () => {
  it('lỗi ở bước thu hồi phiên: vai trò / is_active không đổi, không dòng nhật ký; lỗi ở bước ghi nhật ký cũng vậy', async () => {
    await fresh();
    const { u, cookies } = await staffWithSessions('staff', 2);
    vi.spyOn(sessionService, 'revokeAllUserSessions').mockRejectedValueOnce(new Error('injected'));
    const r = await lock(A(), u.user_id);
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('unavailable');
    assertNoSecrets(r);
    expect(await dbUser(u.user_id)).toMatchObject({ isActive: true, role: 'staff' });
    expect(await countEvents()).toBe(0);
    for (const c of cookies) expect((await uGet('/customers', c)).status).toBe(200);

    vi.spyOn(sessionService, 'revokeAllUserSessions').mockRejectedValueOnce(new Error('injected'));
    expect((await setRole(A(), u.user_id, 'admin')).status).toBe(500);
    expect((await dbUser(u.user_id)).role).toBe('staff');

    vi.spyOn(accountEvent, 'insertAccountEvent').mockRejectedValueOnce(new Error('injected'));
    expect((await setRole(A(), u.user_id, 'admin')).status).toBe(500);
    expect((await dbUser(u.user_id)).role).toBe('staff');
    expect(await prisma.session.count({ where: { userId: u.user_id, revoked_at: null } })).toBe(2);
    expect(await countEvents()).toBe(0);
    expect((await setRole(A(), u.user_id, 'admin')).status).toBe(200);
  });
});

describe('T-USR-44 AC-USR-40: hai admin thao tác đồng thời không để lại 0 admin (x20)', () => {
  it('A, A2 là admin hoạt động duy nhất: hạ chéo / khoá chéo / hỗn hợp song song, 20 lần', async () => {
    await fresh();
    const a2 = await makeStaff({ email: 'a2-t44@nine2fine.test', role: 'admin' });
    let successes = 0;
    let blocked = 0;
    for (let i = 0; i < 20; i++) {
      await prisma.user.updateMany({ where: { user_id: { in: [admin.user.user_id, a2.user_id] } }, data: { role: 'admin', isActive: true } });
      await prisma.accountEvent.deleteMany({});
      resetCheckoutRateLimits();
      const ca = await loginAdminAgain(admin.email);
      const cb = await loginAdminAgain(a2.email);
      const variant = i % 3;
      const op = (cookie: string, id: string, kind: 'demote' | 'lock') => (kind === 'demote' ? setRole(cookie, id, 'staff', 'Cân bằng quyền') : lock(cookie, id, 'Khoá chéo thử nghiệm'));
      const kinds: Array<['demote' | 'lock', 'demote' | 'lock']> = [['demote', 'demote'], ['lock', 'lock'], ['demote', 'lock']];
      const [k1, k2] = kinds[variant];
      const rs = await Promise.all([op(ca, a2.user_id, k1), op(cb, admin.user.user_id, k2)]);
      for (const r of rs) expect([200, 401, 409]).toContain(r.status);
      for (const r of rs.filter((x) => x.status === 409)) expect(r.body.error.code).toBe('last-admin');
      for (const r of rs.filter((x) => x.status === 401)) expect(r.body.error.code).toBe('unauthenticated');
      const ok = rs.filter((r) => r.status === 200).length;
      successes += ok;
      blocked += rs.length - ok;
      expect(ok).toBeLessThanOrEqual(1);
      expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
      expect(await countEvents()).toBe(ok);
      for (const r of rs) assertNoSecrets(r);
    }
    expect(successes).toBeGreaterThan(0);
    expect(successes + blocked).toBe(40);
    // sau chuỗi đua vẫn khôi phục được: A đăng nhập lại, đặt A2 lên admin
    await prisma.user.updateMany({ where: { user_id: { in: [admin.user.user_id, a2.user_id] } }, data: { role: 'admin', isActive: true } });
    expect(await activeAdmins()).toBe(2);
  });

  it('hai admin khoá cùng một nhân viên: 1 dòng nhật ký, cả hai 200', async () => {
    await fresh();
    const a2 = await staffWithSessions('admin', 1);
    for (let i = 0; i < 5; i++) {
      const t = await makeStaff({ role: 'staff' });
      const rs = await Promise.all([lock(A(), t.user_id), lock(a2.cookies[0], t.user_id)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.accountEvent.count({ where: { targetUserId: t.user_id, action: 'locked' } })).toBe(1);
    }
  });
});
