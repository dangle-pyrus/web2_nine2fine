import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RETURN_PERMISSIONS, RETURNS_ASSUMPTIONS } from '../src/config/assumptions';
import { loadConfig, resetConfigCache } from '../src/config/env';
import { AppError, Errors } from '../src/lib/errors';
import { setPrivateImageStorage } from '../src/lib/storage/private';
import { LocalPrivateStorage } from '../src/lib/storage/private-local';
import { SupabasePrivateStorage } from '../src/lib/storage/private-supabase';
import { RETURN_PHOTO_KEY_RE } from '../src/lib/storage/private-types';
import { vnStartOfDay } from '../src/lib/vn-time';
import { decryptAccountNumber, encryptAccountNumber, hmacForHash, last4Of } from '../src/modules/returns/account-secret';
import { computeReturnAmount } from '../src/modules/returns/return-amount';
import {
  allowedActions, canTransition, checkEligibility, faultOf, returnDeadline, returnDeadlineExclusive, STATES, TRANSITIONS, type ReturnState,
} from '../src/modules/returns/return-rules';
import { get, resetState } from './helpers';

/** Lát 9.1 (nền): T-RET-03..08 + bảng quyền. Hàm thuần + hạ tầng, không cần API. */

const vn = (day: string, hhmm: string, sec = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(vnStartOfDay(day).getTime() + ((h * 60 + m) * 60 + sec) * 1000);
};
const D = '2026-11-12';

describe('T-RET-02 (khung): bảng quyền RETURN_PERMISSIONS (BR-RET-43)', () => {
  it('staff chỉ returns.process; admin thêm returns.refund', () => {
    expect([...RETURN_PERMISSIONS.staff]).toEqual(['returns.process']);
    expect([...RETURN_PERMISSIONS.admin].sort()).toEqual(['returns.process', 'returns.refund']);
  });
  it('allowedActions theo trạng thái + vai trò: refund chỉ admin', () => {
    expect(allowedActions('requested', 'staff')).toEqual(['approve', 'reject']);
    expect(allowedActions('approved', 'staff')).toEqual(['reject', 'receive']);
    expect(allowedActions('received', 'staff')).toEqual([]);
    expect(allowedActions('received', 'admin')).toEqual(['refund']);
    for (const s of ['refunded', 'rejected', 'cancelled'] as const) expect(allowedActions(s, 'admin')).toEqual([]);
  });
});

describe('T-RET-03 AC-RET-06: mã lỗi mới', () => {
  it('đúng code + HTTP, thông điệp tiếng Việt cố định, không lộ chi tiết', () => {
    const cases: Array<[AppError, string, number]> = [
      [Errors.notReturnable(), 'not-returnable', 409],
      [Errors.returnWindowClosed(), 'return-window-closed', 409],
      [Errors.returnExists(), 'return-exists', 409],
      [Errors.invalidReturnTransition('approved'), 'invalid-transition', 409],
    ];
    for (const [e, code, status] of cases) {
      expect(e.code).toBe(code);
      expect(e.status).toBe(status);
      expect(e.message).not.toMatch(/select|prisma|stack|at /i);
    }
    expect(Errors.invalidReturnTransition('approved').extras.currentReturnState).toBe('approved');
  });
  it('currentReturnState đi ra thân lỗi', async () => {
    // route giả không cần: error handler dùng `body(e)`; kiểm qua 404 chung rằng định dạng lỗi vẫn thống nhất.
    const res = await get('/api/khong-co-route');
    expect(res.body.error.code).toBe('not-found');
  });
});

describe('T-RET-04 AC-RET-08: bảng chuyển trạng thái 6 x 6', () => {
  const allowed: Array<[ReturnState, ReturnState]> = [
    ['requested', 'approved'], ['requested', 'rejected'], ['requested', 'cancelled'], ['approved', 'received'], ['approved', 'rejected'], ['received', 'refunded'],
  ];
  it('chỉ đúng 6 chuyển được phép; lặp lại và ngoài bảng bị từ chối', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const ok = allowed.some(([a, b]) => a === from && b === to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(ok);
      }
    }
    for (const s of ['refunded', 'rejected', 'cancelled'] as const) expect(TRANSITIONS[s]).toEqual([]);
  });
  it('sáu lý do: lỗi shop / lỗi khách', () => {
    for (const r of ['wrong-size', 'wrong-color', 'wrong-item', 'defective'] as const) expect(faultOf(r)).toBe('shop');
    for (const r of ['not-fit', 'changed-mind'] as const) expect(faultOf(r)).toBe('customer');
  });
});

