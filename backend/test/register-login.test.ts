import { beforeEach, describe, expect, it } from 'vitest';
import {
  A, N, P, X, advance, cookieFrom, createUser, freshIp, loginPassword, post, prisma, resetState, sendCode, useClock,
  wrongCode, get,
} from './helpers';

beforeEach(async () => {
  await resetState();
  await createUser({ email: A.email, password: A.password });
  await createUser({ email: P.email });
  await createUser({ email: X.email, password: X.password, isActive: false });
});

const reg = (code: string | undefined, extra: Record<string, unknown> = {}, email = N.email) =>
  post('/api/auth/register', {
    email, code, firstName: 'Minh', lastName: 'Nguyễn Văn', birthDate: null, marketingOptIn: false, acceptedTerms: true,
    ...extra,
  });

describe('register', () => {
  it('AC-AUTH-27: thiếu tên / họ / điều khoản -> 422 validation theo từng trường, mã không bị tiêu', async () => {
    const { code } = await sendCode(N.email, 'register');
    const t = await reg(code, { firstName: '', lastName: '', acceptedTerms: false });
    expect(t.status).toBe(422);
    expect(t.body.error).toMatchObject({ code: 'validation', field: 'firstName' });
    const l = await reg(code, { lastName: '   ' });
    expect(l.body.error).toMatchObject({ field: 'lastName' });
    const a = await reg(code, { acceptedTerms: false });
    expect(a.body.error).toMatchObject({ field: 'acceptedTerms', message: 'Bạn cần đồng ý để tạo tài khoản.' });
    expect((await reg(code)).status).toBe(201); // mã vẫn dùng được
  });

  it('AC-AUTH-28: tên rỗng / 51 ký tự / có số / thẻ HTML bị từ chối', async () => {
    const { code } = await sendCode(N.email, 'register');
    for (const firstName of ['   ', 'a'.repeat(51), 'Minh2', '<b>']) {
      const r = await reg(code, { firstName });
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'firstName' });
    }
    expect((await reg(code, { firstName: "O'Neil-Võ" })).status).toBe(201);
  });

  it('AC-AUTH-29/39/BR-AUTH-15: chuẩn hoá tên, tạo member + 1 phiên method=register + cookie', async () => {
    const { code } = await sendCode(N.email, 'register');
    const r = await reg(code, { firstName: '  Minh ', lastName: 'Nguyễn   Văn', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: N.email, firstName: 'Minh', lastName: 'Nguyễn Văn', role: 'member' });
    expect(Object.keys(r.body).sort()).toEqual(['email', 'firstName', 'id', 'lastName', 'role']);
    const u = await prisma.user.findUnique({ where: { email: N.email } });
    expect(u).toMatchObject({ firstName: 'Minh', lastName: 'Nguyễn Văn', role: 'member', isActive: true, passwordHash: null });
    const sessions = await prisma.session.findMany({ where: { userId: u!.user_id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].login_method).toBe('register'); // AC-AUTH-61
    expect(cookieFrom(r, 'n2f_sid')).toBeTruthy();
    // không có mật khẩu: đăng nhập mật khẩu bất kỳ -> invalid-credentials
    expect((await loginPassword(N.email, 'Whatever1')).body.error.code).toBe('invalid-credentials');
  });

  it('AC-AUTH-83: trường role = admin bị bỏ qua', async () => {
    const { code } = await sendCode(N.email, 'register');
    const r = await reg(code, { role: 'admin' });
    expect(r.body.role).toBe('member');
  });

  it('AC-AUTH-31: bỏ trống ngày sinh vẫn đăng ký được (null hoặc thiếu trường)', async () => {
    const { code } = await sendCode(N.email, 'register');
    const body = { email: N.email, code, firstName: 'Minh', lastName: 'Văn', acceptedTerms: true };
    expect((await post('/api/auth/register', body)).status).toBe(201);
    expect((await prisma.user.findUnique({ where: { email: N.email } }))!.dateOfBirth).toBeNull();
  });

  it('AC-AUTH-32: ngày sinh không hợp lệ -> 422 validation field birthDate, mã chưa tiêu', async () => {
    useClock('2026-11-07T05:00:00Z');
    const { code } = await sendCode(N.email, 'register');
    for (const birthDate of ['2000-02-31', '1899-01-01', '2026-11-08', '2026-11-07', '2000', '07/11/2000', 'abc']) {
      const r = await reg(code, { birthDate });
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'birthDate' });
    }
    expect((await reg(code, { birthDate: '1900-01-01' })).status).toBe(201);
  });

  it('AC-AUTH-32a/32b: đúng 13 tuổi hôm nay (giờ VN) ok; thiếu 1 ngày -> underage, không tạo tài khoản', async () => {
    useClock('2026-11-07T05:00:00Z');
    const { code } = await sendCode(N.email, 'register');
    const under = await reg(code, { birthDate: '2013-11-08' });
    expect(under.status).toBe(422);
    expect(under.body.error).toMatchObject({ code: 'underage', field: 'birthDate' });
    expect(await prisma.user.findUnique({ where: { email: N.email } })).toBeNull();
    expect((await reg(code, { birthDate: '2013-11-07' })).status).toBe(201);
  });

  it('AC-AUTH-32 (giờ VN): 18:00 UTC ngày 6/11 đã là 7/11 ở Việt Nam', async () => {
    useClock('2026-11-06T18:00:00Z');
    const { code } = await sendCode(N.email, 'register');
    expect((await reg(code, { birthDate: '2013-11-07' })).status).toBe(201);
  });

  it('AC-AUTH-33: acceptedTerms false / thiếu -> 422 validation, không có tài khoản', async () => {
    const { code } = await sendCode(N.email, 'register');
    expect((await reg(code, { acceptedTerms: false })).body.error.code).toBe('validation');
    const noField = await post('/api/auth/register', { email: N.email, code, firstName: 'Minh', lastName: 'Văn' });
    expect(noField.body.error).toMatchObject({ code: 'validation', field: 'acceptedTerms' });
    expect(await prisma.user.count({ where: { email: N.email } })).toBe(0);
  });

  it('AC-AUTH-34/36: thời điểm đồng ý điều khoản; marketing có / không kèm thời điểm', async () => {
    const n1 = 'n1@example.com';
    const n2 = 'n2@example.com';
    const c1 = await sendCode(n1, 'register', freshIp());
    const c2 = await sendCode(n2, 'register', freshIp());
    const before = Date.now();
    await reg(c1.code, { marketingOptIn: true }, n1);
    await reg(c2.code, { marketingOptIn: false }, n2);
    const u1 = (await prisma.user.findUnique({ where: { email: n1 } }))!;
    const u2 = (await prisma.user.findUnique({ where: { email: n2 } }))!;
    expect(Math.abs(u1.terms_accepted_at.getTime() - before)).toBeLessThan(5000);
    expect(u1.marketingOptIn).toBe(true);
    expect(u1.marketingOptInAt).not.toBeNull();
    expect(u2.marketingOptIn).toBe(false);
    expect(u2.marketingOptInAt).toBeNull();
  });

  it('AC-AUTH-37: 2 yêu cầu đồng thời cùng mã -> đúng 1 tài khoản, không 500', async () => {
    const { code } = await sendCode(N.email, 'register');
    const [a, b] = await Promise.all([reg(code), reg(code)]);
    expect(a.status === 201 || b.status === 201).toBe(true);
    for (const r of [a, b]) expect(r.status).toBeLessThan(500);
    expect(await prisma.user.count({ where: { email: N.email } })).toBe(1);
  });

  it('AC-AUTH-37b: mã hợp lệ nhưng email đã có tài khoản (tạo xen giữa) -> 409 email-registered', async () => {
    const { code } = await sendCode(N.email, 'register');
    await createUser({ email: N.email });
    const r = await reg(code);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('email-registered');
    expect(await prisma.user.count({ where: { email: N.email } })).toBe(1);
  });

  it('AC-AUTH-38: email A đã tồn tại + mã bất kỳ -> invalid-code (không lộ email-registered)', async () => {
    const r = await reg('12345678', {}, A.email);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('invalid-code');
  });

  it('mã đăng ký sai -> invalid-code; mã sai không tạo tài khoản', async () => {
    const { code } = await sendCode(N.email, 'register');
    const r = await reg(wrongCode(code));
    expect(r.body.error.code).toBe('invalid-code');
    expect(await prisma.user.count({ where: { email: N.email } })).toBe(0);
  });
});

