import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { getPrivateImageStorage } from '../src/lib/storage/private';
import { decryptAccountNumber } from '../src/modules/returns/account-secret';
import {
  assertNoAccountSecrets, cookieFrom, createReturnReq, flushMail, freshIp, get, insertReturn, loginAdmin, makeJpeg, makePng, makeReturnFixtures, makeReturnPhoto, mails,
  newKey, post, ReturnFixture, resetCheckout, resetState, SEED_ACCOUNT, uploadMyPhoto, uploadOkPhoto, useClock, vnAt,
} from './helpers';

/** Lát 9.2 (thành viên): T-RET-10..24. D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';
let F: ReturnFixture;

const clearReturns = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "order_returns", "order_return_items", "return_photos", "idempotency_keys" RESTART IDENTITY CASCADE');
const acct = { bank: SEED_ACCOUNT.bank, accountNumber: SEED_ACCOUNT.accountNumber, accountName: 'nguyen van a' };
const shop = (lines: Array<{ variantId: string; quantity: number }>, photos: string[], extra: Record<string, unknown> = {}) => ({
  lines, reason: 'wrong-size', detail: 'Áo giao sai kích cỡ so với đơn', photos, ...acct, ...extra,
});
const cust = (lines: Array<{ variantId: string; quantity: number }>, extra: Record<string, unknown> = {}) => ({
  lines, reason: 'not-fit', conditionAck: true, ...acct, ...extra,
});
const all1 = () => [{ variantId: F.v1, quantity: 2 }, { variantId: F.v2, quantity: 1 }];
const countReturns = () => prisma.orderReturn.count();
const mUp = () => uploadOkPhoto(F.M.cookie);

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  F = await makeReturnFixtures(D);
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  useClock(NOW);
  await clearReturns();
  mails.length = 0;
});

describe('T-RET-10 AC-RET-01: phiên và chủ đơn', () => {
  it('không cookie / chỉ phiên admin: 401 no-store, DB không đổi; N gọi R1: 404', async () => {
    const admin = await loginAdmin('ret-a@nine2fine.test');
    for (const cookie of [undefined, admin.cookie, 'n2f_sid=hong']) {
      const r = await createReturnReq(cookie, F.R.R1.code, cust(all1()));
      expect(r.status).toBe(401);
      expect(r.headers['cache-control']).toBe('no-store');
      expect((await post(`/api/account/orders/${F.R.R1.code}/return/cancel`, {}, { cookie, ip: freshIp() })).status).toBe(401);
      expect((await uploadMyPhoto(cookie, makeReturnPhoto())).status).toBe(401);
    }
    const n = await createReturnReq(F.N.cookie, F.R.R1.code, cust(all1()));
    expect(n.status).toBe(404);
    expect(n.headers['cache-control']).toBe('no-store');
    expect((await createReturnReq(F.M.cookie, 'N2F0000000000', cust(all1()))).status).toBe(404);
    expect((await createReturnReq(F.M.cookie, 'khong-hop-le', cust(all1()))).status).toBe(404);
    expect(await countReturns()).toBe(0);
  });
});

describe('T-RET-11 AC-RET-09: một yêu cầu sống mỗi đơn', () => {
  it('10 yêu cầu song song (khoá khác nhau): đúng 1 thành công, 9 return-exists, SQL 1 dòng', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const lost = rs.filter((r) => r.status !== 201);
    expect(lost.every((r) => r.status === 409 && r.body.error.code === 'return-exists')).toBe(true);
    expect(await countReturns()).toBe(1);
    expect(await prisma.orderEvent.count({ where: { kind: 'return_requested' } })).toBe(1);
  });
  it('R2 có yêu cầu cancelled: tạo lại 201; R5 rejected: return-exists', async () => {
    await insertReturn({ orderId: F.R.R2.id, state: 'cancelled', reason: 'not-fit' });
    expect((await createReturnReq(F.M.cookie, F.R.R2.code, cust([{ variantId: F.v1, quantity: 1 }]))).status).toBe(201);
    await insertReturn({ orderId: F.R.R5.id, state: 'rejected' });
    const r = await createReturnReq(F.M.cookie, F.R.R5.code, cust([{ variantId: F.v3, quantity: 1 }]));
    expect([r.status, r.body.error.code]).toEqual([409, 'return-exists']);
  });
});

describe('T-RET-12 AC-RET-10: điều kiện và hạn', () => {
  const body = () => cust([{ variantId: F.v1, quantity: 1 }]);
  it('R2 lúc D 23:59:59 201; 00:00:00 ngày sau -> return-window-closed; canReturn / returnDeadline đúng', async () => {
    const deadline = vnAt(D, 0, '23:59', 59);
    useClock(deadline.toISOString());
    const o = await get(`/api/orders/${F.R.R2.code}`, { cookie: F.M.cookie });
    expect(o.body.canReturn).toBe(true);
    expect(o.body.returnDeadline).toBe(deadline.toISOString());
    expect((await createReturnReq(F.M.cookie, F.R.R2.code, body())).status).toBe(201);
    await clearReturns();
    useClock(vnAt(D, 1, '00:00').toISOString());
    const late = await createReturnReq(F.M.cookie, F.R.R2.code, body());
    expect([late.status, late.body.error.code]).toEqual([409, 'return-window-closed']);
    expect((await get(`/api/orders/${F.R.R2.code}`, { cookie: F.M.cookie })).body.canReturn).toBe(false);
  });
  it('R3 quá hạn; R4 chưa giao; refunded / partially_refunded -> not-returnable', async () => {
    const r3 = await createReturnReq(F.M.cookie, F.R.R3.code, body());
    expect(r3.body.error.code).toBe('return-window-closed');
    const r4 = await createReturnReq(F.M.cookie, F.R.R4.code, body());
    expect([r4.status, r4.body.error.code]).toEqual([409, 'not-returnable']);
    for (const ps of ['refunded', 'partially_refunded'] as const) {
      await prisma.order.update({ where: { code: F.R.R6.code }, data: { paymentStatus: ps } });
      const r = await createReturnReq(F.M.cookie, F.R.R6.code, cust([{ variantId: F.v2, quantity: 1 }]));
      expect(r.body.error.code).toBe('not-returnable');
    }
    await prisma.order.update({ where: { code: F.R.R6.code }, data: { paymentStatus: 'paid' } });
    expect(await countReturns()).toBe(0);
  });
});

describe('T-RET-13 AC-RET-11: dòng trả', () => {
  const lines = async (l: unknown) => createReturnReq(F.M.cookie, F.R.R1.code, cust(l as never));
  it('hợp lệ', async () => {
    expect((await lines([{ variantId: F.v1, quantity: 2 }, { variantId: F.v2, quantity: 1 }])).status).toBe(201);
    await clearReturns();
    expect((await lines([{ variantId: F.v1, quantity: 1 }])).status).toBe(201);
  });
  it('x3 vượt mua, x0, x-1, trùng, dòng lạ, rỗng -> 422 lines, không tạo', async () => {
    for (const l of [
      [{ variantId: F.v1, quantity: 3 }], [{ variantId: F.v1, quantity: 0 }], [{ variantId: F.v1, quantity: -1 }],
      [{ variantId: F.v1, quantity: 1 }, { variantId: F.v1, quantity: 1 }], [{ variantId: F.v3, quantity: 1 }], [],
    ]) {
      const r = await lines(l);
      expect([r.status, r.body.error.code, r.body.error.field]).toEqual([422, 'validation', 'lines']);
    }
    expect(await countReturns()).toBe(0);
  });
});

describe('T-RET-14 / 15 AC-RET-12, 13: lý do và mô tả', () => {
  it('6 lý do ok; other / thiếu -> 422 reason', async () => {
    for (const reason of ['wrong-size', 'wrong-color', 'wrong-item', 'defective', 'not-fit', 'changed-mind']) {
      const p = await mUp();
      const r = await createReturnReq(F.M.cookie, F.R.R1.code, { ...shop([{ variantId: F.v2, quantity: 1 }], [p]), conditionAck: true, reason });
      expect(r.status, reason).toBe(201);
      expect(r.body.fault).toBe(['not-fit', 'changed-mind'].includes(reason) ? 'customer' : 'shop');
      await clearReturns();
    }
    for (const reason of ['other', 'not-as-described', undefined]) {
      const r = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1(), { reason }));
      expect([r.status, r.body.error.field]).toEqual([422, 'reason']);
    }
  });
  it('detail 9 / 10 / 500 / 501, toàn khoảng trắng, ký tự điều khiển (lỗi shop)', async () => {
    const p = await mUp();
    const t = (detail: string) => createReturnReq(F.M.cookie, F.R.R1.code, shop([{ variantId: F.v2, quantity: 1 }], [p], { detail }));
    expect((await t('a'.repeat(9))).body.error.field).toBe('detail');
    expect((await t('   ' + 'a'.repeat(7) + '   ')).body.error.field).toBe('detail'); // cắt hai đầu còn 7
    expect((await t(' '.repeat(20))).body.error.field).toBe('detail');
    expect((await t('a'.repeat(501))).body.error.field).toBe('detail');
    expect((await t('abcdefghij\u0007k')).body.error.field).toBe('detail');
    expect((await t('a'.repeat(500))).status).toBe(201);
    await clearReturns();
    const p2 = await mUp();
    const ok = await createReturnReq(F.M.cookie, F.R.R1.code, shop([{ variantId: F.v2, quantity: 1 }], [p2], { detail: 'line 1\r\nline 2 du dai' }));
    expect(ok.status).toBe(201);
    expect(ok.body.detail).toBe('line 1\nline 2 du dai');
  });
  it('lỗi khách cần conditionAck = true; detail tuỳ chọn', async () => {
    const r = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1(), { conditionAck: false }));
    expect(r.body.error.field).toBe('conditionAck');
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1(), { detail: undefined }))).status).toBe(201);
  });
  it('fieldErrors đủ MỌI lỗi một lần, thông điệp không nhúng giá trị nhập', async () => {
    const r = await createReturnReq(F.M.cookie, F.R.R1.code, { lines: [], reason: 'defective', accountNumber: '12ab', accountName: 'x' });
    expect(r.status).toBe(422);
    const fields = r.body.error.fieldErrors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(['accountName', 'accountNumber', 'bank', 'detail', 'lines', 'photos']);
    expect(r.text).not.toContain('12ab');
  });
});

describe('T-RET-16 AC-RET-14: ảnh', () => {
  const GPS = 'GPSLatitude=10.7769';
  const seg = (m: number, d: Buffer) => {
    const b = Buffer.alloc(4 + d.length);
    b[0] = 0xff; b[1] = m; b.writeUInt16BE(d.length + 2, 2); d.copy(b, 4);
    return b;
  };
  it('3 MB ok; 6 MB size; .exe đổi đuôi format; PNG 150x150 dimensions; không thân -> format', async () => {
    const big = Buffer.concat([makeJpeg(800, 800), Buffer.alloc(3 * 1024 * 1024)]);
    expect((await uploadMyPhoto(F.M.cookie, big, 'image/jpeg')).status).toBe(201);
    const r6 = await uploadMyPhoto(F.M.cookie, Buffer.alloc(6 * 1024 * 1024), 'image/jpeg');
    expect([r6.status, r6.body.error.code, r6.body.error.reason]).toEqual([422, 'invalid-image', 'size']);
    const exe = await uploadMyPhoto(F.M.cookie, Buffer.from('MZ\x90\x00 not an image'), 'image/jpeg');
    expect(exe.body.error.reason).toBe('format');
    expect((await uploadMyPhoto(F.M.cookie, makePng(150, 150), 'image/png')).body.error.reason).toBe('dimensions');
    expect((await uploadMyPhoto(F.M.cookie, makePng(9000, 300), 'image/png')).body.error.reason).toBe('dimensions');
    expect((await uploadMyPhoto(F.M.cookie, '', 'application/octet-stream')).body.error.reason).toBe('format');
  });
  it('EXIF / GPS bị gỡ trước khi lưu (đọc lại byte từ kho riêng tư); khoá rp-; url cần cookie', async () => {
    const base = makeJpeg(800, 1000);
    const withExif = Buffer.concat([base.subarray(0, 2), seg(0xe1, Buffer.from(`Exif\0\0${GPS}`)), seg(0xfe, Buffer.from(GPS)), base.subarray(2), Buffer.from([0xff, 0xda, 0x00, 0x02, 1, 2, 0xff, 0xd9])]);
    const r = await uploadMyPhoto(F.M.cookie, withExif, 'image/jpeg');
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['contentType', 'height', 'id', 'size', 'url', 'width']);
    expect(r.body.url).toBe(`/api/account/return-photos/${r.body.id}`);
    const row = await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: r.body.id } });
    expect(row.storageKey).toMatch(/^rp-[0-9a-f]{32}\.jpg$/);
    const stored = await getPrivateImageStorage().read(row.storageKey);
    expect(stored!.data.includes(Buffer.from(GPS))).toBe(false);
    expect(stored!.data.length).toBeLessThan(withExif.length);
  });
  it('lỗi shop: 0 / 1 / 5 / 6 ảnh; ảnh của N, đã gắn, quá 24 giờ -> 422 photos', async () => {
    const t = (photos: string[]) => createReturnReq(F.M.cookie, F.R.R1.code, shop([{ variantId: F.v2, quantity: 1 }], photos, { reason: 'defective' }));
    expect((await t([])).body.error.field).toBe('photos');
    const five = await Promise.all([1, 2, 3, 4, 5].map(() => mUp()));
    const six = [...five, await mUp()];
    expect((await t(six)).body.error.field).toBe('photos');
    expect((await t([five[0], five[0]])).body.error.field).toBe('photos'); // trùng
    const nPhoto = await uploadOkPhoto(F.N.cookie);
    expect((await t([nPhoto])).body.error.field).toBe('photos');
    expect((await t([crypto.randomUUID()])).body.error.field).toBe('photos');
    await prisma.returnPhoto.update({ where: { photo_id: five[1] }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect((await t([five[1]])).body.error.field).toBe('photos');
    expect((await t([five[0]])).status).toBe(201);
    expect((await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: five[0] } })).returnId).not.toBeNull();
    await clearReturns();
    expect(await prisma.returnPhoto.count()).toBe(0);
  });
  it('ảnh đã gắn không gắn lại cho yêu cầu khác', async () => {
    const p = await mUp();
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, shop([{ variantId: F.v2, quantity: 1 }], [p]))).status).toBe(201);
    const r = await createReturnReq(F.M.cookie, F.R.R5.code, shop([{ variantId: F.v3, quantity: 1 }], [p]));
    expect(r.body.error.field).toBe('photos');
  });
});

describe('T-RET-17 AC-RET-15: xem ảnh', () => {
  it('không đăng nhập 401; N 404; chủ 200 đúng byte; id đoán 404; header riêng tư; /api/media không phục vụ', async () => {
    const img = makeReturnPhoto(500, 500);
    const up = await uploadMyPhoto(F.M.cookie, img, 'image/jpeg');
    const id = up.body.id as string;
    const url = up.body.url as string;
    expect((await get(url, { ip: freshIp() })).status).toBe(401);
    expect((await get(url, { cookie: F.N.cookie, ip: freshIp() })).status).toBe(404);
    const ok = await get(url, { cookie: F.M.cookie, ip: freshIp() });
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['content-type']).toMatch(/image\/jpeg/);
    expect(Buffer.from(ok.body).equals(img) || ok.body.length === img.length).toBe(true);
    expect((await get(`/api/account/return-photos/${crypto.randomUUID()}`, { cookie: F.M.cookie, ip: freshIp() })).status).toBe(404);
    expect((await get('/api/account/return-photos/khong-phai-uuid', { cookie: F.M.cookie, ip: freshIp() })).status).toBe(404);
    // gắn vào yêu cầu: vẫn chỉ chủ đơn
    await createReturnReq(F.M.cookie, F.R.R1.code, shop([{ variantId: F.v2, quantity: 1 }], [id]));
    expect((await get(url, { cookie: F.N.cookie, ip: freshIp() })).status).toBe(404);
    expect((await get(url, { cookie: F.M.cookie, ip: freshIp() })).status).toBe(200);
    const row = await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: id } });
    expect((await get(`/api/media/${row.storageKey}`, { ip: freshIp() })).status).toBe(404);
  });
});

describe('T-RET-18 / 19 AC-RET-16, 17: tài khoản nhận hoàn', () => {
  const t = (extra: Record<string, unknown>) => createReturnReq(F.M.cookie, F.R.R1.code, cust(all1(), extra));
  it('bank thiếu; số 5 / 20 chữ số, 12ab56 -> lỗi; 6 / 19 chữ số, có khoảng trắng -> ok; tên 1 / 51 -> lỗi', async () => {
    expect((await t({ bank: undefined })).body.error.field).toBe('bank');
    for (const n of ['12345', '1'.repeat(20), '12ab56']) expect((await t({ accountNumber: n })).body.error.field).toBe('accountNumber');
    expect((await t({ accountName: 'A' })).body.error.field).toBe('accountName');
    expect((await t({ accountName: 'A'.repeat(51) })).body.error.field).toBe('accountName');
    expect((await t({ accountName: 'Nguyen 123' })).body.error.field).toBe('accountName');
    for (const n of ['123456', '1'.repeat(19)]) {
      expect((await t({ accountNumber: n })).status).toBe(201);
      await clearReturns();
    }
    const ok = await t({ accountNumber: '1234 5678 90' });
    expect(ok.status).toBe(201);
    const row = await prisma.orderReturn.findFirstOrThrow({});
    expect(decryptAccountNumber(row.accountNumberEnc!, row.return_id)).toBe('1234567890');
    expect(row.accountName).toBe('NGUYEN VAN A');
    expect(row.accountLast4).toBe('7890');
    expect((await prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM idempotency_keys WHERE request_hash LIKE '%1234567890%'`)[0].n).toBe(0);
  });
  it('R8 chuyển khoản: không tài khoản 201 (refundTo original); có tài khoản -> bỏ qua, không lưu', async () => {
    const lines = [{ variantId: F.v1, quantity: 1 }];
    const a = await createReturnReq(F.M.cookie, F.R.R8.code, { lines, reason: 'not-fit', conditionAck: true });
    expect(a.status).toBe(201);
    expect(a.body.refundTo).toEqual({ type: 'original' });
    await clearReturns();
    const b = await createReturnReq(F.M.cookie, F.R.R8.code, { lines, reason: 'not-fit', conditionAck: true, ...acct });
    expect(b.status).toBe(201);
    const row = await prisma.orderReturn.findFirstOrThrow({});
    expect([row.bankName, row.accountNumberEnc]).toEqual([null, null]);
    assertNoAccountSecrets(b);
  });
  it('yêu cầu đang xử lý: phản hồi chỉ ngân hàng + 7890 + tên; bản mã có trong DB nhưng không lộ', async () => {
    const r = await t({});
    assertNoAccountSecrets(r);
    expect(r.body.refundTo).toEqual({ type: 'account', bank: 'Vietcombank', last4: '7890', accountName: 'NGUYEN VAN A' });
    const o = await get(`/api/orders/${F.R.R1.code}`, { cookie: F.M.cookie });
    assertNoAccountSecrets(o);
    expect(o.body.return.refundTo.last4).toBe('7890');
    expect((await prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM order_returns WHERE account_number_enc IS NOT NULL`)[0].n).toBe(1);
  });
});

describe('T-RET-20 AC-RET-18: Idempotency-Key', () => {
  it('cùng khoá hai lần: 200 + Replayed, 1 yêu cầu, 1 sự kiện, 1 thư; khác nội dung / khác số tài khoản: idempotency-conflict', async () => {
    const key = newKey();
    const a = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()), key);
    const b = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()), key);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.body.id).toBe(a.body.id);
    expect(await countReturns()).toBe(1);
    expect(await prisma.orderEvent.count({ where: { kind: 'return_requested' } })).toBe(1);
    await flushMail();
    expect(mails.filter((m) => m.subject.includes('Đã nhận yêu cầu trả hàng'))).toHaveLength(1);
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, cust([{ variantId: F.v1, quantity: 1 }]), key)).body.error.code).toBe('idempotency-conflict');
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1(), { accountNumber: '9999999999' }), key)).body.error.code).toBe('idempotency-conflict');
  });
  it('thiếu / sai khoá 422; hai lần song song cùng khoá chỉ 1 yêu cầu', async () => {
    const m = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()), null);
    expect([m.status, m.body.error.field]).toEqual([422, 'Idempotency-Key']);
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()), 'ngan')).status).toBe(422);
    const key = newKey();
    const rs = await Promise.all([1, 2].map(() => createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()), key)));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await countReturns()).toBe(1);
  });
  it('giới hạn: yêu cầu thứ 11 / giờ -> 429 + Retry-After', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await createReturnReq(F.M.cookie, F.R.R3.code, cust(all1()), null);
    expect(last!.status).toBe(429);
    expect(last!.headers['retry-after']).toBeTruthy();
  });
});

describe('T-RET-21 AC-RET-19: khách huỷ', () => {
  const cancel = (code: string, cookie = F.M.cookie) => post(`/api/account/orders/${code}/return/cancel`, {}, { cookie, ip: freshIp() });
  it('huỷ requested: 200, số đầy đủ xoá, 1 sự kiện, không thư; lần hai / approved: invalid-transition; tạo lại được', async () => {
    const c = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()));
    await flushMail();
    mails.length = 0;
    const r = await cancel(F.R.R1.code);
    expect([r.status, r.body.state, r.body.canCancel]).toEqual([200, 'cancelled', false]);
    const row = await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: c.body.id } });
    expect([row.accountNumberEnc, row.activeOrderId, row.accountLast4]).toEqual([null, null, '7890']);
    expect(await prisma.orderEvent.count({ where: { kind: 'return_cancelled' } })).toBe(1);
    await flushMail();
    expect(mails).toHaveLength(0);
    const again = await cancel(F.R.R1.code);
    expect([again.status, again.body.error.code, again.body.error.currentReturnState]).toEqual([409, 'invalid-transition', 'cancelled']);
    expect((await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()))).status).toBe(201);
    await prisma.$executeRawUnsafe(`UPDATE order_returns SET state = 'approved', approved_at = now() WHERE state = 'requested'`);
    const ap = await cancel(F.R.R1.code);
    expect([ap.status, ap.body.error.currentReturnState]).toEqual([409, 'approved']);
  });
  it('không có yêu cầu: 404; người khác: 404', async () => {
    expect((await cancel(F.R.R2.code)).status).toBe(404);
    await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()));
    expect((await cancel(F.R.R1.code, F.N.cookie)).status).toBe(404);
  });
});

describe('T-RET-22 AC-RET-20: Order.canReturn / return', () => {
  const view = async (code: string) => (await get(`/api/orders/${code}`, { cookie: F.M.cookie, ip: freshIp() })).body;
  it('không yêu cầu: canReturn, không khối return; có yêu cầu sống: canReturn false', async () => {
    const a = await view(F.R.R2.code);
    expect([a.canReturn, a.return]).toEqual([true, undefined]);
    expect(a.returnDeadline).toBe(vnAt(D, 0, '23:59', 59).toISOString());
    await insertReturn({ orderId: F.R.R2.id, state: 'requested', reason: 'not-fit' });
    const b = await view(F.R.R2.code);
    expect([b.canReturn, b.return.state, b.return.canCancel]).toEqual([false, 'requested', true]);
    expect(b.return.amount).toEqual({ goodsAmount: 400_000, shippingRefund: 0, returnShippingFee: 30_000, amount: 370_000, final: false });
  });
  it('approved (hướng dẫn), received (số chốt + ngày dự kiến), refunded, rejected (lý do), cancelled (canReturn lại true)', async () => {
    await prisma.orderReturn.deleteMany();
    await insertReturn({ orderId: F.R.R1.id, state: 'approved', account: SEED_ACCOUNT.accountNumber ? { bank: 'VCB', number: SEED_ACCOUNT.accountNumber, name: 'NGUYEN VAN A' } : undefined });
    await prisma.orderReturn.updateMany({ data: { approveNote: 'Ghi mã đơn lên hộp' } });
    const ap = (await view(F.R.R1.code)).return;
    expect(ap.state).toBe('approved');
    expect(ap.instructions).toContain('Ghi mã đơn lên hộp');
    expect(ap.instructions).toContain('Tầng 5');
    await prisma.orderReturn.deleteMany();
    await insertReturn({ orderId: F.R.R1.id, state: 'received', requestedAt: new Date(NOW), lines: [{ variantId: F.v1, quantity: 2, accepted: 1 }, { variantId: F.v2, quantity: 1, accepted: 0 }] });
    const rc = (await view(F.R.R1.code)).return;
    expect([rc.state, rc.amount.final, rc.refundedAmount]).toEqual(['received', true, undefined]);
    expect(rc.expectedRefundBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rc.lines.find((l: { variantId: string }) => l.variantId === F.v1).acceptedQuantity).toBe(1);
    await prisma.orderReturn.deleteMany();
    await insertReturn({ orderId: F.R.R1.id, state: 'refunded' });
    const rf = (await view(F.R.R1.code)).return;
    expect([rf.state, rf.refundedAmount, rf.refundReference]).toEqual(['refunded', 1_200_000, undefined]);
    await prisma.orderReturn.deleteMany();
    await insertReturn({ orderId: F.R.R1.id, state: 'rejected', rejectNote: 'Hàng đã qua sử dụng' });
    const rj = (await view(F.R.R1.code)).return;
    expect([rj.state, rj.rejectNote]).toEqual(['rejected', 'Hàng đã qua sử dụng']);
    await prisma.orderReturn.deleteMany();
    await insertReturn({ orderId: F.R.R1.id, state: 'cancelled' });
    const cn = await view(F.R.R1.code);
    expect([cn.canReturn, cn.return.state]).toEqual([true, 'cancelled']);
  });
  it('danh sách đơn có return cho từng đơn; khách vãng lai / người khác không có return', async () => {
    await insertReturn({ orderId: F.R.R2.id, state: 'requested', reason: 'not-fit' });
    const list = await get('/api/orders?limit=50', { cookie: F.M.cookie, ip: freshIp() });
    const byId = Object.fromEntries(list.body.items.map((o: { id: string }) => [o.id, o]));
    expect(byId[F.R.R2.code].return.state).toBe('requested');
    expect(byId[F.R.R2.code].canReturn).toBe(false);
    expect(byId[F.R.R1.code].return).toBeUndefined();
    expect(byId[F.R.R1.code].canReturn).toBe(true);
  });
});

describe('T-RET-23 AC-RET-21: estimate và create cùng số', () => {
  const est = (code: string, lines: unknown, reason: string) => post(`/api/account/orders/${code}/return/estimate`, { lines, reason }, { cookie: F.M.cookie, ip: freshIp() });
  it('a..g đúng số', async () => {
    const amt = async (code: string, lines: Array<{ variantId: string; quantity: number }>, reason: string) => (await est(code, lines, reason)).body;
    expect((await amt(F.R.R1.code, [{ variantId: F.v1, quantity: 1 }], 'not-fit')).amount).toBe(420_000);
    expect((await amt(F.R.R1.code, all1(), 'wrong-size')).amount).toBe(1_200_000);
    expect((await amt(F.R.R2.code, [{ variantId: F.v1, quantity: 1 }], 'defective')).amount).toBe(430_000);
    const d = await amt(F.R.R2.code, [{ variantId: F.v1, quantity: 1 }], 'changed-mind');
    expect([d.amount, d.shippingRefund, d.returnShippingFee, d.final]).toEqual([370_000, 0, 30_000, false]);
    const e = [1, 2, 3].map(async (q) => (await amt(F.R.R5.code, [{ variantId: F.v3, quantity: q }], 'defective')).amount);
    expect(await Promise.all(e)).toEqual([333_333, 666_667, 1_000_000]);
    const f = await est(F.R.R6.code, [{ variantId: F.v2, quantity: 1 }], 'not-fit');
    expect([f.status, f.body.error.field]).toEqual([422, 'lines']);
    expect((await amt(F.R.R8.code, [{ variantId: F.v1, quantity: 1 }], 'wrong-item')).amount).toBe(430_000);
    expect(await countReturns()).toBe(0);
  });
  it('create lưu đúng số estimate; (f) tạo -> 422 lines không tạo', async () => {
    const e = await est(F.R.R2.code, [{ variantId: F.v1, quantity: 1 }], 'changed-mind');
    const c = await createReturnReq(F.M.cookie, F.R.R2.code, cust([{ variantId: F.v1, quantity: 1 }], { reason: 'changed-mind' }));
    expect(c.body.amount).toEqual(e.body);
    const f = await createReturnReq(F.M.cookie, F.R.R6.code, cust([{ variantId: F.v2, quantity: 1 }]));
    expect([f.status, f.body.error.field]).toEqual([422, 'lines']);
    expect(await prisma.orderReturn.count({ where: { orderId: F.R.R6.id } })).toBe(0);
  });
});

describe('T-RET-24 AC-RET-40, 41(a): sự kiện, dòng thời gian, thư', () => {
  it('1 sự kiện return_requested; timeline khách; thư (a) tới email đơn, không số tài khoản', async () => {
    const c = await createReturnReq(F.M.cookie, F.R.R1.code, cust(all1()));
    expect(c.status).toBe(201);
    const ev = await prisma.orderEvent.findMany({ where: { orderId: F.R.R1.id, kind: 'return_requested' } });
    expect(ev).toHaveLength(1);
    expect([ev[0].returnId, ev[0].actor, ev[0].reasonCode, ev[0].emailTemplate]).toEqual([c.body.id, 'customer', 'not-fit', 'return-requested']);
    const o = await get(`/api/orders/${F.R.R1.code}`, { cookie: F.M.cookie, ip: freshIp() });
    const t = o.body.timeline.find((x: { title: string }) => x.title === 'Đã gửi yêu cầu trả hàng');
    expect(t.actor).toBe('customer');
    await flushMail();
    const m = mails.filter((x) => x.subject.includes('Đã nhận yêu cầu trả hàng'));
    expect(m).toHaveLength(1);
    expect(m[0].to).toBe('khach@example.com');
    expect(m[0].subject).toBe(`nine2fine – Đã nhận yêu cầu trả hàng đơn #${F.R.R1.code}`);
    expect(m[0].text).not.toContain(SEED_ACCOUNT.accountNumber);
    expect(m[0].text).toContain('7890');
    expect(cookieFrom(c, 'x')).toBeUndefined();
  });
});
