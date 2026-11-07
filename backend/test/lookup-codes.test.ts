import { beforeEach, describe, expect, it } from 'vitest';
import {
  A, N, P, X, advance, createUser, flushMail, freshIp, lastCode, loginPassword, mails, post, prisma, resetState,
  sendCode, useClock, wrongCode,
} from './helpers';
import { hashOtp } from '../src/lib/crypto';

beforeEach(async () => {
  await resetState();
  await createUser({ email: A.email, password: A.password });
  await createUser({ email: P.email });
  await createUser({ email: X.email, password: X.password, isActive: false });
});

describe('lookup', () => {
  it('AC-AUTH-01: chuẩn hoá email hoa-thường + khoảng trắng', async () => {
    const res = await post('/api/auth/lookup', { email: '  Minh@Example.COM ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: true });
  });

  it('AC-AUTH-02: email sai định dạng / quá dài -> 422 validation field email', async () => {
    for (const email of ['minh@', 'minh example.com', 'a'.repeat(250) + '@x.com', 'a@b', 5 as unknown as string]) {
      const res = await post('/api/auth/lookup', { email });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'validation', field: 'email' });
    }
  });

  it('AC-AUTH-03/04: N -> registered false; X (bị vô hiệu) -> true; chỉ có trường registered', async () => {
    const n = await post('/api/auth/lookup', { email: N.email });
    const x = await post('/api/auth/lookup', { email: X.email });
    expect(n.body).toEqual({ registered: false });
    expect(x.body).toEqual({ registered: true });
  });

  it('AC-AUTH-05: IP lần 21 trong 15 phút -> 429 rate-limited + Retry-After; hết chờ dùng lại', async () => {
    useClock('2026-11-07T10:00:00Z');
    const ip = freshIp();
    for (let i = 0; i < 20; i++) {
      expect((await post('/api/auth/lookup', { email: `u${i}@example.com` }, { ip })).status).toBe(200);
    }
    const res = await post('/api/auth/lookup', { email: 'u99@example.com' }, { ip });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate-limited');
    expect(Number(res.headers['retry-after'])).toBe(res.body.error.retryAfterSeconds);
    advance(15 * 60 * 1000 + 1000);
    expect((await post('/api/auth/lookup', { email: 'u99@example.com' }, { ip })).status).toBe(200);
  });

  it('AC-AUTH-06: email lần 11 trong 15 phút từ nhiều IP -> 429', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post('/api/auth/lookup', { email: N.email }, { ip: freshIp() })).status).toBe(200);
    }
    const res = await post('/api/auth/lookup', { email: N.email }, { ip: freshIp() });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate-limited');
  });
});

