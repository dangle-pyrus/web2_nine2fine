import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { generateSessionToken, hashSessionToken } from '../src/lib/crypto';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { getPrivateImageStorage } from '../src/lib/storage/private';
import {
  aGet, app, assertNoAccountSecrets, cookieFrom, flushMail, freshIp, get, insertReturn, insertRevenueOrder, lastCode, loginAdmin, loginStaff, makeJpeg,
  makePng, makeReturnFixtures, mails, newKey, ORIGIN, post, ReturnFixture, resetCheckout, resetState, SEED_ACCOUNT, useClock, vnAt,
} from './helpers';

/** Lát 10.2 (trả hàng vãng lai): T-RET-60..65. D = 2026-11-12 VN, 15:00 VN. Quyền CHỈ cookie n2f_oa. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';
const HOUR = 3_600_000;
let F: ReturnFixture;
let H: { id: string; code: string }; // đơn vãng lai thứ hai (grant "H")
let G: string; // cookie grant của R7 (đơn vãng lai)
let GH: string; // cookie grant của H

const clearReturns = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "order_returns", "order_return_items", "return_photos", "idempotency_keys" RESTART IDENTITY CASCADE');
const acct = { bank: SEED_ACCOUNT.bank, accountNumber: SEED_ACCOUNT.accountNumber, accountName: 'nguyen van a' };
const cust = (lines: Array<{ variantId: string; quantity: number }>, extra: Record<string, unknown> = {}) => ({ lines, reason: 'changed-mind', conditionAck: true, ...acct, ...extra });
const one = () => [{ variantId: F.v1, quantity: 1 }];

/** Tạo grant `n2f_oa` (như sau khi OTP đúng): trả "n2f_oa=<token>". */
async function grant(orderId: string, ttlMs = 30 * 60_000): Promise<string> {
  const token = generateSessionToken();
  const at = new Date(Date.now());
  await prisma.orderAccessGrant.create({ data: { tokenHash: hashSessionToken(token), orderId, createdAt: at, expiresAt: new Date(at.getTime() + ttlMs) } });
  return `n2f_oa=${token}`;
}
const gCreate = (cookie: string | undefined, code: string, body: unknown, key: string | null = newKey(), ip: string = freshIp()) =>
  post(`/api/orders/${code}/return`, body, { cookie, ip, headers: key === null ? {} : { 'Idempotency-Key': key } });
const gCancel = (cookie: string | undefined, code: string, ip: string = freshIp()) => post(`/api/orders/${code}/return/cancel`, {}, { cookie, ip });
const gEstimate = (cookie: string | undefined, code: string, body: unknown, ip: string = freshIp()) => post(`/api/orders/${code}/return/estimate`, body, { cookie, ip });
function gUpload(cookie: string | undefined, code: string, body: Buffer | string, contentType = 'image/jpeg', ip: string = freshIp()) {
  const r = request(app).post(`/api/orders/${code}/return/photos`);
  r.set('X-Forwarded-For', ip).set('Origin', ORIGIN).set('X-Requested-With', 'n2f').set('Content-Type', contentType);
  if (cookie) r.set('Cookie', cookie);
  return r.send(body);
}
const gPhoto = (cookie: string | undefined, code: string, id: string) => get(`/api/orders/${code}/return/photos/${id}`, { cookie, ip: freshIp() });
const upOk = async (cookie: string, code: string, w = 400, h = 400): Promise<string> => {
  const r = await gUpload(cookie, code, makeJpeg(w, h));
  if (r.status !== 201) throw new Error(`upload ${r.status}`);
  return r.body.id as string;
};
const count = () => prisma.orderReturn.count();

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  F = await makeReturnFixtures(D);
  H = await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '12:00'), userId: null, shippingFee: 30_000, lines: [{ variantId: F.v1, quantity: 1, unitPrice: 400_000 }] });
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  useClock(NOW);
  await clearReturns();
  mails.length = 0;
  await prisma.orderAccessGrant.deleteMany({});
  await prisma.order.updateMany({ data: { paymentStatus: 'paid' }, where: { status: 'completed' } });
  await prisma.$executeRawUnsafe(`DELETE FROM "auth_rate_limits" WHERE "key" LIKE 'order-lookup:%'`);
  G = await grant(F.R.R7.id, 60 * 24 * HOUR);
  GH = await grant(H.id, 60 * 24 * HOUR);
});

