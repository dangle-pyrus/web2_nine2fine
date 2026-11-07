import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  A, ORIGIN, advance, app, cookieFrom, createUser, flushMail, freshIp, get, loginPassword, mails, post, prisma,
  rawSetCookie, resetState, sendCode, useClock,
} from './helpers';
import { ConfigError, loadConfig } from '../src/config/env';
import { maskEmail } from '../src/lib/logger';
import { createDevOutboxTransport } from '../src/mail/mailer';
import { revokeAllUserSessions } from '../src/modules/auth/session.service';
import { assertLocalTestDb, TEST_DB_URL } from './guard';

const STAFF = { email: 'staff@example.com', password: 'Staff2026ok' };
const ADMIN = { email: 'admin@example.com', password: 'Admin2026ok' };
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

beforeEach(async () => {
  await resetState();
  await createUser({ email: A.email, password: A.password });
  await createUser({ email: STAFF.email, password: STAFF.password, role: 'staff' });
  await createUser({ email: ADMIN.email, password: ADMIN.password, role: 'admin' });
});
afterEach(() => vi.restoreAllMocks());

const adminLogin = (e: { email: string; password: string }, ip = freshIp()) =>
  post('/api/admin/auth/login', { email: e.email, password: e.password }, { ip });

describe('session', () => {
  it('AC-AUTH-65/66: /me khi có phiên trả hồ sơ; khách -> 200 {user:null}, no-store', async () => {
    const guest = await get('/api/auth/me');
    expect(guest.status).toBe(200);
    expect(guest.body).toEqual({ user: null });
    expect(guest.headers['cache-control']).toBe('no-store');
    const login = await loginPassword(A.email, A.password);
    const me = await get('/api/auth/me', { cookie: cookieFrom(login, 'n2f_sid') });
    expect(me.body.user).toMatchObject({ email: A.email, role: 'member' });
  });

  it('AC-AUTH-90/BR-AUTH-23: cookie HttpOnly, SameSite=Lax, Path=/api, Max-Age=90 ngày; token không có trong body', async () => {
    const login = await loginPassword(A.email, A.password);
    const raw = rawSetCookie(login, 'n2f_sid')!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\/api(;|$)/);
    expect(raw).toMatch(new RegExp(`Max-Age=${90 * 24 * 3600}`));
    expect(raw).not.toMatch(/Secure/i); // chỉ bật ở production
    const token = cookieFrom(login, 'n2f_sid')!.split('=')[1];
    expect(JSON.stringify(login.body)).not.toContain(token);
    // DB chỉ lưu SHA-256, không lưu token
    const s = await prisma.session.findFirst();
    expect(s!.tokenHash).not.toBe(token);
    expect(s!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cookie Secure được bật khi NODE_ENV=production', async () => {
    const { resetConfigCache } = await import('../src/config/env');
    process.env.NODE_ENV = 'production';
    resetConfigCache();
    try {
      const login = await loginPassword(A.email, A.password);
      expect(rawSetCookie(login, 'n2f_sid')).toMatch(/Secure/i);
    } finally {
      process.env.NODE_ENV = 'test';
      resetConfigCache();
    }
  });

  it('AC-AUTH-62: member 30 ngày không hoạt động: 29 ngày còn đăng nhập, quá 30 ngày thành khách', async () => {
    useClock('2026-01-01T00:00:00Z');
    const c = cookieFrom(await loginPassword(A.email, A.password), 'n2f_sid');
    advance(29 * DAY);
    expect((await get('/api/auth/me', { cookie: c })).body.user).not.toBeNull();
    advance(30 * DAY + 60 * 1000);
    expect((await get('/api/auth/me', { cookie: c })).body.user).toBeNull();
  });

  it('AC-AUTH-63: hoạt động mỗi ngày vẫn hết hạn ở ngày 90 + 1 phút', async () => {
    useClock('2026-01-01T00:00:00Z');
    const c = cookieFrom(await loginPassword(A.email, A.password), 'n2f_sid');
    for (let d = 0; d < 89; d++) {
      advance(DAY);
      expect((await get('/api/auth/me', { cookie: c })).body.user).not.toBeNull();
    }
    advance(DAY + 60 * 1000);
    expect((await get('/api/auth/me', { cookie: c })).body.user).toBeNull();
  });

  it('AC-AUTH-64: staff 8 giờ không hoạt động -> hết; trượt theo hoạt động; tối đa 24 giờ', async () => {
    useClock('2026-01-01T00:00:00Z');
    const c1 = cookieFrom(await adminLogin(STAFF), 'n2f_asid');
    advance(7 * HOUR);
    expect((await get('/api/admin/auth/me', { cookie: c1 })).status).toBe(200);
    advance(8 * HOUR + 60 * 1000);
    expect((await get('/api/admin/auth/me', { cookie: c1 })).status).toBe(401);

    const c2 = cookieFrom(await adminLogin(STAFF), 'n2f_asid');
    for (let i = 0; i < 3; i++) {
      advance(7 * HOUR);
      expect((await get('/api/admin/auth/me', { cookie: c2 })).status).toBe(200);
    }
    advance(4 * HOUR); // tổng 25 giờ
    expect((await get('/api/admin/auth/me', { cookie: c2 })).status).toBe(401);
  });

  it('staff đăng nhập ở storefront cũng có hạn 8 giờ', async () => {
    useClock('2026-01-01T00:00:00Z');
    const login = await loginPassword(STAFF.email, STAFF.password);
    expect(rawSetCookie(login, 'n2f_sid')).toMatch(new RegExp(`Max-Age=${24 * 3600}`));
    const c = cookieFrom(login, 'n2f_sid');
    advance(8 * HOUR + 60000);
    expect((await get('/api/auth/me', { cookie: c })).body.user).toBeNull();
  });

  it('AC-AUTH-70/71/73: đăng xuất chỉ thu hồi phiên hiện tại; phiên hết hạn / cookie giả -> 204, không thu hồi gì', async () => {
    const c1 = cookieFrom(await loginPassword(A.email, A.password, freshIp()), 'n2f_sid');
    const c2 = cookieFrom(await loginPassword(A.email, A.password, freshIp()), 'n2f_sid');
    const fake = await post('/api/auth/logout', undefined, { cookie: 'n2f_sid=khong-ton-tai' });
    expect(fake.status).toBe(204);
    expect(await prisma.session.count({ where: { revoked_at: null } })).toBe(2);
    const out = await post('/api/auth/logout', undefined, { cookie: c1 });
    expect(out.status).toBe(204);
    expect(rawSetCookie(out, 'n2f_sid')).toMatch(/Max-Age=0/);
    expect((await get('/api/auth/me', { cookie: c1 })).body.user).toBeNull();
    expect((await get('/api/auth/me', { cookie: c2 })).body.user).not.toBeNull();
    expect((await post('/api/auth/logout', undefined, { cookie: c1 })).status).toBe(204); // đã hết hạn
    expect((await post('/api/auth/logout', undefined)).status).toBe(204); // không cookie
  });

  it('AC-AUTH-70b: logout thiếu Origin -> 403 origin-not-allowed', async () => {
    const r = await post('/api/auth/logout', undefined, { origin: null });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('origin-not-allowed');
  });

  it('AC-AUTH-74: đăng nhập thứ 11 thu hồi phiên dùng cuối cũ nhất, còn đúng 10', async () => {
    useClock('2026-01-01T00:00:00Z');
    const cookies: string[] = [];
    for (let i = 0; i < 11; i++) {
      cookies.push(cookieFrom(await loginPassword(A.email, A.password, freshIp()), 'n2f_sid')!);
      advance(1000);
    }
    expect(await prisma.session.count({ where: { revoked_at: null } })).toBe(10);
    expect((await get('/api/auth/me', { cookie: cookies[0] })).body.user).toBeNull();
    expect((await get('/api/auth/me', { cookie: cookies[10] })).body.user).not.toBeNull();
  });

  it('AC-AUTH-75: vô hiệu tài khoản -> /me thành khách; revokeAllUserSessions thu hồi ngay; staff bị hạ vai trò mất quyền admin', async () => {
    const u = (await prisma.user.findUnique({ where: { email: A.email } }))!;
    const c = cookieFrom(await loginPassword(A.email, A.password), 'n2f_sid');
    await prisma.user.update({ where: { user_id: u.user_id }, data: { isActive: false } });
    expect((await get('/api/auth/me', { cookie: c })).body.user).toBeNull();
    await prisma.user.update({ where: { user_id: u.user_id }, data: { isActive: true } });
    expect(await revokeAllUserSessions(u.user_id, 'test')).toBe(1);
    expect((await get('/api/auth/me', { cookie: c })).body.user).toBeNull();

    const sc = cookieFrom(await adminLogin(STAFF), 'n2f_asid');
    await prisma.user.update({ where: { email: STAFF.email }, data: { role: 'member' } });
    expect((await get('/api/admin/auth/me', { cookie: sc })).status).toBe(401);
  });

  it('AC-AUTH-84/85/88: 401 vs 403; staff không vào API settings.staff, admin vào được; member 403 ở khu admin dùng cookie nào cũng không có', async () => {
    expect((await get('/api/account/ping')).body.error.code).toBe('unauthenticated');
    const member = cookieFrom(await loginPassword(A.email, A.password), 'n2f_sid')!;
    expect((await get('/api/account/ping', { cookie: member })).status).toBe(200);
    // cookie storefront không có giá trị ở /api/admin (khác tên cookie + audience)
    const asAdmin = await get('/api/admin/ping', { cookie: member.replace('n2f_sid', 'n2f_asid') });
    expect(asAdmin.status).toBe(401);
    expect((await get('/api/admin/ping', { cookie: member })).status).toBe(401);
    // member không đăng nhập được ở admin
    const m = await adminLogin(A);
    expect(m.status).toBe(401);
    expect(m.body.error.code).toBe('invalid-credentials');

    const staff = cookieFrom(await adminLogin(STAFF), 'n2f_asid')!;
    expect((await get('/api/admin/ping', { cookie: staff })).status).toBe(200);
    const denied = await get('/api/admin/settings/staff', { cookie: staff });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');
    const admin = cookieFrom(await adminLogin(ADMIN), 'n2f_asid')!;
    expect((await get('/api/admin/settings/staff', { cookie: admin })).status).toBe(200);
  });

  it('BR-AUTH-31/33: cookie admin không dùng được ở storefront; admin cookie Path=/api/admin', async () => {
    const r = await adminLogin(STAFF);
    expect(rawSetCookie(r, 'n2f_asid')).toMatch(/Path=\/api\/admin/);
    expect(r.body).toMatchObject({ role: 'staff' });
    const ac = cookieFrom(r, 'n2f_asid')!;
    expect((await get('/api/auth/me', { cookie: ac.replace('n2f_asid', 'n2f_sid') })).body.user).toBeNull();
    expect((await get('/api/admin/auth/me')).status).toBe(401);
    expect((await get('/api/admin/auth/me')).body.error.code).toBe('unauthenticated');
  });

  it('admin: sai mật khẩu chung bộ đếm khoá với storefront; staff bị vô hiệu + đúng mật khẩu -> 403', async () => {
    for (let i = 0; i < 5; i++) await adminLogin({ email: STAFF.email, password: 'Sai-sai1' });
    expect((await adminLogin(STAFF)).body.error.code).toBe('password-locked');
    expect((await loginPassword(STAFF.email, STAFF.password)).status).toBe(429);
    await prisma.authRateLimit.deleteMany({});
    await prisma.user.update({ where: { email: STAFF.email }, data: { isActive: false } });
    expect((await adminLogin(STAFF)).body.error.code).toBe('account-disabled');
  });

  it('admin logout thu hồi phiên admin và luôn 204', async () => {
    const c = cookieFrom(await adminLogin(ADMIN), 'n2f_asid');
    const out = await post('/api/admin/auth/logout', undefined, { cookie: c });
    expect(out.status).toBe(204);
    expect((await get('/api/admin/auth/me', { cookie: c })).status).toBe(401);
    expect((await post('/api/admin/auth/logout', undefined)).status).toBe(204);
  });
});