describe('codes (OTP)', () => {
  it('AC-AUTH-07: A và N nhận phản hồi giống nhau (status, cấu trúc) và chênh trung vị thời gian <= 300 ms', async () => {
    const timing = async (email: string, n: number) => {
      const ts: number[] = [];
      for (let i = 0; i < n; i++) {
        await resetFor(email);
        const t0 = performance.now();
        const r = await post('/api/auth/codes', { email, purpose: 'login' }, { ip: freshIp() });
        ts.push(performance.now() - t0);
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ resendAfterSeconds: 60 });
      }
      return ts.sort((a, b) => a - b)[Math.floor(n / 2)];
    };
    const resetFor = async (email: string) => {
      await prisma.authRateLimit.deleteMany({});
      await prisma.authActionToken.deleteMany({ where: { email } });
    };
    const mA = await timing(A.email, 20);
    const mN = await timing(N.email, 20);
    expect(Math.abs(mA - mN)).toBeLessThanOrEqual(300);

    // đăng nhập mật khẩu sai: cùng status + body
    const a = await loginPassword(A.email, 'Sai-mat-khau1', freshIp());
    const n = await loginPassword(N.email, 'Sai-mat-khau1', freshIp());
    expect(a.status).toBe(n.status);
    expect(a.body).toEqual(n.body);
  });

  it('AC-AUTH-08: mã 8 số (kể cả bắt đầu bằng 0), DB chỉ lưu HMAC, không lưu dạng rõ', async () => {
    const codes: string[] = [];
    for (let i = 0; i < 40; i++) {
      await prisma.authRateLimit.deleteMany({});
      const { code } = await sendCode(A.email, 'login', freshIp());
      expect(code).toMatch(/^\d{8}$/);
      codes.push(code!);
    }
    expect(new Set(codes).size).toBeGreaterThan(35);
    const rows = await prisma.authActionToken.findMany({ where: { email: A.email } });
    for (const r of rows) {
      expect(codes).not.toContain(r.tokenHash);
      expect(r.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
    const last = codes[codes.length - 1];
    expect(rows.some((r) => r.tokenHash === hashOtp(A.email, 'login', last))).toBe(true);
  });

  it('AC-AUTH-09: mã đăng nhập không dùng được cho đặt lại mật khẩu', async () => {
    const { code } = await sendCode(A.email, 'login');
    const res = await post('/api/auth/password/reset', { email: A.email, code, newPassword: 'Abcdefg1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid-code');
  });

  it('AC-AUTH-10: mã đã dùng không dùng lại được', async () => {
    const { code } = await sendCode(A.email, 'login');
    expect((await post('/api/auth/login/code', { email: A.email, code })).status).toBe(200);
    const again = await post('/api/auth/login/code', { email: A.email, code });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('invalid-code');
  });

  it('AC-AUTH-11/12: hết hạn 10 phút: 9:50 ok; 10:01 invalid-code và không tăng bộ đếm sai', async () => {
    useClock('2026-11-07T10:00:00Z');
    const { code } = await sendCode(A.email, 'login');
    advance(9 * 60 * 1000 + 50 * 1000);
    expect((await post('/api/auth/login/code', { email: A.email, code })).status).toBe(200);

    await prisma.authRateLimit.deleteMany({});
    advance(61 * 1000);
    const { code: code2 } = await sendCode(A.email, 'login');
    advance(10 * 60 * 1000 + 1000);
    const late = await post('/api/auth/login/code', { email: A.email, code: code2 });
    expect(late.status).toBe(422);
    expect(late.body.error.code).toBe('invalid-code');
    expect(await prisma.authRateLimit.findUnique({ where: { key: `codeverify:${A.email}:login` } })).toBeNull();
  });

  it('AC-AUTH-13: trong 60 giây gửi lại -> không mã mới, mã cũ còn dùng, resendAfterSeconds còn lại', async () => {
    useClock('2026-11-07T10:00:00Z');
    const first = await sendCode(A.email, 'login');
    advance(20 * 1000);
    const res = await post('/api/auth/codes', { email: A.email, purpose: 'login' });
    await flushMail();
    expect(res.status).toBe(200);
    expect(res.body.resendAfterSeconds).toBe(40); // AC-AUTH-14: đếm ngược ~40 giây
    expect(mails.filter((m) => m.to === A.email)).toHaveLength(1);
    expect((await post('/api/auth/login/code', { email: A.email, code: first.code })).status).toBe(200);
  });

  it('AC-AUTH-14: cooldown không tính vào giới hạn 5 lần / 30 phút', async () => {
    useClock('2026-11-07T10:00:00Z');
    await sendCode(A.email, 'login');
    for (let i = 0; i < 6; i++) {
      advance(5 * 1000);
      expect((await post('/api/auth/codes', { email: A.email, purpose: 'login' })).status).toBe(200);
    }
  });

  it('AC-AUTH-15: lần gửi thứ 6 trong 30 phút -> 429 rate-limited, không thư; mục đích khác vẫn gửi được', async () => {
    useClock('2026-11-07T10:00:00Z');
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/codes', { email: A.email, purpose: 'login' }, { ip: freshIp() });
      expect(r.status).toBe(200);
      advance(61 * 1000);
    }
    await flushMail();
    const before = mails.length;
    const sixth = await post('/api/auth/codes', { email: A.email, purpose: 'login' }, { ip: freshIp() });
    await flushMail();
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('rate-limited');
    expect(mails).toHaveLength(before);
    const reset = await post('/api/auth/codes', { email: A.email, purpose: 'reset-password' }, { ip: freshIp() });
    expect(reset.status).toBe(200);
  });

  it('AC-AUTH-16: IP yêu cầu 30 mã / giờ, lần 31 bị từ chối, không thư', async () => {
    const ip = freshIp();
    for (let i = 0; i < 30; i++) {
      expect((await post('/api/auth/codes', { email: `u${i}@example.com`, purpose: 'login' }, { ip })).status).toBe(200);
    }
    await flushMail();
    const before = mails.length;
    const res = await post('/api/auth/codes', { email: 'u31@example.com', purpose: 'login' }, { ip });
    await flushMail();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate-limited');
    expect(mails).toHaveLength(before);
  });

  it('AC-AUTH-17/BR-AUTH-07: mã mới vô hiệu mã cũ cùng mục đích', async () => {
    useClock('2026-11-07T10:00:00Z');
    const m1 = await sendCode(A.email, 'login');
    advance(61 * 1000);
    const m2 = await sendCode(A.email, 'login');
    const old = await post('/api/auth/login/code', { email: A.email, code: m1.code });
    expect(old.body.error.code).toBe('invalid-code');
    expect((await post('/api/auth/login/code', { email: A.email, code: m2.code })).status).toBe(200);
  });

  it('AC-AUTH-18: mã đặt lại mới không vô hiệu mã đăng nhập còn hạn', async () => {
    const login = await sendCode(A.email, 'login');
    await sendCode(A.email, 'reset-password');
    expect((await post('/api/auth/login/code', { email: A.email, code: login.code })).status).toBe(200);
  });

  it('AC-AUTH-19/20: sai 4 lần cùng thông báo; lần 5 khoá 15 phút; mã đúng sau đó vẫn bị từ chối; mật khẩu vẫn dùng được; gửi mã mới bị từ chối', async () => {
    const { code } = await sendCode(A.email, 'login');
    const bad = wrongCode(code);
    const messages = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = await post('/api/auth/login/code', { email: A.email, code: bad });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('invalid-code');
      messages.add(r.body.error.message);
    }
    expect(messages.size).toBe(1);
    const fifth = await post('/api/auth/login/code', { email: A.email, code: bad });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('code-locked');
    expect(fifth.body.error.retryAfterSeconds).toBe(900);
    expect(fifth.body.error.message).toContain('15 phút');
    expect(fifth.headers['retry-after']).toBe('900');
    const right = await post('/api/auth/login/code', { email: A.email, code });
    expect(right.status).toBe(429);
    const resend = await post('/api/auth/codes', { email: A.email, purpose: 'reset-password' });
    expect(resend.status).toBe(429);
    expect(resend.body.error.code).toBe('code-locked');
    expect((await loginPassword(A.email, A.password)).status).toBe(200);
  });

  it('AC-AUTH-21: email N (không có mã) sai 5 lần -> cùng hành vi như A', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await post('/api/auth/login/code', { email: N.email, code: '12345678' });
      expect(r.body.error.code).toBe('invalid-code');
    }
    const fifth = await post('/api/auth/login/code', { email: N.email, code: '12345678' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('code-locked');
  });

  it('AC-AUTH-22: sau 15 phút 1 giây yêu cầu mã mới và đăng nhập đúng', async () => {
    useClock('2026-11-07T10:00:00Z');
    const { code } = await sendCode(A.email, 'login');
    for (let i = 0; i < 5; i++) await post('/api/auth/login/code', { email: A.email, code: wrongCode(code) });
    advance(15 * 60 * 1000 + 1000);
    const fresh = await sendCode(A.email, 'login');
    expect(fresh.res.status).toBe(200);
    expect((await post('/api/auth/login/code', { email: A.email, code: fresh.code })).status).toBe(200);
  });

  it('AC-AUTH-19b: mã sai định dạng -> 422 validation field code, không tăng bộ đếm (AC-AUTH-23 phía BE)', async () => {
    for (const code of ['1234567', '1234abcd']) {
      const r = await post('/api/auth/login/code', { email: A.email, code });
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'code' });
    }
    expect(await prisma.authRateLimit.count({ where: { key: { startsWith: 'codeverify:' } } })).toBe(0);
  });

  it('BR-AUTH-04: mã có thể nhập kèm khoảng trắng / dấu gạch ngang', async () => {
    const { code } = await sendCode(A.email, 'login');
    const spaced = `${code!.slice(0, 4)}-${code!.slice(4)}`;
    expect((await post('/api/auth/login/code', { email: A.email, code: ` ${spaced} ` })).status).toBe(200);
  });

  it('AC-AUTH-24: register cho email đã có -> phản hồi giống N, thư "đã có tài khoản", không mã', async () => {
    const a = await post('/api/auth/codes', { email: A.email, purpose: 'register' }, { ip: freshIp() });
    const n = await post('/api/auth/codes', { email: N.email, purpose: 'register' }, { ip: freshIp() });
    await flushMail();
    expect(a.status).toBe(n.status);
    expect(a.body).toEqual(n.body);
    const mailA = mails.find((m) => m.to === A.email)!;
    expect(mailA.subject).toMatch(/đã có tài khoản/);
    expect(lastCode(A.email)).toBeUndefined();
    expect(lastCode(N.email)).toMatch(/^\d{8}$/);
  });

  it('AC-AUTH-25: login cho N -> 200 kèm thời gian chờ, không có thư', async () => {
    const r = await post('/api/auth/codes', { email: N.email, purpose: 'login' });
    await flushMail();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ resendAfterSeconds: 60 });
    expect(mails).toHaveLength(0);
  });

  it('AC-AUTH-26: login cho X (bị vô hiệu) -> phản hồi giống N, thư báo khoá + email hỗ trợ, không mã', async () => {
    const r = await post('/api/auth/codes', { email: X.email, purpose: 'login' });
    await flushMail();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ resendAfterSeconds: 60 });
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain('support@example.test');
    expect(lastCode(X.email)).toBeUndefined();
  });

  it('N4: email chứa ký tự NUL -> 422 validation (không phải 500) ở mọi endpoint', async () => {
    const email = 'a b@example.com';
    const bodies: Array<[string, Record<string, unknown>]> = [
      ['/api/auth/lookup', { email }],
      ['/api/auth/codes', { email, purpose: 'login' }],
      ['/api/auth/login/password', { email, password: 'Nine2fine1' }],
      ['/api/auth/login/code', { email, code: '12345678' }],
      ['/api/auth/register', { email, code: '12345678', firstName: 'A', lastName: 'B', acceptedTerms: true }],
    ];
    for (const [url, body] of bodies) {
      const r = await post(url, body);
      expect(r.status, url).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'email' });
    }
  });

  it('purpose không hợp lệ -> 422 validation', async () => {
    const r = await post('/api/auth/codes', { email: A.email, purpose: 'admin' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('validation');
  });
});