describe('T-RET-05 AC-RET-21, 30: computeReturnAmount', () => {
  const line = (id: string, unitPrice: number, quantity: number, lineDiscount = 0) => ({ orderItemId: id, unitPrice, quantity, lineDiscount });
  const R1 = [line('L1', 500_000, 2, 100_000), line('L2', 300_000, 1)];
  const R2 = [line('A', 400_000, 1)];
  const R5 = [line('V3', 400_000, 3, 200_000)];
  const calc = (lines: ReturnType<typeof line>[], q: Record<string, number>, fault: 'shop' | 'customer', fee = 0, disc = 0) =>
    computeReturnAmount({ orderLines: lines, qtyByItem: new Map(Object.entries(q)), fault, shippingFee: fee, shippingDiscount: disc });

  it('a) L1 x1 not-fit: 450.000 - 30.000 = 420.000', () => {
    const r = calc(R1, { L1: 1 }, 'customer');
    expect([r.goodsAmount, r.shippingRefund, r.returnShippingFee, r.amount]).toEqual([450_000, 0, 30_000, 420_000]);
  });
  it('b) L1 x2 + L2 x1 wrong-size: 1.200.000 (ship 0)', () => {
    expect(calc(R1, { L1: 2, L2: 1 }, 'shop').amount).toBe(1_200_000);
  });
  it('c) R2 toàn đơn defective: 400.000 + ship 30.000 = 430.000; d) changed-mind: 370.000 (không hoàn ship)', () => {
    expect(calc(R2, { A: 1 }, 'shop', 30_000).amount).toBe(430_000);
    const d = calc(R2, { A: 1 }, 'customer', 30_000);
    expect([d.shippingRefund, d.amount]).toEqual([0, 370_000]);
  });
  it('e) R5 x1 / x2 / x3 defective: 333.333, 666.667, 1.000.000', () => {
    expect([1, 2, 3].map((q) => calc(R5, { V3: q }, 'shop').amount)).toEqual([333_333, 666_667, 1_000_000]);
  });
  it('f) R6 25.000 not-fit: âm (máy chủ báo 422 lines); g) chuyển khoản toàn đơn wrong-item 430.000', () => {
    expect(calc([line('X', 25_000, 1)], { X: 1 }, 'customer', 30_000).amount).toBe(-5_000);
    expect(calc(R2, { A: 1 }, 'shop', 30_000).amount).toBe(430_000);
  });
  it('phí giao trừ giảm phí giao; chỉ hoàn phí giao khi MỌI dòng đủ số lượng', () => {
    expect(calc(R2, { A: 1 }, 'shop', 30_000, 30_000).shippingRefund).toBe(0);
    expect(calc(R1, { L1: 2 }, 'shop', 30_000).shippingRefund).toBe(0); // thiếu L2
    expect(calc(R1, { L1: 2, L2: 1 }, 'shop', 30_000).shippingRefund).toBe(30_000);
    expect(calc(R1, { L1: 1, L2: 1 }, 'shop', 30_000).shippingRefund).toBe(0); // L1 chưa đủ
  });
  it('c.a..c.c) nhận hàng chốt theo số ĐẠT: (b) 450.000; (c) round(1.000.000 x 2 / 3) - 30.000 = 636.667', () => {
    expect(calc(R1, { L1: 1, L2: 0 }, 'shop').amount).toBe(450_000);
    expect(calc(R5, { V3: 2 }, 'customer').amount).toBe(636_667);
    expect(calc(R1, { L1: 2, L2: 1 }, 'shop').amount).toBe(1_200_000);
  });
  it('biên: 100.000.000 x 99, q = 1/3, lineNet = 0', () => {
    const big = calc([line('B', 100_000_000, 99)], { B: 99 }, 'shop');
    expect(big.goodsAmount).toBe(9_900_000_000); // vượt int32 ở JS nhưng không tràn số (DB sẽ từ chối ở tầng khác)
    const third = calc([line('T', 100, 3, 1)], { T: 1 }, 'shop'); // lineNet 299, 299 / 3 = 99,67
    expect(third.goodsAmount).toBe(100);
    const zero = calc([line('Z', 50_000, 2, 100_000)], { Z: 1 }, 'shop');
    expect(zero.goodsAmount).toBe(0);
    expect(calc(R1, {}, 'shop').amount).toBe(0);
  });
});