describe('login with code', () => {
  it('AC-AUTH-40/61: mã đúng -> 200 AuthUser + cookie + 1 phiên method=otp', async () => {
    const { code } = await sendCode(A.email, 'login');
    const r = await post('/api/auth/login/code', { email: ' Minh@Example.com', code });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ email: A.email, role: 'member' });
    expect(cookieFrom(r, 'n2f_sid')).toBeTruthy();
    const s = await prisma.session.findMany();
    expect(s).toHaveLength(1);
    expect(s[0].login_method).toBe('otp');
  });

  it('AC-AUTH-61: đăng nhập thất bại không tạo phiên', async () => {
    await post('/api/auth/login/code', { email: A.email, code: '12345678' });
    await loginPassword(A.email, 'Sai1');
    expect(await prisma.session.count()).toBe(0);
  });

  it('AC-AUTH-26/BR-AUTH-19: tài khoản bị vô hiệu + mã đúng -> 403 account-disabled kèm email hỗ trợ, không phiên', async () => {
    // mã được phát trước khi bị vô hiệu
    const u = await createUser({ email: 'later@example.com' });
    const { code } = await sendCode('later@example.com', 'login');
    await prisma.user.update({ where: { user_id: u.user_id }, data: { isActive: false } });
    const r = await post('/api/auth/login/code', { email: 'later@example.com', code });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('account-disabled');
    expect(r.body.error.message).toContain('support@example.test');
    expect(await prisma.session.count()).toBe(0);
  });

  it('AC-AUTH-45: đăng nhập bằng mã gỡ khoá mật khẩu', async () => {
    for (let i = 0; i < 5; i++) await loginPassword(A.email, 'Sai-sai1');
    expect((await loginPassword(A.email, A.password)).status).toBe(429);
    const { code } = await sendCode(A.email, 'login');
    expect((await post('/api/auth/login/code', { email: A.email, code })).status).toBe(200);
    expect((await loginPassword(A.email, A.password)).status).toBe(200);
  });
});

