import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/prisma';
import { logger } from '../src/lib/logger';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import * as accountEvent from '../src/modules/users-admin/account-event';
import {
  A as CRED, assertNoSecrets, countEvents, flushMail, freshIp, get, loginAdmin, loginMemberAgain, loginPassword, loginStaff, makeMember, makeOrder, makeStaff,
  mails, newKey, orderBody, resetCheckout, resetState, sendCode, submitOrder, uGet, uPost, vid,
} from './helpers';

/** Lát 7.3: khoá / mở khách + lõi dùng chung. T-USR-20..25 ↔ AC-USR-22..25, 28, 05 (BE). */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
const A = () => admin.cookie;
const S = () => staff.cookie;
const REASON = 'Hoàn hàng gian lận lặp lại';

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-l@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-l@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(() => {
  resetCheckoutRateLimits();
  vi.restoreAllMocks();
  mails.length = 0;
});

let seq = 0;
async function memberWithSessions(n = 2) {
  const u = await makeMember({ email: `lock${++seq}@example.com`, firstName: `Khoá${seq}`, lastName: 'Thử', password: CRED.password });
  const cookies: string[] = [];
  for (let i = 0; i < n; i++) cookies.push((await loginMemberAgain(u.email))!);
  return { u, cookies };
}
const profile = (cookie: string) => get('/api/account/profile', { cookie, ip: freshIp() });

describe('T-USR-20 AC-USR-22: khoá khách thu hồi mọi phiên trong cùng giao dịch', () => {
  it('2 phiên: 200, is_active=false, 2 phiên account-disabled, 1 dòng locked (sessions_revoked 2); cả hai máy 401; không thư', async () => {
    const { u, cookies } = await memberWithSessions(2);
    for (const c of cookies) expect((await profile(c)).status).toBe(200);
    const spy = vi.spyOn(logger, 'info');
    const r = await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(r.body).toMatchObject({ id: u.user_id, status: 'blocked', contactMasked: false });
    assertNoSecrets(r);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: u.user_id } })).isActive).toBe(false);
    const sessions = await prisma.session.findMany({ where: { userId: u.user_id } });
    expect(sessions).toHaveLength(2);
    for (const s of sessions) expect(s).toMatchObject({ revoke_reason: 'account-disabled' });
    for (const s of sessions) expect(s.revoked_at).not.toBeNull();
    const events = await prisma.accountEvent.findMany({ where: { targetUserId: u.user_id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'locked', reason: REASON, sessionsRevoked: 2, actorUserId: admin.user.user_id, actorName: 'Trị Quản', actorRole: 'admin',
      targetEmail: u.email, targetRole: 'member', roleBefore: null, roleAfter: null,
    });
    for (const c of cookies) {
      const p = await profile(c);
      expect(p.status).toBe(401);
      expect(p.body.error.code).toBe('unauthenticated');
    }
    await flushMail();
    expect(mails).toHaveLength(0);
    // AC-USR-21: nhật ký ứng dụng không chứa lý do / email / tên
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of [REASON, u.email, 'Khoá']) expect(logged).not.toContain(leak);
  });

  it('staff không khoá được (403) và không đổi gì', async () => {
    const { u, cookies } = await memberWithSessions(1);
    const r = await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, S());
    expect(r.status).toBe(403);
    expect((await profile(cookies[0])).status).toBe(200);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(0);
  });

  it('khách chỉ khoá qua API khách: id nhân viên -> 404', async () => {
    const n = await makeStaff();
    expect((await uPost(`/customers/${n.user_id}/lock`, { reason: REASON }, A())).status).toBe(404);
    expect((await uPost(`/customers/${n.user_id}/unlock`, {}, A())).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: n.user_id } })).isActive).toBe(true);
  });
});