describe('T-RET-60 AC-RET-60: quyền theo grant n2f_oa', () => {
  it('không cookie / n2f_sid / grant hết hạn / grant rác: 401 no-store ở cả 5 operation, DB không đổi', async () => {
    const expired = await grant(F.R.R7.id, -1000);
    for (const cookie of [undefined, F.M.cookie, expired, 'n2f_oa=rac']) {
      const rs = [
        await gCreate(cookie, F.R.R7.code, cust(one())),
        await gCancel(cookie, F.R.R7.code),
        await gEstimate(cookie, F.R.R7.code, { lines: one(), reason: 'changed-mind' }),
        await gUpload(cookie, F.R.R7.code, makeJpeg(400, 400)),
        await gPhoto(cookie, F.R.R7.code, '00000000-0000-4000-8000-000000000000'),
      ];
      for (const r of rs) {
        expect([r.status, r.body.error?.code, r.headers['cache-control']]).toEqual([401, 'unauthenticated', 'no-store']);
      }
    }
    expect(await count()).toBe(0);
    expect(await prisma.returnPhoto.count()).toBe(0);
  });

  it('phiên thành viên của chủ đơn KHÔNG mở endpoint vãng lai (chỉ n2f_oa)', async () => {
    const r = await gCreate(F.M.cookie, F.R.R2.code, cust(one()));
    expect(r.status).toBe(401);
  });

  it('đơn khác của grant, đơn thành viên (kể cả grant của chính đơn đó), mã lạ / sai dạng: 404 cùng một phản hồi', async () => {
    const memberGrant = await grant(F.R.R2.id);
    const cases: Array<[string, string]> = [[G, H.code], [GH, F.R.R7.code], [memberGrant, F.R.R2.code], [G, 'N2F0000000000'], [G, 'khong-hop-le']];
    const bodies: unknown[] = [];
    for (const [cookie, code] of cases) {
      for (const r of [await gCreate(cookie, code, cust(one())), await gCancel(cookie, code), await gEstimate(cookie, code, { lines: one(), reason: 'changed-mind' }), await gUpload(cookie, code, makeJpeg(400, 400)), await gPhoto(cookie, code, '00000000-0000-4000-8000-000000000000')]) {
        expect([r.status, r.body.error.code]).toEqual([404, 'not-found']);
        bodies.push(r.body);
      }
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(await count()).toBe(0);
  });

  it('thiếu X-Requested-With / Origin: 403 (CSRF) trước mọi xử lý', async () => {
    const r = await post(`/api/orders/${F.R.R7.code}/return`, cust(one()), { cookie: G, xrw: null, headers: { 'Idempotency-Key': newKey() } });
    expect(r.status).toBe(403);
    expect((await post(`/api/orders/${F.R.R7.code}/return`, cust(one()), { cookie: G, origin: null, headers: { 'Idempotency-Key': newKey() } })).status).toBe(403);
    expect(await count()).toBe(0);
  });

  it('đơn của grant đúng: tạo 201, xem, huỷ 200', async () => {
    const c = await gCreate(G, F.R.R7.code, cust(one()));
    expect(c.status).toBe(201);
    expect(c.headers['cache-control']).toBe('no-store');
    const x = await gCancel(G, F.R.R7.code);
    expect([x.status, x.body.state, x.body.canCancel]).toEqual([200, 'cancelled', false]);
  });
});

describe('T-RET-61 AC-RET-61: áp BR-RET-09..21, 30', () => {
  it('ngày thứ 30 lúc 23:59:59 giờ VN: 201; 00:00:00 ngày kế: return-window-closed; canReturn / returnDeadline đúng', async () => {
    const deadline = vnAt(D, 27, '23:59', 59);
    useClock(deadline.toISOString());
    const o = await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() });
    expect([o.status, o.body.canReturn, o.body.returnDeadline]).toEqual([200, true, deadline.toISOString()]);
    expect((await gCreate(G, F.R.R7.code, cust(one()))).status).toBe(201);
    await clearReturns();
    useClock(vnAt(D, 28, '00:00').toISOString());
    const late = await gCreate(G, F.R.R7.code, cust(one()));
    expect([late.status, late.body.error.code]).toEqual([409, 'return-window-closed']);
    expect((await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() })).body.canReturn).toBe(false);
  });

  it('dòng lạ -> 422 lines; lý do other -> 422 reason; changed-mind không conditionAck -> 422; thiếu Idempotency-Key -> 422', async () => {
    const l = await gCreate(G, F.R.R7.code, cust([{ variantId: F.v3, quantity: 1 }]));
    expect([l.status, l.body.error.field]).toEqual([422, 'lines']);
    const q = await gCreate(G, F.R.R7.code, cust([{ variantId: F.v1, quantity: 2 }]));
    expect([q.status, q.body.error.field]).toEqual([422, 'lines']);
    const o = await gCreate(G, F.R.R7.code, cust(one(), { reason: 'other' }));
    expect([o.status, o.body.error.field]).toEqual([422, 'reason']);
    const c = await gCreate(G, F.R.R7.code, cust(one(), { conditionAck: false }));
    expect(c.status).toBe(422);
    expect((await gCreate(G, F.R.R7.code, cust(one()), null)).status).toBe(422);
    expect(await count()).toBe(0);
  });

  it('2 yêu cầu song song (2 khoá): đúng 1 x 201, còn lại 409 return-exists; sau đó canReturn false + khối return', async () => {
    const rs = await Promise.all([gCreate(G, F.R.R7.code, cust(one())), gCreate(G, F.R.R7.code, cust(one()))]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.code).toBe('return-exists');
    expect(await count()).toBe(1);
    expect(await prisma.orderEvent.count({ where: { kind: 'return_requested' } })).toBe(1);
    const o = (await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() })).body;
    expect([o.canReturn, o.return.state, o.return.canCancel, o.return.refundTo.last4]).toEqual([false, 'requested', true, '7890']);
  });

  it('số tiền dự kiến: toàn đơn + changed-mind = 400.000 - 30.000 = 370.000; estimate khớp và không ghi gì; yêu cầu lưu via=guest, không requested_by', async () => {
    const e = await gEstimate(G, F.R.R7.code, { lines: one(), reason: 'changed-mind' });
    expect([e.status, e.body.amount, e.body.final]).toEqual([200, 370_000, false]);
    expect(await count()).toBe(0);
    const c = await gCreate(G, F.R.R7.code, cust(one()));
    expect([c.status, c.body.amount.amount, c.body.fault]).toEqual([201, 370_000, 'customer']);
    const row = await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: c.body.id } });
    expect([row.requestedVia, row.requestedBy]).toEqual(['guest', null]);
    expect((await gEstimate(G, F.R.R7.code, { lines: [{ variantId: F.v3, quantity: 1 }], reason: 'changed-mind' })).body.error.field).toBe('lines');
  });

  it('Idempotency-Key: cùng khoá + cùng nội dung -> 200 Replayed, 1 yêu cầu; cùng khoá khác nội dung -> idempotency-conflict', async () => {
    const key = newKey();
    const a = await gCreate(G, F.R.R7.code, cust(one()), key);
    const b = await gCreate(G, F.R.R7.code, cust(one()), key);
    expect([a.status, b.status, b.headers['idempotency-replayed'], b.body.id]).toEqual([201, 200, 'true', a.body.id]);
    const c = await gCreate(G, F.R.R7.code, cust(one(), { detail: 'khac' }), key);
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('idempotency-conflict');
    expect(await count()).toBe(1);
  });

  it('huỷ khi requested: cancelled, xoá số tài khoản, canReturn true lại, tạo lại được; huỷ lần hai 409; đơn không có yêu cầu: 404', async () => {
    expect((await gCancel(G, F.R.R7.code)).status).toBe(404);
    const c = await gCreate(G, F.R.R7.code, cust(one()));
    const x = await gCancel(G, F.R.R7.code);
    expect([x.status, x.body.state]).toEqual([200, 'cancelled']);
    const raw = await prisma.$queryRawUnsafe<Array<{ e: string | null }>>(`SELECT account_number_enc AS e FROM order_returns WHERE return_id = '${c.body.id}'`);
    expect(raw[0].e).toBeNull();
    const again = await gCancel(G, F.R.R7.code);
    expect([again.status, again.body.error.code]).toEqual([409, 'invalid-transition']);
    const o = (await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() })).body;
    expect([o.canReturn, o.return.state]).toEqual([true, 'cancelled']);
    expect((await gCreate(G, F.R.R7.code, cust(one()))).status).toBe(201);
  });

  it('POST /orders/lookup/verify (OTP thật) trả canReturn / returnDeadline cho đơn vãng lai; đơn của thành viên qua OTP: canReturn false, không return', async () => {
    mails.length = 0;
    expect((await post('/api/orders/lookup/codes', { orderCode: F.R.R7.code, email: 'khach@example.com' }, { ip: freshIp() })).status).toBe(200);
    await flushMail();
    const otp = lastCode('khach@example.com')!;
    const v = await post('/api/orders/lookup/verify', { orderCode: F.R.R7.code, email: 'khach@example.com', code: otp }, { ip: freshIp() });
    expect([v.status, v.body.canReturn, typeof v.body.returnDeadline]).toEqual([200, true, 'string']);
    const real = cookieFrom(v, 'n2f_oa')!;
    expect((await gCreate(real, F.R.R7.code, cust(one()))).status).toBe(201);
    // Đơn của thành viên (R2) qua OTP: vẫn xem được, nhưng không có khối trả hàng vãng lai.
    mails.length = 0;
    await post('/api/orders/lookup/codes', { orderCode: F.R.R2.code, email: 'khach@example.com' }, { ip: freshIp() });
    await flushMail();
    const v2 = await post('/api/orders/lookup/verify', { orderCode: F.R.R2.code, email: 'khach@example.com', code: lastCode('khach@example.com')! }, { ip: freshIp() });
    expect([v2.status, v2.body.canReturn, v2.body.return]).toEqual([200, false, undefined]);
  });
});

