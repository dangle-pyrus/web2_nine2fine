import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advance, freshIp, get, loginMember, makeVoucher, post, prisma, resetCheckout, resetState, setStock, useClock, vid,
} from './helpers';

let top: string; // off-duty-top Trắng/S 390.000 (tồn 5)
let shirt: string; // weekend-shirt Trắng/S 550.000
let blazer: string; // the-everyday-blazer Đen/S 1.290.000
let dress: string; // after-hours-dress Đỏ/S 890.000 (compareAt 1.090.000)

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  shirt = await vid('weekend-shirt', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
  dress = await vid('after-hours-dress', 'Đỏ', 'S');
});

const quote = (body: unknown, ip = freshIp(), cookie?: string) => post('/api/checkout/quote', body, { ip, cookie });

describe('T-LOC-01 địa giới (AC-CHK-06)', () => {
  it('34 tỉnh, >= 3000 phường, phường thuộc đúng 1 tỉnh, cache 86400, công khai', async () => {
    const res = await get('/api/locations/provinces', { cookie: 'n2f_sid=hong' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.body).toHaveLength(34);
    let wards = 0;
    for (const p of res.body as Array<{ code: string; name: string }>) {
      const w = await get(`/api/locations/provinces/${p.code}/wards`);
      expect(w.status).toBe(200);
      expect(w.headers['cache-control']).toBe('public, max-age=86400');
      wards += w.body.length;
    }
    expect(wards).toBeGreaterThanOrEqual(3000);
    expect((await get('/api/locations/provinces/zz/wards')).status).toBe(404);
    expect((await post('/api/locations/provinces', {})).status).toBe(404);
  });
});

describe('T-QUO báo giá (AC-CHK-10, AC-CHK-24)', () => {
  it('T-QUO-01: bỏ qua price giả; khách không phiên và phiên sai đều 200; no-store', async () => {
    const body = { items: [{ variantId: top, quantity: 1, unitPrice: 1 }], total: 1, pricing: { total: 1 } };
    const a = await quote(body);
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(a.body.pricing).toEqual({ subtotal: 390000, discount: 0, shippingFee: 30000, shippingDiscount: 0, total: 420000 });
    expect(a.body.policy).toMatchObject({ freeShippingThreshold: 1000000, shippingFee: 30000, bankTransferEnabled: false });
    expect(a.body.lines[0]).toMatchObject({ unitPrice: 390000, effectiveQuantity: 1, availability: 'low-stock' });
    const b = await quote(body, freshIp(), 'n2f_sid=phien-sai');
    expect(b.status).toBe(200);
    expect(b.headers['set-cookie']).toBeUndefined();
  });

  it('T-QUO-02: làm tươi tồn / ngừng bán / giá', async () => {
    await setStock(top, 2);
    const a = await quote({ items: [{ variantId: top, quantity: 4 }] });
    expect(a.body.lines[0]).toMatchObject({ effectiveQuantity: 2, maxQuantity: 2, limitedBy: 'stock', availability: 'low-stock' });
    expect(a.body.pricing.subtotal).toBe(780000);
    await setStock(top, 0);
    const b = await quote({ items: [{ variantId: top, quantity: 1 }] });
    expect(b.body.lines[0]).toMatchObject({ availability: 'out-of-stock', effectiveQuantity: 0, maxQuantity: 0 });
    expect(b.body.pricing).toMatchObject({ subtotal: 0, total: 0 });
    await prisma.product.update({ where: { slug: 'weekend-shirt' }, data: { status: 'DRAFT' } });
    const c = await quote({ items: [{ variantId: shirt, quantity: 1 }, { variantId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] });
    expect(c.body.lines.map((l: { availability: string }) => l.availability)).toEqual(['discontinued', 'discontinued']);
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: 400000 } });
    await setStock(top, 5);
    const d = await quote({ items: [{ variantId: top, quantity: 1 }] });
    expect(d.body.lines[0].unitPrice).toBe(400000);
    const e = await quote({ items: [{ variantId: blazer, quantity: 9 }] });
    expect(e.body.lines[0]).toMatchObject({ effectiveQuantity: 5, limitedBy: 'per-variant-limit' });
  });

  it('T-QUO-03: hạn mức cấu trúc', async () => {
    const dressL = await vid('after-hours-dress', 'Đỏ', 'M');
    const items25 = [top, shirt, blazer, dress, dressL].map((variantId) => ({ variantId, quantity: 5 }));
    const a = await quote({ items: items25 });
    expect(a.status).toBe(422);
    expect(a.body.error).toMatchObject({ code: 'validation', field: 'items' });
    const a20 = await quote({ items: items25.slice(0, 4) });
    expect(a20.status).toBe(200);
    const many = Array.from({ length: 31 }, (_, i) => ({ variantId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, quantity: 1 }));
    expect((await quote({ items: many })).body.error).toMatchObject({ code: 'validation', field: 'items' });
    expect((await quote({ items: [{ variantId: top, quantity: 1 }, { variantId: top, quantity: 2 }] })).body.error.field).toBe('items');
    expect((await quote({ items: [{ variantId: top, quantity: 0 }] })).body.error.field).toBe('items');
    expect((await quote({ items: [{ variantId: top, quantity: 1 }], voucherCodes: ['A', 'B', 'C'] })).body.error.field).toBe('voucherCodes');
  });

  it('T-QUO-04: phương thức thanh toán', async () => {
    const big = await quote({ items: [{ variantId: blazer, quantity: 4 }, { variantId: dress, quantity: 1 }] });
    // 4 x 1.290.000 + 890.000 = 6.050.000 > 5.000.000
    expect(big.body.paymentMethods).toEqual([
      { method: 'cod', available: false, reason: 'over-limit' },
      { method: 'bank-transfer', available: false, reason: 'not-enabled' },
    ]);
    const exact = await quote({ items: [{ variantId: blazer, quantity: 3 }, { variantId: dress, quantity: 1 }], voucherCodes: [] });
    expect(exact.body.pricing.total).toBeLessThanOrEqual(5_000_000);
    expect(exact.body.paymentMethods[0]).toEqual({ method: 'cod', available: true });

    // 3 đơn COD to_ship cùng SĐT, và 2 đơn bị từ chối nhận
    const phone = '0912345678';
    const mk = async (code: string, extra: Record<string, unknown> = {}) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO orders (code,status,payment_method,email,recipient_name,recipient_phone,province_code,ward_code,province_name,ward_name,street,subtotal,discount,shipping_fee,shipping_discount,total,estimated_from,estimated_to,terms_accepted_at,items_fingerprint,delivery_refused_at)
         SELECT '${code}','${(extra.status as string) ?? 'to_ship'}','cod','x@x.vn','Nguyen A','${phone}',p.province_code,w.ward_code,p.name,w.name,'12 Pho Hue',100000,0,30000,0,130000,'2026-11-10','2026-11-12',now(),repeat('a',64),${extra.refused ? 'now()' : 'NULL'}
         FROM wards w JOIN provinces p ON p.province_code=w.province_code LIMIT 1`,
      );
    for (let i = 1; i <= 3; i++) await mk(`N2F261104000${i}`);
    const open = await quote({ items: [{ variantId: top, quantity: 1 }], contact: { phone } });
    expect(open.body.paymentMethods[0]).toEqual({ method: 'cod', available: false, reason: 'too-many-open-orders' });
    await prisma.$executeRawUnsafe(`UPDATE orders SET status='completed'`);
    expect((await quote({ items: [{ variantId: top, quantity: 1 }], contact: { phone } })).body.paymentMethods[0].available).toBe(true);
    await prisma.$executeRawUnsafe(`UPDATE orders SET delivery_refused_at = now() WHERE code IN ('N2F2611040001','N2F2611040002')`);
    expect((await quote({ items: [{ variantId: top, quantity: 1 }], contact: { phone } })).body.paymentMethods[0]).toEqual({
      method: 'cod', available: false, reason: 'too-many-refusals',
    });
  });

  it('T-QUO-05: chưa có địa chỉ -> addressRequired; ngày giao theo giờ giả; địa chỉ sai -> invalid-address', async () => {
    useClock('2026-11-09T03:00:00Z');
    const a = await quote({ items: [{ variantId: top, quantity: 1 }] });
    expect(a.body.shipping).toEqual({ fee: 30000, freeReason: null, addressRequired: true });
    expect(a.body.estimatedDelivery).toEqual({ from: '2026-11-11', to: '2026-11-13' });
    const w = await prisma.ward.findFirstOrThrow({ where: { provinceCode: '01' } });
    const b = await quote({ items: [{ variantId: top, quantity: 1 }], address: { provinceCode: '01', wardCode: w.code } });
    expect(b.body.shipping.addressRequired).toBe(false);
    const c = await quote({ items: [{ variantId: top, quantity: 1 }], address: { provinceCode: '48', wardCode: w.code } });
    expect(c.status).toBe(422);
    expect(c.body.error.code).toBe('invalid-address');
    advance(7 * 3600 * 1000); // 17:00 VN, sau giờ cắt
    const d = await quote({ items: [{ variantId: top, quantity: 1 }] });
    expect(d.body.estimatedDelivery).toEqual({ from: '2026-11-12', to: '2026-11-14' });
  });
});

describe('T-VOU voucher (AC-VOU-01..06, AC-VOU-11)', () => {
  it('T-VOU-01: WELCOME15 + FREESHIP; thay bằng T50K', async () => {
    const a = await quote({ items: [{ variantId: top, quantity: 1 }], voucherCodes: ['n2fwelcome15', ' N2FFREESHIP '] });
    expect(a.body.pricing).toEqual({ subtotal: 390000, discount: 58000, shippingFee: 30000, shippingDiscount: 30000, total: 332000 });
    expect(a.body.shipping.freeReason).toBe('voucher');
    expect(a.body.vouchers).toEqual([
      { applied: true, code: 'N2FWELCOME15', kind: 'discount', label: 'Giảm 15% đơn đầu tiên', amount: 58000 },
      { applied: true, code: 'N2FFREESHIP', kind: 'free-shipping', label: 'Miễn phí giao hàng', amount: 0 },
    ]);
    expect(a.body.lineDiscounts).toEqual([{ variantId: top, amount: 58000 }]);
    await makeVoucher({ code: 'T50K', value: 50000 });
    const b = await quote({ items: [{ variantId: top, quantity: 1 }], voucherCodes: ['N2FWELCOME15', 'T50K'] });
    expect(b.body.pricing).toMatchObject({ discount: 50000, shippingDiscount: 0, total: 370000 }); // T50K thay WELCOME15
    expect(b.body.vouchers.map((v: { code: string }) => v.code)).toEqual(['T50K']);
    const c = await quote({ items: [{ variantId: top, quantity: 1 }], voucherCodes: ['T50K', 'N2FFREESHIP'] });
    expect(c.body.pricing).toMatchObject({ discount: 50000, shippingDiscount: 30000, total: 340000 });
    expect(c.body.vouchers.map((v: { code: string }) => v.code)).toEqual(['T50K', 'N2FFREESHIP']);
  });

  it('T-VOU-02: lý do từ chối đúng thứ tự', async () => {
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    await makeVoucher({ code: 'TFUT', startsAt: future });
    await makeVoucher({ code: 'TEXP', endsAt: past });
    await makeVoucher({ code: 'TOFF', isActive: false });
    await makeVoucher({ code: 'TOUT', totalLimit: 1, usedCount: 1 });
    await makeVoucher({ code: 'TMEM', membersOnly: true });
    await makeVoucher({ code: 'TBOTH', endsAt: past, totalLimit: 1, usedCount: 1 });
    await makeVoucher({ code: 'TMIN', minSubtotal: 500000 });
    const items = [{ variantId: top, quantity: 1 }];
    const q = await quote({ items, voucherCodes: ['KHONGCO', 'TFUT'] });
    const r = (code: string) => q.body.rejectedVouchers.find((x: { code: string }) => x.code === code);
    expect(r('KHONGCO')).toMatchObject({ applied: false, reason: 'not-found' });
    expect(r('TFUT')).toMatchObject({ reason: 'not-started', startsAt: future.toISOString() });
    const reasons = async (code: string) => (await quote({ items, voucherCodes: [code] })).body.rejectedVouchers[0].reason;
    expect(await reasons('TEXP')).toBe('expired');
    expect(await reasons('TOFF')).toBe('expired');
    expect(await reasons('TOUT')).toBe('exhausted');
    expect(await reasons('TMEM')).toBe('login-required');
    expect(await reasons('TBOTH')).toBe('expired');
    const min = (await quote({ items, voucherCodes: ['TMIN'] })).body.rejectedVouchers[0];
    expect(min).toMatchObject({ reason: 'min-spend', missingAmount: 110000, minSubtotal: 500000 });
    expect((await quote({ items, voucherCodes: ['!!'] })).body.rejectedVouchers[0].reason).toBe('not-found');
    // mã bị từ chối không làm hỏng báo giá và không có trong `vouchers`
    expect((await quote({ items, voucherCodes: ['TEXP'] })).body.pricing.total).toBe(420000);
  });

  it('T-VOU-03/05: lượt riêng và đơn đầu tiên theo SĐT / email; đơn đã huỷ không tính', async () => {
    const mk = (code: string, status: string, phone: string, email: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO orders (code,status,payment_method,email,recipient_name,recipient_phone,province_code,ward_code,province_name,ward_name,street,subtotal,discount,shipping_fee,shipping_discount,total,estimated_from,estimated_to,terms_accepted_at,items_fingerprint,cancelled_at,cancelled_by)
         SELECT '${code}','${status}','cod','${email}','Nguyen A','${phone}',p.province_code,w.ward_code,p.name,w.name,'12 Pho Hue',100000,0,30000,0,130000,'2026-11-10','2026-11-12',now(),repeat('a',64),${status === 'cancelled' ? 'now()' : 'NULL'},${status === 'cancelled' ? `'customer'::order_actor` : 'NULL'}
         FROM wards w JOIN provinces p ON p.province_code=w.province_code LIMIT 1`,
      );
    const items = [{ variantId: top, quantity: 1 }];
    const reason = async (contact: object) => {
      const r = await quote({ items, voucherCodes: ['N2FWELCOME15'], contact });
      return r.body.rejectedVouchers[0]?.reason ?? 'applied';
    };
    await mk('N2F2611050001', 'to_ship', '0911111111', 'a@x.vn');
    expect(await reason({ phone: '0911111111', email: 'khac@x.vn' })).toBe('first-order-only'); // cùng SĐT khác email
    expect(await reason({ phone: '0922222222', email: 'a@x.vn' })).toBe('first-order-only'); // cùng email khác SĐT
    expect(await reason({ phone: '0922222222', email: 'b@x.vn' })).toBe('applied');
    await prisma.$executeRawUnsafe(`UPDATE orders SET status='cancelled', cancelled_at=now(), cancelled_by='customer'`);
    expect(await reason({ phone: '0911111111', email: 'a@x.vn' })).toBe('applied'); // đơn duy nhất đã huỷ
    // lượt đã dùng (chưa trả) của cùng khách -> per-user-limit (trước first-order-only)
    const o = await prisma.order.findFirstOrThrow();
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } });
    await prisma.voucherRedemption.create({ data: { voucherId: v.voucher_id, orderId: o.order_id, phone: '0911111111', email: 'a@x.vn' } });
    expect(await reason({ phone: '0911111111', email: 'zzz@x.vn' })).toBe('per-user-limit');
    await prisma.voucherRedemption.updateMany({ data: { releasedAt: new Date() } });
    expect(await reason({ phone: '0911111111', email: 'zzz@x.vn' })).toBe('applied');
  });

  it('T-VOU-04: FREESHIP min-spend, phí về 0 không có dòng giảm, shipping-already-free', async () => {
    const cheap = await vid('off-duty-top', 'Trắng', 'S');
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: 290000 } });
    const a = await quote({ items: [{ variantId: cheap, quantity: 1 }], voucherCodes: ['N2FFREESHIP'] });
    expect(a.body.rejectedVouchers[0]).toMatchObject({ reason: 'min-spend', missingAmount: 10000, minSubtotal: 300000 });
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: 390000 } });
    const b = await quote({ items: [{ variantId: top, quantity: 1 }], voucherCodes: ['N2FFREESHIP'] });
    expect(b.body.pricing).toMatchObject({ discount: 0, shippingFee: 30000, shippingDiscount: 30000, total: 390000 });
    expect(b.body.lineDiscounts).toEqual([]);
    const c = await quote({ items: [{ variantId: blazer, quantity: 1 }], voucherCodes: ['N2FFREESHIP'] });
    expect(c.body.rejectedVouchers[0].reason).toBe('shipping-already-free');
    expect(c.body.shipping.freeReason).toBe('threshold');
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FFREESHIP' } })).usedCount).toBe(0);
  });

  it('T-VOU-05: gỡ mã khi đổi giỏ và khi bỏ phiên', async () => {
    await makeVoucher({ code: 'TMEM', membersOnly: true });
    const m = await loginMember();
    const items = [{ variantId: top, quantity: 1 }];
    const withSession = await quote({ items, voucherCodes: ['TMEM'] }, freshIp(), m.cookie);
    expect(withSession.body.vouchers[0].code).toBe('TMEM');
    const noSession = await quote({ items, voucherCodes: ['TMEM'] });
    expect(noSession.body.rejectedVouchers[0].reason).toBe('login-required');
    const added = await quote({ items: [...items, { variantId: blazer, quantity: 1 }], voucherCodes: ['N2FFREESHIP'] });
    expect(added.body.rejectedVouchers[0].reason).toBe('shipping-already-free');
  });

  it('T-VOU-06: kiểm mã: 10 mã sai -> lần 11 bị 429 (kể cả mã đúng); 9 lần chưa khoá; hết khoá sau 15 phút', async () => {
    const items = [{ variantId: top, quantity: 1 }];
    const ip = freshIp();
    const check = (code: string, i = ip) => post('/api/vouchers/check', { code, items }, { ip: i });
    for (let i = 0; i < 9; i++) expect((await check(`SAI${i}XXXX`)).status).toBe(200);
    const ok = await check('N2FWELCOME15');
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ applied: true, code: 'N2FWELCOME15', kind: 'discount', amount: 58000 });
    expect(ok.body.quote.pricing.total).toBe(362000);
    expect((await check('SAI9XXXX')).status).toBe(200); // lần thứ 10
    const locked = await check('N2FWELCOME15');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('rate-limited');
    expect(locked.body.error.retryAfterSeconds).toBeLessThanOrEqual(900);
    expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect((await check('N2FWELCOME15', freshIp())).status).toBe(200); // IP khác không bị
    useClock(new Date(Date.now() + 16 * 60_000).toISOString());
    expect((await check('N2FWELCOME15')).status).toBe(200);
  });

  it('vouchers/check: mã không đạt vẫn 200 với result là VoucherRejection, giữ nguyên mã đã chuẩn hoá', async () => {
    const r = await post('/api/vouchers/check', { code: ' n2f freeship ', items: [{ variantId: blazer, quantity: 1 }] }, { ip: freshIp() });
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual({ applied: false, code: 'N2FFREESHIP', reason: 'shipping-already-free' });
    expect(r.body.quote.vouchers).toEqual([]);
  });

  it('T-VOU-11 (Should): mã theo danh mục + loại hàng giảm giá', async () => {
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: 'tops' } });
    await makeVoucher({ code: 'TTOPS', kind: 'percent', value: 10, categoryId: cat.category_id });
    await makeVoucher({ code: 'TNOSALE', kind: 'percent', value: 10, excludeSaleItems: true });
    const a = await quote({ items: [{ variantId: dress, quantity: 1 }], voucherCodes: ['TTOPS'] });
    expect(a.body.rejectedVouchers[0]).toMatchObject({ reason: 'category-mismatch', categoryName: cat.name });
    const b = await quote({ items: [{ variantId: top, quantity: 1 }, { variantId: dress, quantity: 1 }], voucherCodes: ['TTOPS'] });
    expect(b.body.pricing.discount).toBe(39000);
    const c = await quote({ items: [{ variantId: dress, quantity: 1 }], voucherCodes: ['TNOSALE'] });
    expect(c.body.rejectedVouchers[0].reason).toBe('excluded-sale-items');
    const d = await quote({ items: [{ variantId: top, quantity: 1 }, { variantId: dress, quantity: 1 }], voucherCodes: ['TNOSALE'] });
    expect(d.body.pricing.discount).toBe(39000);
  });
});

describe('T-RL-01 (phần quote) (AC-CHK-36)', () => {
  it('121 quote / 60 giây / IP -> 429 retryAfterSeconds; IP khác không bị', async () => {
    const ip = freshIp();
    const body = { items: [{ variantId: top, quantity: 1 }] };
    for (let i = 0; i < 120; i++) expect((await quote(body, ip)).status).toBe(200);
    const res = await quote(body, ip);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate-limited');
    expect(res.body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect((await quote(body, freshIp())).status).toBe(200);
  }, 60000);
});