describe('T-USR-21 AC-USR-23: lý do 5..250, khoá lần hai, id lạ', () => {
  it('lý do 4 / 251 ký tự / thiếu / kiểu sai -> 422 reason; không thay đổi, không nhật ký', async () => {
    const { u, cookies } = await memberWithSessions(1);
    const bodies: unknown[] = [{ reason: 'abcd' }, { reason: 'x'.repeat(251) }, {}, { reason: 12345 }, { reason: '   ab   ' }, { reason: '' }, undefined];
    for (const b of bodies) {
      const r = await uPost(`/customers/${u.user_id}/lock`, b, A());
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'reason' });
    }
    expect((await uPost(`/customers/${u.user_id}/lock`, [1], A())).status).toBe(422);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(0);
    expect((await profile(cookies[0])).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: u.user_id } })).isActive).toBe(true);
  });

  it('5 và 250 ký tự hợp lệ; chuẩn hoá khoảng trắng; khoá lần hai 200 không dòng mới; id lạ 404', async () => {
    const a = await makeMember({ email: 'edge1@example.com' });
    const b = await makeMember({ email: 'edge2@example.com' });
    expect((await uPost(`/customers/${a.user_id}/lock`, { reason: ' abcde ' }, A())).status).toBe(200);
    expect((await uPost(`/customers/${b.user_id}/lock`, { reason: 'ạ'.repeat(250) }, A())).status).toBe(200);
    const norm = await makeMember({ email: 'edge3@example.com' });
    await uPost(`/customers/${norm.user_id}/lock`, { reason: '  Hoàn\n  hàng   lặp   lại  ' }, A());
    expect((await prisma.accountEvent.findFirstOrThrow({ where: { targetUserId: norm.user_id } })).reason).toBe('Hoàn hàng lặp lại');
    expect((await prisma.accountEvent.findFirstOrThrow({ where: { targetUserId: a.user_id } })).reason).toBe('abcde');
    const again = await uPost(`/customers/${a.user_id}/lock`, { reason: 'Lý do khác lần hai' }, A());
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('blocked');
    expect(await countEvents({ targetUserId: a.user_id })).toBe(1);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'abc']) {
      expect((await uPost(`/customers/${id}/lock`, { reason: REASON }, A())).status).toBe(404);
    }
  });
});

describe('T-USR-22 AC-USR-24: khách bị khoá', () => {
  it('đăng nhập mật khẩu / mã bị từ chối + thư khoá; đặt lại mật khẩu không có mã; đặt hàng vãng lai bằng email đó vẫn được; đơn đang xử lý không đổi', async () => {
    const { u } = await memberWithSessions(1);
    const o2 = await makeOrder({ userId: u.user_id, email: u.email, status: 'to_ship' });
    expect((await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A())).status).toBe(200);

    const pw = await loginPassword(u.email, CRED.password, freshIp());
    expect(pw.status).toBe(403);
    expect(pw.body.error.code).toBe('account-disabled');

    mails.length = 0;
    const login = await sendCode(u.email, 'login');
    expect(login.code).toBeUndefined();
    expect(mails.some((m) => m.to === u.email && /khóa/i.test(m.subject))).toBe(true);
    mails.length = 0;
    const reset = await sendCode(u.email, 'reset-password');
    expect(reset.code).toBeUndefined();
    expect(mails.every((m) => !/: \d{6}/.test(m.text))).toBe(true);

    const items = [{ variantId: await vid('off-duty-top', 'Trắng', 'S'), quantity: 1 }];
    const placed = await submitOrder(await orderBody(items, { email: u.email, phone: '0911000222' }));
    expect(placed.status).toBe(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: o2.code } })).status).toBe('to_ship');
  });
});