describe('T-RET-62 AC-RET-62: ảnh vãng lai', () => {
  it('tải 201: url trỏ về /orders/{code}/return/photos, lưu order_id + grant_hash (băm), không uploader; sai định dạng 422; kích thước 422 size', async () => {
    const r = await gUpload(G, F.R.R7.code, makeJpeg(400, 400));
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.url).toBe(`/api/orders/${F.R.R7.code}/return/photos/${r.body.id}`);
    const row = await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: r.body.id } });
    expect([row.orderId, row.uploaderUserId, row.returnId, row.grantHash]).toEqual([F.R.R7.id, null, null, createHash('sha256').update(G.slice('n2f_oa='.length)).digest('hex')]);
    expect(row.storageKey).toMatch(/^rp-[0-9a-f]{32}\.jpg$/);
    expect((await gUpload(G, F.R.R7.code, Buffer.from('MZ not an image'))).body.error).toMatchObject({ code: 'invalid-image', reason: 'format' });
    expect((await gUpload(G, F.R.R7.code, makePng(150, 150), 'image/png')).body.error.reason).toBe('dimensions');
    expect((await gUpload(G, F.R.R7.code, Buffer.alloc(6 * 1024 * 1024), 'image/jpeg')).body.error.reason).toBe('size');
  });

  it('EXIF / GPS bị gỡ trước khi lưu', async () => {
    const GPS = 'GPSLatitude=10.7769';
    const seg = (m: number, d: Buffer) => {
      const b = Buffer.alloc(4 + d.length);
      b[0] = 0xff; b[1] = m; b.writeUInt16BE(d.length + 2, 2); d.copy(b, 4);
      return b;
    };
    const base = makeJpeg(800, 1000);
    const withExif = Buffer.concat([base.subarray(0, 2), seg(0xe1, Buffer.from(`Exif\0\0${GPS}`)), seg(0xfe, Buffer.from(GPS)), base.subarray(2), Buffer.from([0xff, 0xda, 0x00, 0x02, 1, 2, 0xff, 0xd9])]);
    const r = await gUpload(G, F.R.R7.code, withExif);
    expect(r.status).toBe(201);
    const row = await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: r.body.id } });
    const stored = await getPrivateImageStorage().read(row.storageKey);
    expect(stored!.data.includes(Buffer.from(GPS))).toBe(false);
  });

  it('ảnh thứ 31 trong 1 giờ của cùng grant: 429; grant khác không bị ảnh hưởng; sau 1 giờ tải lại được', async () => {
    for (let i = 0; i < 30; i++) expect((await gUpload(G, F.R.R7.code, makeJpeg(400, 400))).status).toBe(201);
    const r = await gUpload(G, F.R.R7.code, makeJpeg(400, 400));
    expect([r.status, r.body.error.code]).toEqual([429, 'rate-limited']);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect((await gUpload(GH, H.code, makeJpeg(400, 400))).status).toBe(201);
    useClock(new Date(Date.parse(NOW) + HOUR + 1000).toISOString());
    expect((await gUpload(G, F.R.R7.code, makeJpeg(400, 400))).status).toBe(201);
  });

  it('một IP: ảnh thứ 61 trong 1 giờ -> 429 dù đổi grant', async () => {
    const ip = '198.51.100.7';
    const grants = [G, GH, await grant(F.R.R7.id), await grant(F.R.R7.id)];
    for (let i = 0; i < 60; i++) expect((await gUpload(grants[i % 4], i % 4 === 1 ? H.code : F.R.R7.code, makeJpeg(400, 400), 'image/jpeg', ip)).status).toBe(201);
    expect((await gUpload(grants[0], F.R.R7.code, makeJpeg(400, 400), 'image/jpeg', ip)).status).toBe(429);
  });

  it('gắn ảnh: ảnh của grant khác (đơn khác) 422 photos; ảnh của grant KHÁC cùng đơn 422 photos; ảnh quá 24 giờ 422; ảnh đúng 201 và gắn', async () => {
    const own = await upOk(G, F.R.R7.code);
    const other = await upOk(GH, H.code);
    const G2 = await grant(F.R.R7.id);
    const sameOrderOtherGrant = await upOk(G2, F.R.R7.code);
    for (const photos of [[other], [sameOrderOtherGrant], [own, other]]) {
      const r = await gCreate(G, F.R.R7.code, cust(one(), { photos }));
      expect([r.status, r.body.error.field]).toEqual([422, 'photos']);
    }
    expect(await count()).toBe(0);
    const ok = await gCreate(G, F.R.R7.code, cust(one(), { photos: [own] }));
    expect([ok.status, ok.body.photos.length, ok.body.photos[0].url]).toEqual([201, 1, `/api/orders/${F.R.R7.code}/return/photos/${own}`]);
    expect((await prisma.returnPhoto.findUniqueOrThrow({ where: { photo_id: own } })).returnId).toBe(ok.body.id);
    // Đã gắn thì không gắn lại; sau huỷ vẫn không dùng lại.
    await gCancel(G, F.R.R7.code);
    expect((await gCreate(G, F.R.R7.code, cust(one(), { photos: [own] }))).body.error.field).toBe('photos');
    // Quá 24 giờ kể từ lúc tải.
    const old = await upOk(G, F.R.R7.code);
    useClock(new Date(Date.parse(NOW) + 25 * HOUR).toISOString());
    const fresh = await grant(F.R.R7.id, 60 * 24 * HOUR);
    expect((await gCreate(fresh, F.R.R7.code, cust(one(), { photos: [old] }))).body.error.field).toBe('photos');
    // Cùng grant G nhưng ảnh quá 24 giờ cũng bị từ chối; id ảnh không có.
    expect((await gCreate(G, F.R.R7.code, cust(one(), { photos: [old] }))).body.error.field).toBe('photos');
    expect((await gCreate(G, F.R.R7.code, cust(one(), { photos: ['00000000-0000-4000-8000-000000000000'] }))).body.error.field).toBe('photos');
  });

  it('xem ảnh: không grant 401; grant của chính đơn 200 byte đúng (kể cả grant MỚI của đơn); grant đơn khác 404; id sai dạng / lạ 404; header an toàn', async () => {
    const r = await gUpload(G, F.R.R7.code, makeJpeg(400, 400));
    const id = r.body.id as string;
    expect((await gPhoto(undefined, F.R.R7.code, id)).status).toBe(401);
    const ok = await gPhoto(G, F.R.R7.code, id);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['content-type']).toContain('image/jpeg');
    expect(await gPhoto(await grant(F.R.R7.id), F.R.R7.code, id)).toMatchObject({ status: 200 });
    expect((await gPhoto(GH, H.code, id)).status).toBe(404); // ảnh của đơn khác qua đường dẫn đơn của H
    expect((await gPhoto(GH, F.R.R7.code, id)).status).toBe(404); // grant H không mở đơn R7
    expect((await gPhoto(G, F.R.R7.code, 'khong-phai-uuid')).status).toBe(404);
    expect((await gPhoto(G, F.R.R7.code, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    // Sau khi gắn vào yêu cầu: vẫn xem được bằng grant của đơn.
    expect((await gCreate(G, F.R.R7.code, cust(one(), { photos: [id] }))).status).toBe(201);
    expect((await gPhoto(G, F.R.R7.code, id)).status).toBe(200);
  });

  it('staff / admin xem qua /admin/return-photos khi ảnh đã gắn; không gắn thì 404; thành viên không xem được ảnh vãng lai', async () => {
    const S = await loginStaff('rg-staff@nine2fine.test');
    const id = await upOk(G, F.R.R7.code);
    expect((await get(`/api/admin/return-photos/${id}`, { cookie: S.cookie, ip: freshIp() })).status).toBe(404);
    expect((await gCreate(G, F.R.R7.code, cust(one(), { photos: [id] }))).status).toBe(201);
    const a = await get(`/api/admin/return-photos/${id}`, { cookie: S.cookie, ip: freshIp() });
    expect([a.status, a.headers['content-type']]).toEqual([200, 'image/jpeg']);
    expect((await get(`/api/account/return-photos/${id}`, { cookie: F.M.cookie, ip: freshIp() })).status).toBe(404);
  });
});