describe('T-RET-06 AC-RET-10: returnDeadline / checkEligibility', () => {
  const R2 = { status: 'completed', paymentStatus: 'paid', deliveredAt: vn('2026-10-13', '08:00') }; // D-30
  const run = () => {
    expect(returnDeadline(R2.deliveredAt).toISOString()).toBe(vn(D, '23:59', 59).toISOString());
    expect(checkEligibility(R2, vn(D, '23:59', 59))).toBe('ok');
    expect(checkEligibility(R2, vn(D, '23:59', 58))).toBe('ok');
    expect(checkEligibility(R2, vn('2026-11-13', '00:00', 0))).toBe('window-closed');
    expect(returnDeadlineExclusive(R2.deliveredAt).toISOString()).toBe(vn('2026-11-13', '00:00').toISOString());
    const R3 = { ...R2, deliveredAt: vn('2026-10-12', '10:00') }; // D-31
    expect(checkEligibility(R3, vn(D, '08:00'))).toBe('window-closed');
    // giao lúc 23:59:59 và 00:00:00 VN: cùng quy tắc theo NGÀY giao VN
    expect(returnDeadline(vn('2026-10-13', '23:59', 59)).toISOString()).toBe(vn(D, '23:59', 59).toISOString());
    expect(returnDeadline(vn('2026-10-14', '00:00', 0)).toISOString()).toBe(vn('2026-11-13', '23:59', 59).toISOString());
  };
  it('R2 (giao D-30): còn hạn tới 23:59:59, đóng lúc 00:00:00 ngày sau; R3 (D-31) đã đóng', run);
  it('cùng kết quả dưới 4 múi giờ phiên', () => {
    const old = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        run();
      }
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
  it('điều kiện đơn kiểm TRƯỚC hạn: chưa completed / thiếu deliveredAt / chưa paid / refunded / partially_refunded -> not-returnable', () => {
    const at = vn(D, '08:00');
    expect(checkEligibility({ ...R2, status: 'to_receive' }, at)).toBe('not-returnable');
    expect(checkEligibility({ ...R2, deliveredAt: null }, at)).toBe('not-returnable');
    for (const p of ['pending', 'failed', 'refunded', 'partially_refunded']) expect(checkEligibility({ ...R2, paymentStatus: p }, at)).toBe('not-returnable');
    expect(checkEligibility({ ...R2, paymentStatus: 'refunded', deliveredAt: vn('2026-09-01', '08:00') }, at)).toBe('not-returnable');
    expect(RETURNS_ASSUMPTIONS.windowDays).toBe(30);
  });
});

describe('T-RET-07 AC-RET-15 (hạ tầng): kho ảnh riêng tư', () => {
  afterEach(() => setPrivateImageStorage(undefined));

  it('khoá rp-... khác mẫu công khai up-...; /api/media không phục vụ rp-...', async () => {
    const key = `rp-${randomBytes(16).toString('hex')}.jpg`;
    expect(RETURN_PHOTO_KEY_RE.test(key)).toBe(true);
    expect(RETURN_PHOTO_KEY_RE.test(`up-${'a'.repeat(32)}.jpg`)).toBe(false);
    await resetState();
    const res = await get(`/api/media/${key}`);
    expect(res.status).toBe(404);
  });

  it('driver cục bộ: put / read đúng byte; khoá sai mẫu bị từ chối / null; không ghi đè', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'n2f-priv-'));
    try {
      const s = new LocalPrivateStorage(dir);
      const key = `rp-${randomBytes(16).toString('hex')}.png`;
      const data = Buffer.from([1, 2, 3, 4]);
      await s.put(key, data, 'image/png');
      const back = await s.read(key);
      expect(back?.data.equals(data)).toBe(true);
      expect(back?.contentType).toBe('image/png');
      await expect(s.put(key, data, 'image/png')).rejects.toThrow(); // wx
      await expect(s.put('../x.png', data, 'image/png')).rejects.toThrow('invalid-private-key');
      await expect(s.put(`up-${'a'.repeat(32)}.png`, data, 'image/png')).rejects.toThrow('invalid-private-key');
      expect(await s.read('../x.png')).toBeNull();
      expect(await s.read(`rp-${'0'.repeat(32)}.jpg`)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('driver Supabase (fetch giả)', () => {
    const KEY = 'service-role-secret-key';
    const cfg = { url: 'https://x.supabase.co/', serviceRoleKey: KEY, bucket: 'return-photos', publicBucket: 'product-images' };
    const key = `rp-${'a'.repeat(32)}.jpg`;
    const mk = (bucketPublic: unknown, calls: Array<{ url: string; method: string; auth: string | null }>) =>
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization') });
        if (url.includes('/storage/v1/bucket/')) return new Response(JSON.stringify({ public: bucketPublic }), { status: 200 });
        if (url.includes('/object/authenticated/')) return new Response(new Uint8Array([9, 9]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

    it('đọc qua endpoint authenticated, KHÔNG gọi public; ghi vào bucket riêng; kiểm bucket đúng một lần', async () => {
      const calls: Array<{ url: string; method: string; auth: string | null }> = [];
      const s = new SupabasePrivateStorage(cfg, mk(false, calls));
      await s.put(key, Buffer.from([1]), 'image/jpeg');
      const r = await s.read(key);
      expect(r?.data.equals(Buffer.from([9, 9]))).toBe(true);
      await s.read(key);
      expect(calls.filter((c) => c.url.includes('/storage/v1/bucket/'))).toHaveLength(1);
      expect(calls.some((c) => c.url.includes('/object/public/'))).toBe(false);
      expect(calls.some((c) => c.url.endsWith(`/object/authenticated/return-photos/${key}`))).toBe(true);
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith(`/object/return-photos/${key}`))).toBe(true);
      expect(calls.every((c) => c.auth === `Bearer ${KEY}`)).toBe(true);
    });

    it('bucket public = true (hoặc không xác định) -> unavailable cho mọi thao tác, kể cả sau đó', async () => {
      for (const pub of [true, undefined, 'yes']) {
        const calls: Array<{ url: string; method: string; auth: string | null }> = [];
        const s = new SupabasePrivateStorage(cfg, mk(pub, calls));
        await expect(s.put(key, Buffer.from([1]), 'image/jpeg')).rejects.toMatchObject({ code: 'unavailable' });
        await expect(s.read(key)).rejects.toMatchObject({ code: 'unavailable' });
        expect(calls.some((c) => c.method === 'POST')).toBe(false);
        expect(calls.filter((c) => c.url.includes('/storage/v1/bucket/'))).toHaveLength(1); // verdict được nhớ
      }
    });

    it('bucket trùng bucket công khai -> unavailable, không gọi mạng; lỗi mạng khi kiểm -> unavailable nhưng thử lại được', async () => {
      const calls: Array<{ url: string; method: string; auth: string | null }> = [];
      const same = new SupabasePrivateStorage({ ...cfg, bucket: 'product-images' }, mk(false, calls));
      await expect(same.read(key)).rejects.toMatchObject({ code: 'unavailable' });
      expect(calls).toHaveLength(0);
      let fail = true;
      const flaky = new SupabasePrivateStorage(cfg, (async (input: RequestInfo | URL) => {
        if (fail) throw new Error('network');
        return String(input).includes('/storage/v1/bucket/') ? new Response(JSON.stringify({ public: false }), { status: 200 }) : new Response(new Uint8Array([1]), { status: 200 });
      }) as unknown as typeof fetch);
      await expect(flaky.read(key)).rejects.toMatchObject({ code: 'unavailable' });
      fail = false;
      await expect(flaky.read(key)).resolves.not.toBeNull();
    });

    it('khoá dịch vụ không vào log / thông điệp lỗi', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      process.env.LOG_IN_TEST = '1';
      try {
        const s = new SupabasePrivateStorage(cfg, mk(true, []));
        const err = await s.read(key).catch((e: unknown) => e);
        expect(JSON.stringify(err instanceof AppError ? { m: err.message, x: err.extras } : String(err))).not.toContain(KEY);
        expect(spy.mock.calls.flat().join(' ')).not.toContain(KEY);
      } finally {
        delete process.env.LOG_IN_TEST;
        spy.mockRestore();
      }
    });
  });

  it('cấu hình: bucket mặc định return-photos, khoá tài khoản 32 byte; sai độ dài -> null', () => {
    const base = { DATABASE_URL: 'postgresql://x@127.0.0.1/db', OTP_HMAC_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv;
    const c = loadConfig(base);
    expect(c.returns.photoBucket).toBe('return-photos');
    expect(c.returns.publicBucket).toBe('product-images');
    expect(c.returns.accountKey).toBeNull();
    expect(loadConfig({ ...base, RETURN_ACCOUNT_KEY: Buffer.alloc(32, 1).toString('base64') }).returns.accountKey?.length).toBe(32);
    expect(loadConfig({ ...base, RETURN_ACCOUNT_KEY: Buffer.alloc(16, 1).toString('base64') }).returns.accountKey).toBeNull();
  });
});

describe('T-RET-08 AC-RET-17 (hạ tầng): account-secret', () => {
  const RID = '11111111-1111-4111-8111-111111111111';
  it('mã hoá / giải mã qua lại; hai lần mã hoá cho bản mã khác nhau (IV); bản mã không chứa số', () => {
    const a = encryptAccountNumber('1234567890', RID);
    const b = encryptAccountNumber('1234567890', RID);
    expect(a).not.toBe(b);
    expect(a).not.toContain('1234567890');
    expect(decryptAccountNumber(a, RID)).toBe('1234567890');
    expect(decryptAccountNumber(b, RID)).toBe('1234567890');
    expect(a.length).toBeLessThanOrEqual(200);
    expect(encryptAccountNumber('1'.repeat(19), RID).length).toBeLessThanOrEqual(200);
  });
  it('AAD khác (đổi chỗ bản mã) hoặc bản mã bị sửa -> lỗi', () => {
    const a = encryptAccountNumber('1234567890', RID);
    expect(() => decryptAccountNumber(a, '22222222-2222-4222-8222-222222222222')).toThrow();
    const raw = Buffer.from(a, 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decryptAccountNumber(raw.toString('base64'), RID)).toThrow();
    expect(() => decryptAccountNumber('abc', RID)).toThrow();
  });
  it('last4Of; hmacForHash ổn định, khác khi số khác, không chứa số', () => {
    expect(last4Of('1234567890')).toBe('7890');
    expect(hmacForHash('1234567890')).toBe(hmacForHash('1234567890'));
    expect(hmacForHash('1234567890')).not.toBe(hmacForHash('1234567891'));
    expect(hmacForHash('1234567890')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('thiếu khoá -> unavailable (mã hoá), hmac vẫn dẫn xuất được', () => {
    const saved = process.env.RETURN_ACCOUNT_KEY;
    try {
      delete process.env.RETURN_ACCOUNT_KEY;
      resetConfigCache();
      expect(() => encryptAccountNumber('1234567890', RID)).toThrow(expect.objectContaining({ code: 'unavailable' }));
      expect(hmacForHash('1234567890')).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      process.env.RETURN_ACCOUNT_KEY = saved;
      resetConfigCache();
    }
  });
});