describe('T-USR-23 AC-USR-25: mở khoá', () => {
  it('có / không lý do, 1 dòng unlocked mỗi lần; đăng nhập lại được; cookie cũ vẫn 401; mở lần hai 200 không dòng', async () => {
    const { u, cookies } = await memberWithSessions(1);
    await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A());
    const un = await uPost(`/customers/${u.user_id}/unlock`, { reason: 'Đã xác minh với khách' }, A());
    expect(un.status).toBe(200);
    expect(un.body.status).toBe('active');
    expect(await prisma.accountEvent.count({ where: { targetUserId: u.user_id, action: 'unlocked' } })).toBe(1);
    expect((await prisma.accountEvent.findFirstOrThrow({ where: { action: 'unlocked', targetUserId: u.user_id } })).reason).toBe('Đã xác minh với khách');
    expect((await profile(cookies[0])).status).toBe(401); // phiên đã thu hồi không được khôi phục
    const fresh = await loginMemberAgain(u.email);
    expect(fresh).toBeDefined();
    expect((await profile(fresh!)).status).toBe(200);
    const again = await uPost(`/customers/${u.user_id}/unlock`, {}, A());
    expect(again.status).toBe(200);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(2);
    // khoá lần nữa rồi mở không thân / không lý do
    await uPost(`/customers/${u.user_id}/lock`, { reason: 'Khoá lần hai vì lý do khác' }, A());
    const bare = await uPost(`/customers/${u.user_id}/unlock`, undefined, A());
    expect(bare.status).toBe(200);
    const last = await prisma.accountEvent.findFirstOrThrow({ where: { action: 'unlocked', targetUserId: u.user_id }, orderBy: { at: 'desc' } });
    expect(last.reason).toBe('');
    expect((await uPost(`/customers/${u.user_id}/unlock`, { reason: 'y'.repeat(251) }, A())).body.error).toMatchObject({ code: 'validation', field: 'reason' });
  });
});

describe('T-USR-24 AC-USR-28: lỗi giữa chừng không đổi gì', () => {
  it('giả lỗi khi ghi nhật ký: 500, is_active vẫn true, không dòng, phiên không thu hồi', async () => {
    const { u, cookies } = await memberWithSessions(2);
    vi.spyOn(accountEvent, 'insertAccountEvent').mockRejectedValueOnce(new Error('injected'));
    const r = await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A());
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('unavailable');
    assertNoSecrets(r);
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: u.user_id } })).isActive).toBe(true);
    expect(await countEvents({ targetUserId: u.user_id })).toBe(0);
    expect(await prisma.session.count({ where: { userId: u.user_id, revoked_at: null } })).toBe(2);
    for (const c of cookies) expect((await profile(c)).status).toBe(200);
    // sau khi hết lỗi thao tác chạy bình thường
    expect((await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A())).status).toBe(200);
  });
});

describe('T-USR-25 AC-USR-05 (BE): bấm lại không thêm dòng nhật ký', () => {
  it('cùng khoá -> phát lại 200 Idempotency-Replayed; khoá khác / không khoá -> 200 không dòng; khoá dùng lại cho thao tác khác -> 409', async () => {
    const { u } = await memberWithSessions(1);
    const k = newKey();
    const first = await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A(), { 'Idempotency-Key': k });
    expect(first.status).toBe(200);
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    const replay = await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A(), { 'Idempotency-Key': k });
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect((await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A(), { 'Idempotency-Key': newKey() })).status).toBe(200);
    expect((await uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A())).status).toBe(200);
    expect(await prisma.accountEvent.count({ where: { targetUserId: u.user_id, action: 'locked' } })).toBe(1);

    const other = await makeMember({ email: 'key-other@example.com' });
    const clash = await uPost(`/customers/${other.user_id}/lock`, { reason: REASON }, A(), { 'Idempotency-Key': k });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('idempotency-conflict');
    expect((await prisma.user.findUniqueOrThrow({ where: { user_id: other.user_id } })).isActive).toBe(true);
    expect((await uPost(`/customers/${other.user_id}/lock`, { reason: REASON }, A(), { 'Idempotency-Key': 'short' })).body.error).toMatchObject({ code: 'validation', field: 'Idempotency-Key' });
  });

  it('hai yêu cầu khoá đồng thời một khách: đúng 1 dòng nhật ký', async () => {
    for (let i = 0; i < 5; i++) {
      const u = await makeMember({ email: `race-lock${i}@example.com` });
      const rs = await Promise.all([
        uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A()),
        uPost(`/customers/${u.user_id}/lock`, { reason: REASON }, A()),
      ]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.accountEvent.count({ where: { targetUserId: u.user_id, action: 'locked' } })).toBe(1);
    }
    // đọc nhanh để chắc chắn staff vẫn xem được khách bị khoá
    expect((await uGet('/customers?view=blocked', S())).status).toBe(200);
  });
});

