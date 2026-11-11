import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { setMailTransport } from '../src/mail/mailer';
import {
  advance, assertNoSecrets, cookieFrom, countEvents, flushMail, freshIp, loginAdmin, loginAdminAgain, loginStaff, makeMember, makeStaff, mails, newKey,
  post, resetState, sendCode, uGet, uPost, useClock,
} from './helpers';

/** Lát 7.4: danh sách nhân viên + tạo không mật khẩu. T-USR-30..35 ↔ AC-USR-31..36, 06 (tạo), BR-USR-03. */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
const A = () => admin.cookie;
const S = () => staff.cookie;

beforeAll(async () => {
  await resetState();
  admin = await loginAdmin('admin-s@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-s@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(() => {
  resetCheckoutRateLimits();
  vi.useRealTimers();
  mails.length = 0;
  setMailTransport({
    async send(msg) {
      mails.push(msg);
    },
  });
});

const create = (body: unknown, cookie = A(), key: string | null = newKey()) => uPost('/staff', body, cookie, key === null ? undefined : { 'Idempotency-Key': key });
const row = (email: string) => prisma.user.findUnique({ where: { email } });

describe('T-USR-30 AC-USR-31: danh sách nhân viên', () => {
  it('chỉ A, A2, S, N (kể cả N khoá); đủ trường; lastActiveAt = last_used_at lớn nhất (cả phiên đã thu hồi); passwordSet; sắp createdAt tăng', async () => {
    await makeMember({ email: 'khach-ds@example.com' });
    const a2 = await makeStaff({ email: 'a2-s@nine2fine.test', role: 'admin', firstName: 'Hai', lastName: 'Quản Trị' });
    const n = await makeStaff({ email: 'n-s@nine2fine.test', role: 'staff', passwordHash: null, isActive: false, firstName: 'Nga', lastName: 'Đỗ' });
    const base = Date.parse('2026-01-01T00:00:00Z');
    for (const [i, id] of [admin.user.user_id, staff.user.user_id, a2.user_id, n.user_id].entries()) {
      await prisma.user.update({ where: { user_id: id }, data: { createdAt: new Date(base + i * 1000) } });
    }
    // S có thêm một phiên thứ hai, đã thu hồi, dùng gần nhất.
    await loginAdminAgain(staff.email);
    const sess = await prisma.session.findMany({ where: { userId: staff.user.user_id }, orderBy: { createdAt: 'asc' } });
    expect(sess).toHaveLength(2);
    const t1 = new Date('2026-03-01T01:00:00Z');
    const t2 = new Date('2026-03-02T02:00:00Z');
    await prisma.session.update({ where: { session_id: sess[0].session_id }, data: { last_used_at: t1 } });
    await prisma.session.update({ where: { session_id: sess[1].session_id }, data: { last_used_at: t2, revoked_at: new Date(), revoke_reason: 'logout' } });

    const r = await uGet('/staff', A());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    assertNoSecrets(r);
    expect(r.body.map((m: { email: string }) => m.email)).toEqual(['admin-s@nine2fine.test', 'staff-s@nine2fine.test', 'a2-s@nine2fine.test', 'n-s@nine2fine.test']);
    const by = Object.fromEntries(r.body.map((m: { email: string }) => [m.email, m]));
    expect(by['admin-s@nine2fine.test']).toMatchObject({ name: 'Trị Quản', role: 'admin', status: 'active', passwordSet: true, id: admin.user.user_id });
    expect(by['staff-s@nine2fine.test']).toMatchObject({ role: 'staff', lastActiveAt: t2.toISOString() });
    expect(by['a2-s@nine2fine.test']).toMatchObject({ role: 'admin', lastActiveAt: null, name: 'Quản Trị Hai' });
    expect(by['n-s@nine2fine.test']).toMatchObject({ status: 'disabled', passwordSet: false, lastActiveAt: null, name: 'Đỗ Nga' });
    expect(Object.keys(by['n-s@nine2fine.test']).sort()).toEqual(['createdAt', 'email', 'id', 'lastActiveAt', 'name', 'passwordSet', 'role', 'status']);
    expect(by['n-s@nine2fine.test'].createdAt).toBe(new Date(base + 3000).toISOString());
    expect(r.text).not.toContain('khach-ds@example.com');
  });
});

describe('T-USR-31 AC-USR-32: tạo nhân viên không mật khẩu', () => {
  it('201, email chữ thường đã cắt, password_hash NULL, 1 dòng staff-created, đúng 1 thư (vai trò + hướng dẫn, không mã / mật khẩu)', async () => {
    const r = await create({ name: '  Trần   Thu Hà ', email: '  Ha.Tran@Nine2fine.test ', role: 'staff' });
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(r.headers['idempotency-replayed']).toBeUndefined();
    assertNoSecrets(r);
    expect(r.body).toMatchObject({ name: 'Trần Thu Hà', email: 'ha.tran@nine2fine.test', role: 'staff', status: 'active', passwordSet: false, lastActiveAt: null });
    expect(Object.keys(r.body).sort()).toEqual(['createdAt', 'email', 'id', 'lastActiveAt', 'name', 'passwordSet', 'role', 'status']);
    const u = (await row('ha.tran@nine2fine.test'))!;
    expect(u).toMatchObject({ passwordHash: null, role: 'staff', isActive: true, firstName: 'Hà', lastName: 'Trần Thu', marketingOptIn: false });
    const rawHash = await prisma.$queryRaw<Array<{ n: boolean }>>`SELECT password_hash IS NULL AS n FROM users WHERE user_id = ${u.user_id}::uuid`;
    expect(rawHash[0].n).toBe(true);
    const events = await prisma.accountEvent.findMany({ where: { targetUserId: u.user_id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'staff-created', roleBefore: null, roleAfter: 'staff', sessionsRevoked: 0, reason: '', actorUserId: admin.user.user_id,
      targetEmail: 'ha.tran@nine2fine.test', targetName: 'Trần Thu Hà', targetRole: 'staff',
    });
    await flushMail();
    const sent = mails.filter((m) => m.to === 'ha.tran@nine2fine.test');
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Nhân viên');
    expect(sent[0].text).toContain('/auth/forgot-password');
    expect(sent[0].text).toContain('/admin/login');
    expect(sent[0].text).not.toMatch(/\d{8}/);
    expect(sent[0].text).not.toMatch(/mật khẩu (là|:)/i);
    expect((await uGet('/staff', A())).body.map((m: { email: string }) => m.email)).toContain('ha.tran@nine2fine.test');
  });

  it('admin: thư nêu "Quản trị viên"; tên một từ -> last_name rỗng, hiển thị lại đúng', async () => {
    const r = await create({ name: 'Linh', email: 'linh-s@nine2fine.test', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Linh', role: 'admin' });
    expect(await row('linh-s@nine2fine.test')).toMatchObject({ firstName: 'Linh', lastName: '', role: 'admin' });
    await flushMail();
    expect(mails.find((m) => m.to === 'linh-s@nine2fine.test')!.text).toContain('Quản trị viên');
    expect((await create({ name: 'An', email: 'an-s@nine2fine.test', role: 'staff' })).status).toBe(201); // 2 ký tự
  });
});

describe('T-USR-32 AC-USR-33: kiểm đầu vào và email trùng', () => {
  it('email sai / 255 ký tự, tên 1 / 101 ký tự, vai trò member / owner: 422 đúng field; email trùng (đổi hoa thường, của khách): 409', async () => {
    const m = await makeMember({ email: 'khach-dup@example.com' });
    const before = { users: await prisma.user.count(), events: await countEvents() };
    mails.length = 0;
    const longEmail = `${'a'.repeat(243)}@example.com`; // 255
    const cases: Array<[unknown, number, string, string?]> = [
      [{ name: 'Hà Nội', email: 'khong-hop-le', role: 'staff' }, 422, 'validation', 'email'],
      [{ name: 'Hà Nội', email: longEmail, role: 'staff' }, 422, 'validation', 'email'],
      [{ name: 'Hà Nội', role: 'staff' }, 422, 'validation', 'email'],
      [{ name: 'H', email: 'ok1@nine2fine.test', role: 'staff' }, 422, 'validation', 'name'],
      [{ name: 'x'.repeat(101), email: 'ok2@nine2fine.test', role: 'staff' }, 422, 'validation', 'name'],
      [{ email: 'ok3@nine2fine.test', role: 'staff' }, 422, 'validation', 'name'],
      [{ name: 'Hà Nội', email: 'ok4@nine2fine.test', role: 'member' }, 422, 'validation', 'role'],
      [{ name: 'Hà Nội', email: 'ok5@nine2fine.test', role: 'owner' }, 422, 'validation', 'role'],
      [{ name: 'Hà Nội', email: 'ok6@nine2fine.test' }, 422, 'validation', 'role'],
      [{ name: 'Hà Nội', email: staff.email.toUpperCase(), role: 'staff' }, 409, 'duplicate', 'email'],
      [{ name: 'Hà Nội', email: ` ${admin.email} `, role: 'admin' }, 409, 'duplicate', 'email'],
      [{ name: 'Hà Nội', email: m.email.toUpperCase(), role: 'staff' }, 409, 'duplicate', 'email'],
    ];
    for (const [body, status, code, field] of cases) {
      resetCheckoutRateLimits(); // giới hạn tạo đếm cả 409 / 422: đặt lại để kiểm từng ca
      const r = await create(body);
      expect([r.status, r.body.error.code, r.body.error.field]).toEqual([status, code, field]);
      assertNoSecrets(r);
    }
    expect((await create([1, 2])).status).toBe(422);
    await flushMail();
    expect({ users: await prisma.user.count(), events: await countEvents() }).toEqual(before);
    expect(mails).toHaveLength(0);
  });
});

describe('T-USR-33 AC-USR-34: lỗi gửi thư không làm hỏng việc tạo', () => {
  it('SMTP lỗi: 201, có nhật ký, không 500; sau khi hết lỗi N vẫn dùng "Quên mật khẩu"', async () => {
    setMailTransport({
      async send() {
        throw new Error('smtp down');
      },
    });
    const r = await create({ name: 'Nguyễn Hoa', email: 'hoa-s@nine2fine.test', role: 'staff' });
    await flushMail();
    expect(r.status).toBe(201);
    const u = (await row('hoa-s@nine2fine.test'))!;
    expect(await countEvents({ targetUserId: u.user_id, action: 'staff-created' })).toBe(1);

    setMailTransport({
      async send(msg) {
        mails.push(msg);
      },
    });
    const { code } = await sendCode('hoa-s@nine2fine.test', 'reset-password');
    expect(code).toMatch(/^\d{8}$/);
  });
});

describe('T-USR-34 AC-USR-35, 36: từ tài khoản chưa có mật khẩu tới đăng nhập admin', () => {
  it('đăng nhập bịa -> invalid-credentials; quên mật khẩu + mã; mật khẩu yếu rồi hợp lệ; mã hết hạn sau 11 phút; vào đúng vai trò', async () => {
    const email = 'luong-s@nine2fine.test';
    expect((await create({ name: 'Lương Gia', email, role: 'staff' })).status).toBe(201);
    const bogus = await post('/api/admin/auth/login', { email, password: 'Nine2fine1' }, { ip: freshIp() });
    expect(bogus.status).toBe(401);
    expect(bogus.body.error.code).toBe('invalid-credentials');
    const wrong = await post('/api/admin/auth/login', { email: admin.email, password: 'Sai-mat-khau1' }, { ip: freshIp() });
    expect(bogus.body).toEqual(wrong.body); // cùng thông điệp với sai mật khẩu: không lộ "chưa đặt mật khẩu"
    expect(cookieFrom(bogus, 'n2f_asid')).toBeUndefined();

    useClock(new Date().toISOString());
    const first = await sendCode(email, 'reset-password');
    expect(first.code).toMatch(/^\d{8}$/);
    advance(11 * 60_000);
    const expired = await post('/api/auth/password/reset', { email, code: first.code, newPassword: 'Nine2fine9' });
    expect(expired.status).toBe(422);
    expect(expired.body.error.code).toBe('invalid-code');
    const second = await sendCode(email, 'reset-password');
    expect(second.code).toMatch(/^\d{8}$/);
    const weak = await post('/api/auth/password/reset', { email, code: second.code, newPassword: 'yeu' });
    expect(weak.status).toBe(422);
    expect(weak.body.error).toMatchObject({ field: 'newPassword' });
    const ok = await post('/api/auth/password/reset', { email, code: second.code, newPassword: 'Nine2fine9' });
    expect(ok.status).toBe(204);
    const login = await post('/api/admin/auth/login', { email, password: 'Nine2fine9' }, { ip: freshIp() });
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login, 'n2f_asid')!;
    expect((await uGet('/customers', cookie)).status).toBe(200);
    expect((await uGet('/staff', cookie)).status).toBe(403); // staff
    expect((await row(email))!.passwordHash).not.toBeNull();
    expect((await uGet('/staff', A())).body.find((m: { email: string }) => m.email === email).passwordSet).toBe(true);
  });

  it('tài khoản bị khoá trước khi đặt mật khẩu: thư khoá, không có mã', async () => {
    const email = 'khoa-truoc-s@nine2fine.test';
    const r = await create({ name: 'Khoá Trước', email, role: 'staff' });
    expect((await uPost(`/staff/${r.body.id}/lock`, { reason: 'Tạo nhầm email' }, A())).status).toBe(200);
    mails.length = 0;
    const { code } = await sendCode(email, 'reset-password');
    expect(code).toBeUndefined();
    expect(mails.some((m) => m.to === email && /khóa/i.test(m.subject))).toBe(true);
  });

  it('tài khoản chưa có hash đăng nhập admin bằng mật khẩu bất kỳ: invalid-credentials (không lộ trạng thái)', async () => {
    const n = await makeStaff({ email: 'chua-hash@nine2fine.test', passwordHash: null });
    const r = await post('/api/admin/auth/login', { email: n.email, password: 'Nine2fine1' }, { ip: freshIp() });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('invalid-credentials');
  });
});

describe('T-USR-35 AC-USR-06 (tạo) / BR-USR-03: idempotency', () => {
  it('gửi lại cùng khoá -> 200 Idempotency-Replayed, 1 tài khoản, 1 dòng, 1 thư; khác thân -> 409; thiếu / sai dạng khoá -> 422', async () => {
    const body = { name: 'Phạm Đức', email: 'duc-s@nine2fine.test', role: 'staff' };
    const key = newKey();
    const first = await create(body, A(), key);
    expect(first.status).toBe(201);
    const replay = await create(body, A(), key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.headers['cache-control']).toMatch(/no-store/);
    expect(replay.body).toEqual(first.body);
    await flushMail();
    expect(await prisma.user.count({ where: { email: 'duc-s@nine2fine.test' } })).toBe(1);
    expect(await countEvents({ targetEmail: 'duc-s@nine2fine.test' })).toBe(1);
    expect(mails.filter((m) => m.to === 'duc-s@nine2fine.test')).toHaveLength(1);

    const clash = await create({ ...body, role: 'admin' }, A(), key);
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('idempotency-conflict');
    expect((await row('duc-s@nine2fine.test'))!.role).toBe('staff');

    for (const k of [null, 'short', 'bad key with spaces!!!!!']) {
      const r = await create({ ...body, email: 'khac-s@nine2fine.test' }, A(), k);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'Idempotency-Key' });
    }
    expect(await row('khac-s@nine2fine.test')).toBeNull();
  });

  it('hai yêu cầu cùng khoá song song: 1 tài khoản, 1 thư; cùng email khác khoá: 1 thành công, bên kia 409 duplicate (không 500)', async () => {
    for (let i = 0; i < 5; i++) {
      resetCheckoutRateLimits();
      const email = `par${i}-s@nine2fine.test`;
      const k = newKey();
      const same = await Promise.all([create({ name: 'Song Song', email, role: 'staff' }, A(), k), create({ name: 'Song Song', email, role: 'staff' }, A(), k)]);
      expect(same.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      const email2 = `par${i}b-s@nine2fine.test`;
      const diff = await Promise.all([create({ name: 'Song Song', email: email2, role: 'staff' }), create({ name: 'Song Song', email: email2, role: 'admin' })]);
      expect(diff.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(diff.find((r) => r.status === 409)!.body.error).toMatchObject({ code: 'duplicate', field: 'email' });
      expect(await countEvents({ targetEmail: email2 })).toBe(1);
    }
    await flushMail();
  });
});
