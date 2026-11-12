import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORE_SETTINGS_SEED } from '../src/config/assumptions';
import prisma from '../src/config/prisma';
import { logger } from '../src/lib/logger';
import { resetCatalogRateLimit } from '../src/middleware/catalog-rate-limit';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { settingsEventWriter } from '../src/modules/insights-admin/settings.event';
import {
  advance, assertNoSecrets, call, flushMail, freshIp, get, iGet, iPut, loginAdmin, loginMember, loginStaff, mails, orderBody, post, resetCheckout, resetState, resetStoreSettings,
  submitOrder, useClock, vid,
} from './helpers';

/** Lát 8.4 (Cài đặt cửa hàng + công khai): T-SET-01..12, 20, 30, 31. D = 2026-11-12 VN. */

const NOW = '2026-11-12T08:00:00Z';
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-s@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-s@nine2fine.test');
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  resetCatalogRateLimit();
  await resetStoreSettings();
  await prisma.$executeRawUnsafe('DELETE FROM store_settings_events');
  mails.length = 0;
  useClock(NOW);
  vi.restoreAllMocks();
});

type Json = Record<string, any>;
const getSettings = async (cookie = admin.cookie) => (await iGet('/settings/store', cookie)).body as Json;
/** Thân PUT hợp lệ dựng từ bản GET (bỏ trường chỉ đọc), ghi đè theo `over` (trộn sâu mức nhóm). */
const bodyFrom = (g: Json, over: Json = {}): Json => {
  const { hotlineHref: _h, ...info } = g.info;
  return {
    updatedAt: over.updatedAt ?? g.updatedAt,
    info: { ...info, ...(over.info ?? {}) },
    operations: { ...g.operations, ...(over.operations ?? {}) },
    ...(over.cart || g.cart ? { cart: { ...g.cart, ...(over.cart ?? {}) } } : {}),
  };
};
const put = (b: unknown, cookie = admin.cookie) => iPut('/settings/store', b, cookie);
const events = () => prisma.storeSettingsEvent.findMany({ orderBy: { at: 'asc' } });
const dbRow = () => prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
const fieldsOf = (res: { body: Json }): string[] => (res.body.error.fieldErrors as Array<{ field: string }>).map((f) => f.field);