describe('T-RET-63 AC-RET-63: giới hạn và thư', () => {
  it('yêu cầu thứ 6 trong 1 giờ của cùng grant: 429 rate-limited + Retry-After; hết giờ dùng lại', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await gCreate(G, F.R.R7.code, cust(one()))).status).toBe(201);
      expect((await gCancel(G, F.R.R7.code)).status).toBe(200);
    }
    const r = await gCreate(G, F.R.R7.code, cust(one()));
    expect([r.status, r.body.error.code]).toEqual([429, 'rate-limited']);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.headers['cache-control']).toBe('no-store');
    useClock(new Date(Date.parse(NOW) + HOUR + 1000).toISOString());
    expect((await gCreate(G, F.R.R7.code, cust(one()))).status).toBe(201);
  });

  it('một IP: lần thứ 11 trong 1 giờ -> 429 dù đổi grant (mỗi grant còn dư 5); 401 vẫn đứng trước 429', async () => {
    const ip = '198.51.100.9';
    const gs = [G, await grant(F.R.R7.id), await grant(F.R.R7.id)];
    for (let i = 0; i < 10; i++) expect((await gCreate(gs[i % 3], F.R.R7.code, {}, newKey(), ip)).status).toBe(422);
    expect((await gCreate(gs[0], F.R.R7.code, {}, newKey(), ip)).status).toBe(429);
    expect((await gCreate(undefined, F.R.R7.code, {}, newKey(), ip)).status).toBe(401);
  });

  it('thư "Đã nhận yêu cầu trả hàng" tới email đơn, KHÔNG chứa OTP / mã tra cứu / số tài khoản; sự kiện người = khách, không tên', async () => {
    mails.length = 0;
    await post('/api/orders/lookup/codes', { orderCode: F.R.R7.code, email: 'khach@example.com' }, { ip: freshIp() });
    await flushMail();
    const otp = lastCode('khach@example.com')!;
    const v = await post('/api/orders/lookup/verify', { orderCode: F.R.R7.code, email: 'khach@example.com', code: otp }, { ip: freshIp() });
    const cookie = cookieFrom(v, 'n2f_oa')!;
    mails.length = 0;
    const c = await gCreate(cookie, F.R.R7.code, cust(one()));
    expect(c.status).toBe(201);
    await flushMail();
    const m = mails.filter((x) => x.subject.includes('Đã nhận yêu cầu trả hàng'));
    expect(m).toHaveLength(1);
    expect(m[0].to).toBe('khach@example.com');
    for (const bad of [otp, cookie.slice('n2f_oa='.length), SEED_ACCOUNT.accountNumber]) {
      expect(m[0].text).not.toContain(bad);
    }
    expect(m[0].text).toContain('7890');
    const ev = await prisma.orderEvent.findMany({ where: { orderId: F.R.R7.id, kind: 'return_requested' } });
    expect(ev).toHaveLength(1);
    expect([ev[0].actor, ev[0].actorUserId, ev[0].actorName, ev[0].returnId]).toEqual(['customer', null, null, c.body.id]);
    const t = (await get(`/api/orders/${F.R.R7.code}`, { cookie, ip: freshIp() })).body.timeline.find((x: { title: string }) => x.title === 'Đã gửi yêu cầu trả hàng');
    expect(t.actor).toBe('customer');
  });
});