describe('login with password', () => {
  it('AC-AUTH-42: A sai hoa thường, N, P -> cùng 401 invalid-credentials, cùng thông điệp', async () => {
    const rs = [
      await loginPassword(A.email, 'nine2fine1', freshIp()),
      await loginPassword(N.email, 'Nine2fine1', freshIp()),
      await loginPassword(P.email, 'Nine2fine1', freshIp()),
    ];
    for (const r of rs) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual(rs[0].body);
      expect(r.body.error.code).toBe('invalid-credentials');
    }
  });

  it('AC-AUTH-43: khoảng trắng đầu mật khẩu -> sai; mật khẩu đúng -> 200', async () => {
    expect((await loginPassword(A.email, ' Nine2fine1')).status).toBe(401);
    const ok = await loginPassword(A.email, A.password);
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain('hash');
    expect((await prisma.session.findMany())[0].login_method).toBe('password');
  });

  it('AC-AUTH-44: sai lần 5 -> 429 password-locked; mật khẩu đúng cũng bị từ chối; không phiên', async () => {
    for (let i = 0; i < 4; i++) expect((await loginPassword(A.email, 'Sai-sai1')).status).toBe(401);
    const fifth = await loginPassword(A.email, 'Sai-sai1');
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('password-locked');
    expect(fifth.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(fifth.headers['retry-after']).toBeDefined();
    const right = await loginPassword(A.email, A.password);
    expect(right.status).toBe(429);
    expect(await prisma.session.count()).toBe(0);
  });

  it('AC-AUTH-46: sai 4 lần, chờ 16 phút, sai thêm 1 lần -> không khoá', async () => {
    useClock('2026-11-07T10:00:00Z');
    for (let i = 0; i < 4; i++) await loginPassword(A.email, 'Sai-sai1');
    advance(16 * 60 * 1000);
    expect((await loginPassword(A.email, 'Sai-sai1')).status).toBe(401);
    expect((await loginPassword(A.email, A.password)).status).toBe(200);
  });

  it('AC-AUTH-44b: hết khoá 15 phút thì dùng lại được', async () => {
    useClock('2026-11-07T10:00:00Z');
    for (let i = 0; i < 5; i++) await loginPassword(A.email, 'Sai-sai1');
    advance(15 * 60 * 1000 + 1000);
    expect((await loginPassword(A.email, A.password)).status).toBe(200);
  });

  it('AC-AUTH-47: N sai 5 lần -> lần 5 cùng thông báo khoá', async () => {
    for (let i = 0; i < 4; i++) expect((await loginPassword(N.email, 'Sai-sai1')).status).toBe(401);
    const fifth = await loginPassword(N.email, 'Sai-sai1');
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('password-locked');
  });

  it('AC-AUTH-48: 20 lần sai / 15 phút / IP với 20 email khác nhau -> email thứ 21 bị rate-limited', async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await loginPassword(`z${i}@example.com`, 'Sai-sai1', ip)).status).toBe(401);
    const r = await loginPassword('z99@example.com', 'Sai-sai1', ip);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate-limited');
  });

  it('AC-AUTH-49/50: X + mật khẩu sai -> invalid-credentials; X + đúng -> 403 account-disabled, không phiên', async () => {
    const bad = await loginPassword(X.email, 'Sai-sai1');
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid-credentials');
    const good = await loginPassword(X.email, X.password);
    expect(good.status).toBe(403);
    expect(good.body.error.code).toBe('account-disabled');
    expect(await prisma.session.count()).toBe(0);
  });

  it('mật khẩu lưu dạng băm, không phải dạng rõ (AC-AUTH-55)', async () => {
    const u = await prisma.user.findUnique({ where: { email: A.email } });
    expect(u!.passwordHash).not.toContain(A.password);
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('password reset', () => {
  const reset = (code: string | undefined, newPassword: string, email = A.email) =>
    post('/api/auth/password/reset', { email, code, newPassword });

  it('AC-AUTH-51: mật khẩu 7 ký tự / thiếu hoa / thiếu số / 65 ký tự -> 422 validation newPassword, mã chưa tiêu (AC-AUTH-53)', async () => {
    const { code } = await sendCode(A.email, 'reset-password');
    for (const pw of ['Abc1234', 'abcdefg1', 'ABCDEFGH', 'A1' + 'a'.repeat(63), 'abcdefgh']) {
      const r = await reset(code, pw);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'newPassword' });
    }
    expect((await loginPassword(A.email, A.password)).status).toBe(200); // mật khẩu cũ vẫn dùng được
    expect((await reset(code, 'Nine2fine9')).status).toBe(204); // mã còn nguyên
  });

  it('AC-AUTH-51b: mật khẩu trùng email (không phân biệt hoa thường) bị từ chối', async () => {
    await prisma.user.update({ where: { email: A.email }, data: { email: 'minh1@example.com' } });
    const { code } = await sendCode('minh1@example.com', 'reset-password');
    const r = await reset(code, 'MINH1@EXAMPLE.COM', 'minh1@example.com');
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'validation', field: 'newPassword' });
  });

  it('AC-AUTH-54: đúng 64 ký tự (có hoa + số) thành công và đăng nhập được', async () => {
    const pw = 'A1' + 'x'.repeat(62);
    expect(pw).toHaveLength(64);
    const { code } = await sendCode(A.email, 'reset-password');
    expect((await reset(code, pw)).status).toBe(204);
    expect((await loginPassword(A.email, pw)).status).toBe(200);
  });

  it('AC-AUTH-54b: mật khẩu Unicode dài > 72 byte vẫn so khớp toàn bộ', async () => {
    const pw = 'A1' + 'é'.repeat(40); // > 72 byte
    const { code } = await sendCode(A.email, 'reset-password');
    expect((await reset(code, pw)).status).toBe(204);
    expect((await loginPassword(A.email, pw)).status).toBe(200);
    expect((await loginPassword(A.email, pw + 'x', freshIp())).status).toBe(401);
  });

  it('AC-AUTH-56/BR-AUTH-22: đặt lại thu hồi mọi phiên, không tự đăng nhập, không Set-Cookie', async () => {
    const s1 = await loginPassword(A.email, A.password, freshIp());
    const s2 = await loginPassword(A.email, A.password, freshIp());
    const c1 = cookieFrom(s1, 'n2f_sid')!;
    const c2 = cookieFrom(s2, 'n2f_sid')!;
    const { code } = await sendCode(A.email, 'reset-password');
    const r = await reset(code, 'Nine2fine9');
    expect(r.status).toBe(204);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect((await get('/api/auth/me', { cookie: c1 })).body).toEqual({ user: null });
    expect((await get('/api/auth/me', { cookie: c2 })).body).toEqual({ user: null });
    expect((await loginPassword(A.email, A.password)).status).toBe(401);
    expect((await loginPassword(A.email, 'Nine2fine9')).status).toBe(200);
  });

  it('AC-AUTH-57: P (chưa có mật khẩu) tạo mật khẩu qua reset', async () => {
    const { code } = await sendCode(P.email, 'reset-password');
    expect((await reset(code, 'Lan2026ok', P.email)).status).toBe(204);
    expect((await loginPassword(P.email, 'Lan2026ok')).status).toBe(200);
  });

  it('AC-AUTH-58: đặt lại mở khoá mật khẩu ngay', async () => {
    for (let i = 0; i < 5; i++) await loginPassword(A.email, 'Sai-sai1');
    expect((await loginPassword(A.email, A.password)).status).toBe(429);
    const { code } = await sendCode(A.email, 'reset-password');
    expect((await reset(code, 'Nine2fine9')).status).toBe(204);
    expect((await loginPassword(A.email, 'Nine2fine9')).status).toBe(200);
  });

  it('AC-AUTH-59: mã đặt lại dùng 1 lần; email lạ -> invalid-code', async () => {
    const { code } = await sendCode(A.email, 'reset-password');
    expect((await reset(code, 'Nine2fine9')).status).toBe(204);
    expect((await reset(code, 'Nine2fine8')).body.error.code).toBe('invalid-code');
    expect((await reset('12345678', 'Nine2fine8', N.email)).body.error.code).toBe('invalid-code');
  });

  it('thư "mật khẩu đã thay đổi" được gửi (Should)', async () => {
    const { code } = await sendCode(A.email, 'reset-password');
    await reset(code, 'Nine2fine9');
    const { flushMail, mails } = await import('./helpers');
    await flushMail();
    expect(mails.some((m) => m.to === A.email && /thay đổi/.test(m.subject))).toBe(true);
    expect(JSON.stringify(mails)).not.toContain('Nine2fine9');
  });

});