describe('T-SET-01 AC-SET-01: đọc; staff 403', () => {
  it('A GET 200 đủ info + operations + cart + derived + updatedAt; không bankTransferEnabled; S GET / PUT 403, DB không đổi', async () => {
    const r = await iGet('/settings/store', admin.cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(Object.keys(r.body).sort()).toEqual(['cart', 'derived', 'info', 'operations', 'updatedAt']);
    expect(r.body.info).toEqual({ ...STORE_SETTINGS_SEED.info, hotlineHref: 'tel:1900686829' });
    expect(r.body.operations).toEqual(STORE_SETTINGS_SEED.operations);
    expect(r.body.cart).toEqual(STORE_SETTINGS_SEED.cart);
    expect(r.body.derived).toEqual({ deliveryWindow: '2–4 ngày', lowStockDefault: 5 });
    expect(r.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r.text).not.toMatch(/bankTransferEnabled|bank_transfer_enabled/);
    assertNoSecrets(r);

    const before = await dbRow();
    const s = await iGet('/settings/store', staff.cookie);
    expect(s.status).toBe(403);
    expect(s.body.error.code).toBe('forbidden');
    expect(s.headers['cache-control']).toMatch(/no-store/);
    const sp = await put(bodyFrom(r.body, { info: { hotline: '0912345678' } }), staff.cookie);
    expect(sp.status).toBe(403);
    expect(await dbRow()).toEqual(before);
    expect(await events()).toHaveLength(0);
    // không đăng nhập: 401
    expect((await iGet('/settings/store')).status).toBe(401);
    expect((await put(bodyFrom(r.body))).status).toBe(200);
  });
});

describe('T-SET-02 AC-SET-02: thông tin cửa hàng, mọi lỗi một lần', () => {
  it('sai nhiều trường: 422 đúng field + fieldErrors đủ mọi lỗi, không lưu trường nào, không nhật ký', async () => {
    const g = await getSettings();
    const before = await dbRow();
    const res = await put(
      bodyFrom(g, {
        info: { legalName: 'A', registrationNumber: '12345', registrationDate: '2026-11-13', address: 'ngắn quá', hours: 'x'.repeat(101), hotline: '123', email: 'a@b' },
        operations: { shippingFee: 30_500 },
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(fieldsOf(res).sort()).toEqual([
      'info.address', 'info.email', 'info.hotline', 'info.hours', 'info.legalName', 'info.registrationDate', 'info.registrationNumber', 'operations.shippingFee',
    ]);
    expect(res.body.error.field).toBe(res.body.error.fieldErrors[0].field);
    expect(res.body.error.message).toBe(res.body.error.fieldErrors[0].message);
    expect(await dbRow()).toEqual(before);
    expect(await events()).toHaveLength(0);
    assertNoSecrets(res);
  });

  it('từng giá trị biên', async () => {
    const g = await getSettings();
    const bad = async (info: Json, field: string) => {
      const r = await put(bodyFrom(g, { info }));
      expect(r.status, JSON.stringify(info)).toBe(422);
      expect(fieldsOf(r), JSON.stringify(info)).toEqual([field]);
    };
    await bad({ legalName: 'A' }, 'info.legalName');
    await bad({ legalName: 'A'.repeat(121) }, 'info.legalName');
    await bad({ registrationNumber: '12345' }, 'info.registrationNumber');
    await bad({ registrationNumber: '123456789' }, 'info.registrationNumber');
    await bad({ registrationNumber: '12345678901' }, 'info.registrationNumber');
    await bad({ registrationNumber: '03192457a8' }, 'info.registrationNumber');
    await bad({ address: '123456789' }, 'info.address');
    await bad({ registrationDate: '2026-11-13' }, 'info.registrationDate'); // ngày mai (VN)
    await bad({ registrationDate: '2026-02-30' }, 'info.registrationDate');
    await bad({ registrationDate: 'hôm qua' }, 'info.registrationDate');
    await bad({ hours: 'h'.repeat(101) }, 'info.hours');
    await bad({ legalName: 'Công ty\u0007' }, 'info.legalName'); // ký tự điều khiển
    const ok = await put(
      bodyFrom(g, {
        info: { legalName: '  Công   ty  TNHH  Mới \n', registrationNumber: '0319245768123', registrationDate: '2026-11-12', address: '1234567890', hours: 'h'.repeat(100), registrationIssuer: '' },
      }),
    );
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(200);
    expect(ok.body.info).toMatchObject({ legalName: 'Công ty TNHH Mới', registrationNumber: '0319245768123', registrationDate: '2026-11-12', address: '1234567890', registrationIssuer: '' });
    const cleared = await put(bodyFrom(ok.body, { info: { registrationDate: null } }));
    expect(cleared.status).toBe(200);
    expect(cleared.body.info.registrationDate).toBeNull();
    const blank = await put(bodyFrom(cleared.body, { info: { registrationDate: '' } }));
    expect(blank.status).toBe(200); // '' = chưa nhập = không đổi
    expect(blank.body.updatedAt).toBe(cleared.body.updatedAt);
    // thân thiếu nhóm bắt buộc / sai kiểu
    const missing = await put({ updatedAt: cleared.body.updatedAt });
    expect(missing.status).toBe(422);
    expect(fieldsOf(missing)).toEqual(expect.arrayContaining(['info', 'operations']));
    expect((await put(bodyFrom(cleared.body, { info: { legalName: 12345 } }))).status).toBe(422);
    expect((await iPut('/settings/store', [], admin.cookie)).status).toBe(422);
  });
});

describe('T-SET-03 AC-SET-03: liên hệ', () => {
  it('hotline hợp lệ lưu đúng dạng, hotlineHref; sai 422 info.hotline; email chữ thường', async () => {
    let g = await getSettings();
    for (const [hotline, href] of [['1900 6868 29', 'tel:1900686829'], ['0912.345.678', 'tel:0912345678'], ['1800-1234', 'tel:18001234']] as const) {
      const r = await put(bodyFrom(g, { info: { hotline } }));
      expect(r.status, hotline).toBe(200);
      expect(r.body.info.hotline).toBe(hotline);
      expect(r.body.info.hotlineHref).toBe(href);
      g = r.body;
    }
    for (const hotline of ['123', 'abc', '1900', '0912345678901', '+84912345678', '1900 6868 29 11 22 33 44 55 66']) {
      const r = await put(bodyFrom(g, { info: { hotline } }));
      expect(r.status, hotline).toBe(422);
      expect(r.body.error.field).toBe('info.hotline');
    }
    const e = await put(bodyFrom(g, { info: { email: ' CSKH@Nine2Fine.vn ' } }));
    expect(e.body.info.email).toBe('cskh@nine2fine.vn');
    for (const email of ['a@b', 'khong-co-a-cong', `${'a'.repeat(250)}@b.vn`, '']) {
      const r = await put(bodyFrom(g, { info: { email } }));
      expect(r.status, email.slice(0, 20)).toBe(422);
      expect(r.body.error.field).toBe('info.email');
    }
    const priv = await put(bodyFrom(g, { info: { privacyEmail: '' } }));
    expect(priv.status).toBe(200);
    expect(priv.body.info.privacyEmail).toBe('');
    expect((await put(bodyFrom(priv.body, { info: { privacyEmail: 'sai' } }))).body.error.field).toBe('info.privacyEmail');
  });
});

describe('T-SET-04 AC-SET-05: vận hành', () => {
  it('shippingFee, ngưỡng, giữ đơn, COD: biên hợp lệ / không hợp lệ', async () => {
    const g = await getSettings();
    const ok = async (operations: Json) => expect((await put(bodyFrom(await getSettings(), { operations }))).status, JSON.stringify(operations)).toBe(200);
    const bad = async (operations: Json, field: string) => {
      const r = await put(bodyFrom(g, { operations }));
      expect(r.status, JSON.stringify(operations)).toBe(422);
      expect(fieldsOf(r)).toEqual([field]);
    };
    await ok({ shippingFee: 500_000 });
    await bad({ shippingFee: 500_001 }, 'operations.shippingFee');
    await bad({ shippingFee: -1 }, 'operations.shippingFee');
    await bad({ shippingFee: 30_500 }, 'operations.shippingFee');
    await bad({ shippingFee: 25.5 }, 'operations.shippingFee');
    await bad({ shippingFee: '30000' }, 'operations.shippingFee');
    await ok({ shippingFee: 0 });
    await ok({ freeShippingThreshold: 0 });
    await ok({ freeShippingThreshold: 50_000_000 });
    await bad({ freeShippingThreshold: 50_001_000 }, 'operations.freeShippingThreshold');
    await bad({ freeShippingThreshold: 999_999 }, 'operations.freeShippingThreshold');
    await bad({ bankHoldMinutes: 9 }, 'operations.bankHoldMinutes');
    await ok({ bankHoldMinutes: 10 });
    await ok({ bankHoldMinutes: 1440 });
    await bad({ bankHoldMinutes: 1441 }, 'operations.bankHoldMinutes');
    await bad({ codMaxTotal: 99_000 }, 'operations.codMaxTotal');
    await ok({ codMaxTotal: 100_000 });
    await bad({ codMaxTotal: 50_000_001 }, 'operations.codMaxTotal');
    await ok({ codMaxTotal: 50_000_000 });
  });
});

describe('T-SET-05 AC-SET-06: giao hàng', () => {
  it('min > max 422 operations.deliveryDaysMax; 2/4 ok + deliveryWindow; 0/3, 3/31 422; cutoffHour', async () => {
    const g = await getSettings();
    const r = await put(bodyFrom(g, { operations: { deliveryDaysMin: 4, deliveryDaysMax: 2 } }));
    expect(r.status).toBe(422);
    expect(r.body.error.field).toBe('operations.deliveryDaysMax');
    const ok = await put(bodyFrom(g, { operations: { deliveryDaysMin: 2, deliveryDaysMax: 4 } }));
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(200);
    expect(ok.body.derived.deliveryWindow).toBe('2–4 ngày');
    const w = await put(bodyFrom(ok.body, { operations: { deliveryDaysMin: 3, deliveryDaysMax: 5 } }));
    expect(w.body.derived.deliveryWindow).toBe('3–5 ngày');
    expect(fieldsOf(await put(bodyFrom(w.body, { operations: { deliveryDaysMin: 0, deliveryDaysMax: 3 } })))).toEqual(['operations.deliveryDaysMin']);
    expect(fieldsOf(await put(bodyFrom(w.body, { operations: { deliveryDaysMin: 3, deliveryDaysMax: 31 } })))).toEqual(['operations.deliveryDaysMax']);
    for (const cutoffHour of [24, -1]) expect(fieldsOf(await put(bodyFrom(w.body, { operations: { cutoffHour } })))).toEqual(['operations.cutoffHour']);
    expect((await put(bodyFrom(w.body, { operations: { cutoffHour: 16 } }))).status).toBe(200);
    expect((await put(bodyFrom(w.body, { operations: { cutoffHour: 0 } }))).status).toBe(200);
  });
});

describe('T-SET-06 AC-SET-08: chống ghi chồng', () => {
  it('A1, A2 cùng updatedAt: A1 200 updatedAt mới; A2 (hotline mới) 409; DB = bản A1; đúng 1 dòng nhật ký', async () => {
    const g = await getSettings();
    const a1 = await put(bodyFrom(g, { operations: { shippingFee: 35_000 } }));
    expect(a1.status).toBe(200);
    expect(a1.body.updatedAt).not.toBe(g.updatedAt);
    expect(new Date(a1.body.updatedAt).getTime()).toBeGreaterThan(new Date(g.updatedAt).getTime());
    const a2 = await put(bodyFrom(g, { info: { hotline: '0912345678' } }));
    expect(a2.status).toBe(409);
    expect(a2.body.error.code).toBe('version-conflict');
    expect(a2.headers['cache-control']).toMatch(/no-store/);
    const row = await dbRow();
    expect(row.shippingFee).toBe(35_000);
    expect(row.hotline).toBe(STORE_SETTINGS_SEED.info.hotline);
    expect(await events()).toHaveLength(1);
    // tải lại rồi lưu lại bằng updatedAt mới -> 200
    expect((await put(bodyFrom(a1.body, { info: { hotline: '0912345678' } }))).status).toBe(200);
    expect(await events()).toHaveLength(2);
    // thân thiếu / sai updatedAt: 422 trước 409
    expect(fieldsOf(await put({ ...bodyFrom(g), updatedAt: 'hôm qua' }))).toEqual(['updatedAt']);
  });
});

describe('T-SET-07 AC-SET-09: lưu nguyên tử', () => {
  it('shippingFee hợp lệ + bankHoldMinutes 5: 422 operations.bankHoldMinutes; shipping_fee không đổi; không dòng', async () => {
    const g = await getSettings();
    const r = await put(bodyFrom(g, { operations: { shippingFee: 45_000, bankHoldMinutes: 5 } }));
    expect(r.status).toBe(422);
    expect(r.body.error.field).toBe('operations.bankHoldMinutes');
    expect((await dbRow()).shippingFee).toBe(30_000);
    expect(await events()).toHaveLength(0);
  });
});

describe('T-SET-08 AC-SET-10: lưu đúng giá trị hiện có', () => {
  it('200, updated_at không đổi, không dòng (cả updatedAt hiện tại và cũ)', async () => {
    const g = await getSettings();
    const first = await put(bodyFrom(g, { operations: { shippingFee: 40_000 } }));
    const before = await dbRow();
    const same = await put(bodyFrom(first.body));
    expect(same.status).toBe(200);
    expect(same.body.updatedAt).toBe(first.body.updatedAt);
    const stale = await put(bodyFrom(first.body, { updatedAt: g.updatedAt })); // updatedAt cũ nhưng giá trị y hệt -> 200 (plan 14 #5)
    expect(stale.status).toBe(200);
    expect(stale.body.operations.shippingFee).toBe(40_000);
    expect((await dbRow()).updatedAt).toEqual(before.updatedAt);
    expect(await events()).toHaveLength(1);
  });
});

describe('T-SET-09 AC-SET-12: nhật ký đổi cài đặt', () => {
  it('đổi shippingFee + hotline: đúng 1 dòng, người + vai trò + thời điểm, 2 mục; 422 / 403 không thêm dòng', async () => {
    const g = await getSettings();
    const r = await put(bodyFrom(g, { operations: { shippingFee: 45_000 }, info: { hotline: '0912 345 678' } }));
    expect(r.status).toBe(200);
    const list = await events();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ actorUserId: admin.user.user_id, actorName: 'Trị Quản', actorRole: 'admin' });
    expect(list[0].at.toISOString()).toBe(r.body.updatedAt);
    expect(list[0].changes).toEqual([
      { field: 'info.hotline', label: 'Hotline', before: '1900 6868 29', after: '0912 345 678' },
      { field: 'operations.shippingFee', label: 'Phí vận chuyển', before: '30000', after: '45000' },
    ]);
    await put(bodyFrom(r.body, { operations: { shippingFee: 30_500 } })); // 422
    await put(bodyFrom(r.body, { operations: { shippingFee: 50_000 } }), staff.cookie); // 403
    expect(await events()).toHaveLength(1);
    expect((await call('put', '/api/admin/audit-log', {}, { cookie: admin.cookie, ip: freshIp() })).status).toBe(404);
    expect((await call('delete', '/api/admin/audit-log', undefined, { cookie: admin.cookie, ip: freshIp() })).status).toBe(404);
  });

  it('before / after dài > 300 ký tự được cắt, mọi giá trị là chuỗi', async () => {
    const g = await getSettings();
    const url = `https://example.com/${'a'.repeat(270)}`; // 290 ký tự
    const r = await put(bodyFrom(g, { info: { notificationUrl: url } }));
    expect(r.status).toBe(200);
    const [e] = await events();
    const ch = (e.changes as Array<{ after: string }>)[0];
    expect(ch.after).toBe(url);
    expect(ch.after.length).toBeLessThanOrEqual(300);
    expect(typeof (e.changes as Array<{ before: unknown }>)[0].before).toBe('string');
  });
});

describe('T-SET-10 AC-SET-12 (nguyên tử): giả lỗi nhật ký, ghi đồng thời', () => {
  it('insert nhật ký ném lỗi: 500, cài đặt không đổi, không dòng; log không chứa giá trị cài đặt', async () => {
    const g = await getSettings();
    const spy = vi.spyOn(settingsEventWriter, 'insert').mockRejectedValue(new Error('disk full'));
    const logSpy = vi.spyOn(logger, 'error');
    const r = await put(bodyFrom(g, { operations: { shippingFee: 45_000 }, info: { address: 'Địa chỉ mới rất dài 123' } }));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('unavailable');
    assertNoSecrets(r);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('Địa chỉ mới');
    spy.mockRestore();
    const row = await dbRow();
    expect(row.shippingFee).toBe(30_000);
    expect(row.address).toBe(STORE_SETTINGS_SEED.info.address);
    expect(row.updatedAt.toISOString()).toBe(g.updatedAt);
    expect(await events()).toHaveLength(0);
  });

  it('hai PUT song song cùng updatedAt: đúng 1 thành công, 1 409, 1 dòng', async () => {
    const g = await getSettings();
    const [a, b] = await Promise.all([
      put(bodyFrom(g, { operations: { shippingFee: 41_000 } })),
      put(bodyFrom(g, { operations: { shippingFee: 42_000 } })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await events()).toHaveLength(1);
    expect([41_000, 42_000]).toContain((await dbRow()).shippingFee);
  });
});

describe('T-SET-11 AC-SET-04: liên kết mạng xã hội và thông báo', () => {
  it('https ok; http / javascript: / 301 ký tự 422 info.social.facebook; rỗng -> công khai null; notificationUrl tương tự', async () => {
    const g = await getSettings();
    const ok = await put(bodyFrom(g, { info: { social: { facebook: 'https://facebook.com/nine2fine', instagram: 'https://instagram.com/nine2fine' }, notificationUrl: 'https://online.gov.vn/x' } }));
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(200);
    expect(ok.body.info.social).toEqual({ facebook: 'https://facebook.com/nine2fine', instagram: 'https://instagram.com/nine2fine', tiktok: '', youtube: '' });
    for (const v of ['http://x.com', 'javascript:alert(1)', `https://x.com/${'a'.repeat(300)}`, 'data:text/html,x', 'https://có khoảng trắng.vn', 'ftp://x.vn', 'https://']) {
      const r = await put(bodyFrom(ok.body, { info: { social: { facebook: v } } }));
      expect(r.status, v.slice(0, 30)).toBe(422);
      expect(r.body.error.field).toBe('info.social.facebook');
    }
    const n = await put(bodyFrom(ok.body, { info: { notificationUrl: 'http://x.vn' } }));
    expect(n.body.error.field).toBe('info.notificationUrl');
    // vắng = giữ nguyên
    const { social: _s, notificationUrl: _n, ...info } = bodyFrom(ok.body).info;
    const keep = await put({ ...bodyFrom(ok.body), info });
    expect(keep.status).toBe(200);
    expect(keep.body.info.social.facebook).toBe('https://facebook.com/nine2fine');
    expect(keep.body.info.notificationUrl).toBe('https://online.gov.vn/x');
    // xoá bằng chuỗi rỗng -> công khai null
    const clear = await put(bodyFrom(keep.body, { info: { social: { facebook: '', instagram: '' }, notificationUrl: '' } }));
    expect(clear.status).toBe(200);
    const pub = await get('/api/store/settings', { ip: freshIp() });
    expect(pub.body.info.social).toEqual({ facebook: null, instagram: null, tiktok: null, youtube: null });
    expect(pub.body.info.notificationUrl).toBeNull();
  });
});

describe('T-SET-12 AC-SET-07: tham số giỏ', () => {
  it('maxPerVariant 21 / 0 422; maxCartLines nhỏ hơn: giỏ đang có giữ nguyên, thêm dòng mới bị từ chối', async () => {
    const g = await getSettings();
    for (const maxPerVariant of [21, 0]) {
      const r = await put(bodyFrom(g, { cart: { maxPerVariant } }));
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('cart.maxPerVariant');
    }
    expect(fieldsOf(await put(bodyFrom(g, { cart: { codRefusalLimit: 11, cartRetentionDays: 181, maxItemsPerOrder: 101 } })))).toEqual(['cart.maxItemsPerOrder', 'cart.cartRetentionDays', 'cart.codRefusalLimit']);
    const m = await loginMember('gio-s@example.com');
    const skus = [['off-duty-top', 'Trắng'], ['weekend-shirt', 'Trắng'], ['the-everyday-blazer', 'Đen']] as const;
    const variants: string[] = [];
    for (const [slug, color] of skus) variants.push(await vid(slug, color, 'S'));
    for (const v of variants) {
      const r = await post('/api/cart/lines', { variantId: v, quantity: 1 }, { cookie: m.cookie, ip: freshIp() });
      expect(r.status).toBe(200);
    }
    const set = await put(bodyFrom(g, { cart: { maxCartLines: 2 } }));
    expect(set.status).toBe(200);
    expect(set.body.cart.maxCartLines).toBe(2);
    expect(await prisma.cartLine.count()).toBe(3); // không cắt giỏ đang có
    const extra = await post('/api/cart/lines', { variantId: await vid('after-hours-dress', 'Đỏ', 'S'), quantity: 1 }, { cookie: m.cookie, ip: freshIp() });
    expect(extra.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.cartLine.count()).toBe(3);
    // cart vắng = giữ nguyên
    const noCart = bodyFrom(set.body);
    delete noCart.cart;
    const keep = await put({ ...noCart, operations: { ...noCart.operations, shippingFee: 36_000 } });
    expect(keep.body.cart.maxCartLines).toBe(2);
  });
});

describe('T-SET-20 AC-SET-11: hiệu lực ngay, đơn đã tạo không đổi, thư dùng hotline mới', () => {
  it('đổi phí ship / giữ đơn / hotline: đơn cũ giữ nguyên (API + SQL), báo giá và đơn mới dùng giá trị mới; thư đơn mới in hotline mới', async () => {
    await resetCheckout();
    admin = await loginAdmin('admin-s2@nine2fine.test');
    useClock(NOW);
    const top = await vid('off-duty-top', 'Trắng', 'S'); // 390.000: dưới ngưỡng miễn phí vận chuyển
    const m = await loginMember('khach-s20@example.com');
    const orderA = await submitOrder(await orderBody([{ variantId: top, quantity: 1 }], { cookie: m.cookie, phone: '0912345601' }), { cookie: m.cookie });
    expect(orderA.status).toBe(201);
    await flushMail();
    const codeA = orderA.body.order.id as string;
    const snapshotBefore = await prisma.order.findUniqueOrThrow({ where: { code: codeA } });
    expect(snapshotBefore.shippingFee).toBe(30_000);
    expect(mails.find((x) => x.to === 'khach@example.com')!.text).toContain('Hotline CSKH: 1900 6868 29');
    const mailsBefore = mails.length;

    const g = await getSettings(admin.cookie);
    const set = await put(bodyFrom(g, { operations: { shippingFee: 45_000, bankHoldMinutes: 60 }, info: { hotline: '0909 888 777' } }), admin.cookie);
    expect(set.status).toBe(200);

    const after = await prisma.order.findUniqueOrThrow({ where: { code: codeA } });
    expect([after.shippingFee, after.shippingDiscount, after.total, after.paymentDueAt, after.estimatedFrom.getTime(), after.estimatedTo.getTime()]).toEqual([
      snapshotBefore.shippingFee, snapshotBefore.shippingDiscount, snapshotBefore.total, snapshotBefore.paymentDueAt, snapshotBefore.estimatedFrom.getTime(), snapshotBefore.estimatedTo.getTime(),
    ]);
    const viaApi = await get(`/api/admin/orders/${codeA}`, { cookie: admin.cookie, ip: freshIp() });
    expect(viaApi.status).toBe(200);
    expect(viaApi.body.pricing.shippingFee).toBe(30_000);
    expect(mails.length).toBe(mailsBefore); // không gửi lại thư cho đơn cũ

    const quote = await post('/api/checkout/quote', { items: [{ variantId: top, quantity: 1 }], voucherCodes: [], contact: { phone: '0912345602', email: 'khach@example.com' } }, { ip: freshIp() });
    expect(quote.status).toBe(200);
    expect(quote.body.pricing.shippingFee).toBe(45_000);
    expect(quote.body.policy).toMatchObject({ shippingFee: 45_000, bankHoldMinutes: 60 });

    const orderB = await submitOrder(await orderBody([{ variantId: top, quantity: 1 }], { phone: '0912345603', email: 'khach-b@example.com' }));
    expect(orderB.status).toBe(201);
    expect(orderB.body.order.pricing.shippingFee).toBe(45_000);
    await flushMail();
    const mailB = mails.find((x) => x.to === 'khach-b@example.com')!;
    expect(mailB.text).toContain('Hotline CSKH: 0909 888 777');
    expect(mailB.text).not.toContain('1900 6868 29');
  });
});

describe('T-SET-30 AC-SET-13: công khai', () => {
  const pub = (opts: { cookie?: string; ip?: string } = {}) => get('/api/store/settings', { ip: opts.ip ?? freshIp(), cookie: opts.cookie });

  it('200 public, max-age=60; khoá chính xác {info, policy}; whitelist; deliveryWindow; không Set-Cookie', async () => {
    const g = await getSettings();
    await put(bodyFrom(g, { operations: { deliveryDaysMin: 2, deliveryDaysMax: 4 }, cart: { maxPerVariant: 7 } }));
    const r = await pub({ cookie: 'n2f_sid=phien-la; n2f_asid=khac' });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=60');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(Object.keys(r.body).sort()).toEqual(['info', 'policy']);
    expect(Object.keys(r.body.info).sort()).toEqual([
      'address', 'email', 'hotline', 'hotlineHref', 'hours', 'legalName', 'notificationUrl', 'privacyEmail', 'registrationDate', 'registrationIssuer', 'registrationNumber', 'social',
    ]);
    expect(Object.keys(r.body.info.social).sort()).toEqual(['facebook', 'instagram', 'tiktok', 'youtube']);
    expect(r.body.policy).toEqual({ freeShippingFrom: 1_000_000, shippingFee: 30_000, deliveryWindow: '2–4 ngày', paymentHoldMinutes: 30 });
    expect(r.body.info).toMatchObject({ hotline: '1900 6868 29', hotlineHref: 'tel:1900686829', notificationUrl: null, registrationDate: '2025-08-15' });
    for (const k of ['codMax', 'maxPerVariant', 'updatedAt', 'bank', 'cart', 'lowStock']) expect(JSON.stringify(r.body)).not.toContain(k);
    assertNoSecrets(r);
  });

  it('thiếu dòng cài đặt: trả mặc định, không 500, không ghi DB; POST 404; 121 yêu cầu -> 429', async () => {
    await prisma.$executeRawUnsafe('DELETE FROM store_settings');
    const r = await pub();
    expect(r.status).toBe(200);
    expect(r.body.info.legalName).toBe(STORE_SETTINGS_SEED.info.legalName);
    expect(r.body.policy.deliveryWindow).toBe('2–4 ngày');
    expect(await prisma.storeSetting.count()).toBe(0); // đường công khai không ghi
    const post404 = await post('/api/store/settings', {}, { ip: freshIp(), origin: null, xrw: null });
    expect(post404.status).toBe(404);
    expect(post404.body.error.code).toBe('not-found');
    expect((await call('delete', '/api/store/settings', undefined, { ip: freshIp() })).status).toBe(404);
    // R9: đường admin tự tạo dòng mặc định
    const g = await iGet('/settings/store', admin.cookie);
    expect(g.status).toBe(200);
    expect(g.body.info.hotline).toBe('1900 6868 29');
    expect(await prisma.storeSetting.count()).toBe(1);
    const ip = '198.51.100.77';
    resetCatalogRateLimit();
    for (let i = 0; i < 120; i++) expect((await pub({ ip })).status).toBe(200);
    const over = await pub({ ip });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate-limited');
    expect(over.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('T-SET-31 AC-SET-14 (BE): đổi hotline / địa chỉ thì công khai trả giá trị mới', () => {
  it('sau PUT, GET /store/settings (+60 giây) trả giá trị mới', async () => {
    const g = await getSettings();
    const r = await put(bodyFrom(g, { info: { hotline: '0909 123 456', address: 'Số 1 Đường Mới, Quận 1, TP. Hồ Chí Minh' } }));
    expect(r.status).toBe(200);
    advance(60_000);
    const pub = await get('/api/store/settings', { ip: freshIp() });
    expect(pub.body.info).toMatchObject({ hotline: '0909 123 456', hotlineHref: 'tel:0909123456', address: 'Số 1 Đường Mới, Quận 1, TP. Hồ Chí Minh' });
  });
});