describe('T-RET-64 AC-RET-64: số tài khoản nhận hoàn', () => {
  it('khách vãng lai COD: chỉ ngân hàng + 4 số cuối + tên; không có số đầy đủ ở phản hồi / thư / sự kiện; admin xem đủ CHỈ ở received; xoá ở trạng thái cuối', async () => {
    const S = await loginStaff('rg2-staff@nine2fine.test');
    const A = await loginAdmin('rg2-admin@nine2fine.test');
    const c = await gCreate(G, F.R.R7.code, cust(one()));
    expect(c.status).toBe(201);
    expect(c.body.refundTo).toEqual({ type: 'account', bank: SEED_ACCOUNT.bank, last4: '7890', accountName: 'NGUYEN VAN A' });
    assertNoAccountSecrets(c);
    const order = await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() });
    assertNoAccountSecrets(order);
    assertNoAccountSecrets(await gCreate(G, F.R.R7.code, cust(one()), newKey())); // return-exists: lời lỗi không lặp lại giá trị
    const bad = await gCreate(G, F.R.R7.code, cust(one(), { accountNumber: '12ab' }));
    expect(bad.text).not.toContain('12ab');
    const id = c.body.id as string;
    const act = (who: { cookie: string }, a: string, body: unknown) => post(`/api/admin/returns/${id}/${a}`, body, { cookie: who.cookie, ip: freshIp() });
    expect((await act(S, 'approve', {})).status).toBe(200);
    const detail = (who: { cookie: string }) => get(`/api/admin/returns/${id}`, { cookie: who.cookie, ip: freshIp() });
    const before = await detail(A);
    expect(before.body.refundTo.accountNumber).toBeUndefined();
    expect((await act(S, 'receive', { lines: [{ variantId: F.v1, acceptedQuantity: 1, disposition: 'restock' }] })).status).toBe(200);
    expect((await detail(S)).body.refundTo.accountNumber).toBeUndefined();
    expect((await detail(A)).body.refundTo.accountNumber).toBe(SEED_ACCOUNT.accountNumber);
    expect((await act(A, 'refund', { amount: 370_000, refundReference: 'CK-G-0001' })).status).toBe(200);
    const raw = await prisma.$queryRawUnsafe<Array<{ e: string | null }>>(`SELECT account_number_enc AS e FROM order_returns WHERE return_id = '${id}'`);
    expect(raw[0].e).toBeNull();
    await flushMail();
    for (const m of mails) expect(m.text).not.toContain(SEED_ACCOUNT.accountNumber);
    const evText = JSON.stringify(await prisma.orderEvent.findMany({ where: { orderId: F.R.R7.id } }));
    expect(evText).not.toContain(SEED_ACCOUNT.accountNumber);
    // Sau hoàn tiền khách vãng lai vẫn không có số đầy đủ.
    assertNoAccountSecrets(await get(`/api/orders/${F.R.R7.code}`, { cookie: G, ip: freshIp() }));
  });
});