describe('security / CORS / errors', () => {
  it('AC-AUTH-92: Origin lạ hoặc thiếu hoặc thiếu X-Requested-With -> 403 origin-not-allowed', async () => {
    const body = { email: A.email };
    for (const opts of [{ origin: 'https://evil.example' }, { origin: null }, { xrw: null }, { xrw: 'x' }]) {
      const r = await post('/api/auth/lookup', body, opts);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('origin-not-allowed');
    }
    expect((await post('/api/auth/lookup', body)).status).toBe(200);
  });

  it('AC-AUTH-92b: CORS allowlist: nguồn hợp lệ có credentials; nguồn lạ không có header; preflight nguồn lạ bị từ chối', async () => {
    const ok = await request(app).get('/api/auth/me').set('Origin', ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/api/auth/me').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(app)
      .options('/api/auth/lookup')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const preOk = await request(app)
      .options('/api/auth/lookup')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(preOk.headers['access-control-allow-headers']).toMatch(/X-Requested-With/i);
  });

  it('BR-AUTH-36: JSON hỏng, body > 16 KB, sai content-type -> 422 validation (không dùng 400/413)', async () => {
    const bad = await post('/api/auth/lookup', '{"email":');
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('validation');
    const big = await post('/api/auth/lookup', { email: A.email, pad: 'x'.repeat(20000) });
    expect(big.status).toBe(422);
    const ct = await request(app)
      .post('/api/auth/lookup')
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'n2f')
      .set('Content-Type', 'text/plain')
      .send('email=a@b.co');
    expect(ct.status).toBe(422);
    expect((await post('/api/auth/lookup', [1, 2])).status).toBe(422);
  });

  it('AC-AUTH-93/94: lỗi 500 trả code unavailable, không lộ stack / SQL / tên bảng', async () => {
    const r = await get('/api/boom');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: 'unavailable', message: 'Không thể kết nối. Vui lòng thử lại.' } });
    expect(JSON.stringify(r.body)).not.toMatch(/select|users|password|stack/i);
  });

  it('AC-AUTH-93: mỗi loại lỗi có mã ổn định', async () => {
    expect((await post('/api/auth/lookup', { email: 'x' })).body.error.code).toBe('validation');
    expect((await loginPassword(A.email, 'Sai-sai1')).body.error.code).toBe('invalid-credentials');
    expect((await post('/api/auth/login/code', { email: A.email, code: '12345678' })).body.error.code).toBe('invalid-code');
    expect((await get('/api/account/ping')).body.error.code).toBe('unauthenticated');
  });

  it('header bảo mật (helmet) có mặt, không lộ X-Powered-By', async () => {
    const r = await get('/api/auth/me');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('AC-AUTH-89: toàn bộ luồng không ghi mã OTP, mật khẩu hay token ra log; email được che', async () => {
    process.env.LOG_IN_TEST = '1';
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const n = 'logcheck@example.com';
      const reg = await sendCode(n, 'register');
      const r = await post('/api/auth/register', {
        email: n, code: reg.code, firstName: 'Log', lastName: 'Check', acceptedTerms: true, marketingOptIn: false,
      });
      const token = cookieFrom(r, 'n2f_sid')!.split('=')[1];
      const lc = await sendCode(A.email, 'login');
      await post('/api/auth/login/code', { email: A.email, code: lc.code });
      await loginPassword(A.email, 'Sai-MatKhau-Ky-Quac1');
      const rc = await sendCode(A.email, 'reset-password', freshIp());
      await post('/api/auth/password/reset', { email: A.email, code: rc.code, newPassword: 'Mat-Khau-Moi-1' });
      await get('/api/boom');
      await flushMail();
      const logged = spies.flatMap((s) => s.mock.calls.flat()).join('\n');
      for (const secret of [reg.code!, lc.code!, rc.code!, 'Sai-MatKhau-Ky-Quac1', 'Mat-Khau-Moi-1', token, A.password]) {
        expect(logged).not.toContain(secret);
      }
      expect(logged).not.toContain(A.email);
    } finally {
      delete process.env.LOG_IN_TEST;
    }
    expect(maskEmail('dung@nine2fine.vn')).toBe('d***@nine2fine.vn');
  });

  it('AC-AUTH-91: thiếu OTP_HMAC_SECRET -> ConfigError chỉ có tên biến; tiến trình máy chủ thoát mã 1', () => {
    const base = { DATABASE_URL: TEST_DB_URL, OTP_HMAC_SECRET: 'x'.repeat(40) };
    expect(() => loadConfig({ ...base, OTP_HMAC_SECRET: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, OTP_HMAC_SECRET: 'ngan' })).toThrow(/OTP_HMAC_SECRET/);
    try {
      loadConfig({ ...base, OTP_HMAC_SECRET: 'short-secret-value' });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('short-secret-value');
    }
    expect(() => loadConfig({ ...base, MAIL_MODE: 'smtp' })).toThrow(/SMTP_PASS/);

    const cwd = mkdtempSync(path.join(tmpdir(), 'n2f-cfg-'));
    try {
      const root = path.resolve(__dirname, '..');
      const res = spawnSync(
        process.execPath,
        [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'src', 'server.ts')],
        {
          cwd,
          encoding: 'utf8',
          env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: TEST_DB_URL, PORT: '0' },
          timeout: 60000,
        },
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('OTP_HMAC_SECRET');
      expect(res.stderr + res.stdout).not.toContain(TEST_DB_URL);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('guard / mail outbox / seed', () => {
  it('chốt chặn: assertLocalTestDb từ chối host không cục bộ hoặc DB khác n2f_test', () => {
    expect(() => assertLocalTestDb({ DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL })).not.toThrow();
    const remote = 'postgresql://user:pw@db.example.supabase.co:5432/postgres';
    expect(() => assertLocalTestDb({ DATABASE_URL: remote, DIRECT_URL: TEST_DB_URL })).toThrow(/REFUSING/);
    expect(() => assertLocalTestDb({ DATABASE_URL: TEST_DB_URL, DIRECT_URL: remote })).toThrow(/REFUSING/);
    expect(() => assertLocalTestDb({ DATABASE_URL: TEST_DB_URL })).toThrow(/REFUSING/);
    expect(() =>
      assertLocalTestDb({ DATABASE_URL: 'postgresql://postgres@127.0.0.1:54329/n2f_dev', DIRECT_URL: TEST_DB_URL }),
    ).toThrow(/REFUSING/);
  });

  it('dev-outbox ghi file .eml (không gửi thư thật)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'n2f-outbox-'));
    try {
      const t = createDevOutboxTransport({
        ...loadConfig({ DATABASE_URL: TEST_DB_URL, OTP_HMAC_SECRET: 'x'.repeat(40) }),
        mail: { mode: 'dev-outbox', outboxDir: dir, fromName: 'nine2fine', fromAddress: 'no-reply@nine2fine.test' },
      });
      await t.send({ to: 'a@example.com', subject: 'Mã', text: 'Mã là: 12345678' });
      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.eml$/);
      const eml = readFileSync(path.join(dir, files[0]), 'utf8');
      expect(eml).toContain('To: a@example.com');
      expect(eml).toContain('nine2fine');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('thư mã chứa mã, hạn 10 phút, cảnh báo không chia sẻ, không có link đăng nhập (BR-AUTH-37)', async () => {
    await sendCode(A.email, 'login');
    const m = mails.find((x) => x.to === A.email)!;
    expect(m.text).toMatch(/10 phút/);
    expect(m.text).toMatch(/Không chia sẻ/);
    expect(m.text).not.toMatch(/https?:\/\//);
  });

  it('seed idempotent: chạy 2 lần vẫn đúng 3 tài khoản, không đụng user khác, đăng nhập mật khẩu được', async () => {
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB_URL,
      DIRECT_URL: TEST_DB_URL,
      SEED_ADMIN_EMAIL: 'admin@nine2fine.test',
      SEED_ADMIN_PASSWORD: 'SeedAdmin2026x',
      SEED_STAFF_EMAIL: 'staff@nine2fine.test',
      SEED_STAFF_PASSWORD: 'SeedStaff2026x',
      SEED_MEMBER_EMAIL: 'member@nine2fine.test',
      SEED_MEMBER_PASSWORD: 'SeedMember2026x',
    };
    const root = path.resolve(__dirname, '..');
    const run = () =>
      spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'prisma', 'seed.ts')], {
        cwd: mkdtempSync(path.join(tmpdir(), 'n2f-seed-')),
        encoding: 'utf8',
        env,
        timeout: 90000,
      });
    const r1 = run();
    expect(r1.status).toBe(0);
    const r2 = run();
    expect(r2.status).toBe(0);
    expect(r1.stdout + r1.stderr + r2.stdout + r2.stderr).not.toContain('SeedAdmin2026x');
    expect(await prisma.user.count()).toBe(6); // 3 từ beforeEach + 3 seed
    expect(await prisma.user.count({ where: { email: { endsWith: '@nine2fine.test' } } })).toBe(3);
    expect((await prisma.user.findUnique({ where: { email: 'admin@nine2fine.test' } }))!.role).toBe('admin');
    expect((await adminLogin({ email: 'admin@nine2fine.test', password: 'SeedAdmin2026x' })).status).toBe(200);
    expect((await adminLogin({ email: 'staff@nine2fine.test', password: 'SeedStaff2026x' })).status).toBe(200);
    expect((await loginPassword('member@nine2fine.test', 'SeedMember2026x')).body.role).toBe('member');
  });
});