describe('T-RET-65 AC-RET-65 (Should): returnPending và nhãn nguồn', () => {
  it('returnPending = đúng các đơn có yêu cầu requested (thành viên + vãng lai); source guest / member ở danh sách, chi tiết, AdminOrder.return', async () => {
    const A = await loginAdmin('rg3-admin@nine2fine.test');
    const g = await gCreate(G, F.R.R7.code, cust(one()));
    expect(g.status).toBe(201);
    const m = await insertReturn({ orderId: F.R.R1.id, state: 'requested', requestedBy: F.M.user.user_id });
    await insertReturn({ orderId: F.R.R5.id, state: 'approved' }); // không phải requested
    const list = await aGet('/orders?limit=50', A.cookie);
    expect(list.status).toBe(200);
    const pending = list.body.items.filter((o: { returnPending: boolean }) => o.returnPending).map((o: { id: string }) => o.id).sort();
    expect(pending).toEqual([F.R.R1.code, F.R.R7.code].sort());
    expect(list.body.items.every((o: { returnPending: unknown }) => typeof o.returnPending === 'boolean')).toBe(true);
    const rl = await aGet('/returns', A.cookie);
    const bySrc = Object.fromEntries(rl.body.items.map((r: { orderCode: string; source: string }) => [r.orderCode, r.source]));
    expect([bySrc[F.R.R7.code], bySrc[F.R.R1.code], bySrc[F.R.R5.code]]).toEqual(['guest', 'member', 'member']);
    expect((await aGet(`/returns/${g.body.id}`, A.cookie)).body.source).toBe('guest');
    expect((await aGet(`/returns/${m.id}`, A.cookie)).body.source).toBe('member');
    expect((await aGet(`/orders/${F.R.R7.code}`, A.cookie)).body.return.source).toBe('guest');
    // Huỷ yêu cầu vãng lai: returnPending hạ.
    await gCancel(G, F.R.R7.code);
    const after = await aGet('/orders?limit=50', A.cookie);
    expect(after.body.items.filter((o: { returnPending: boolean }) => o.returnPending).map((o: { id: string }) => o.id)).toEqual([F.R.R1.code]);
  });
});
