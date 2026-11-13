import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { del, freshIp, get, loginMember, makeProduct, post, put, resetCatalog, resetState, useClock } from './helpers';

/** Lát 10.4 (wishlist): T-WISH-01..05. Máy chủ là nguồn sự thật; tối đa 100 mục ACTIVE; ghi trong giao dịch có khoá tài khoản. */

const NOW = '2026-11-13T03:00:00Z';
let M: Awaited<ReturnType<typeof loginMember>>;
let N: Awaited<ReturnType<typeof loginMember>>;
let P: string[] = []; // 130 sản phẩm ACTIVE
let DRAFT: string;
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

const wGet = (cookie?: string) => get('/api/account/wishlist', { cookie, ip: freshIp() });
const wPut = (cookie: string | undefined, id: string) => put(`/api/account/wishlist/${id}`, undefined as never, { cookie, ip: freshIp() });
const wDel = (cookie: string | undefined, id: string) => del(`/api/account/wishlist/${id}`, { cookie, ip: freshIp() });
const wMerge = (cookie: string | undefined, productIds: unknown) => post('/api/account/wishlist/merge', { productIds }, { cookie, ip: freshIp() });
const rowsOf = (userId: string) => prisma.wishlistItem.count({ where: { userId } });
const setStatus = (id: string, status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') => prisma.product.update({ where: { product_id: id }, data: { status } });
/** Chèn thẳng k mục (addedAt tăng dần theo thứ tự). */
const seedItems = (userId: string, ids: string[], start = Date.parse('2026-11-01T00:00:00Z')) =>
  prisma.wishlistItem.createMany({ data: ids.map((productId, i) => ({ userId, productId, addedAt: new Date(start + i * 1000) })) });

beforeAll(async () => {
  await resetState();
  await resetCatalog();
  for (let i = 0; i < 130; i++) P.push((await makeProduct({ status: 'ACTIVE' })).id);
  DRAFT = (await makeProduct({ status: 'DRAFT' })).id;
  M = await loginMember('wl-m@example.com');
  N = await loginMember('wl-n@example.com');
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  useClock(NOW);
  await prisma.wishlistItem.deleteMany({});
  await prisma.product.updateMany({ where: { product_id: { in: P } }, data: { status: 'ACTIVE' } });
});

describe('T-WISH-01 AC-WISH-01: phiên và riêng tư', () => {
  it('không cookie / phiên rác: 401 unauthenticated no-store ở cả 4 operation, DB không đổi', async () => {
    for (const cookie of [undefined, 'n2f_sid=hong']) {
      for (const r of [await wGet(cookie), await wPut(cookie, P[0]), await wDel(cookie, P[0]), await wMerge(cookie, [P[0]])]) {
        expect([r.status, r.body.error.code, r.headers['cache-control']]).toEqual([401, 'unauthenticated', 'no-store']);
      }
    }
    expect(await prisma.wishlistItem.count()).toBe(0);
  });

  it('M thêm P1; N đọc không thấy; N xoá P1 không ảnh hưởng M; phản hồi no-store', async () => {
    const a = await wPut(M.cookie, P[0]);
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect((await wGet(N.cookie)).body).toEqual({ items: [], total: 0 });
    expect((await wDel(N.cookie, P[0])).status).toBe(204);
    const m = await wGet(M.cookie);
    expect(m.headers['cache-control']).toBe('no-store');
    expect(m.body.items.map((i: { productId: string }) => i.productId)).toEqual([P[0]]);
  });

  it('thiếu X-Requested-With / Origin ở thao tác ghi: 403, DB không đổi', async () => {
    const r1 = await put(`/api/account/wishlist/${P[0]}`, undefined as never, { cookie: M.cookie, xrw: null, ip: freshIp() });
    const r2 = await post('/api/account/wishlist/merge', { productIds: [P[0]] }, { cookie: M.cookie, origin: null, ip: freshIp() });
    expect([r1.status, r2.status]).toEqual([403, 403]);
    expect(await rowsOf(M.user.user_id)).toBe(0);
  });
});

describe('T-WISH-02 AC-WISH-02: thêm / xoá / đọc', () => {
  it('thêm lại 200 không đổi (addedAt giữ nguyên, 1 hàng); P2 200; xoá mục không có 204; id lạ / sai dạng / DRAFT 404', async () => {
    const a = await wPut(M.cookie, P[0]);
    expect(a.body).toEqual({ productId: P[0], addedAt: NOW.replace('Z', '.000Z') });
    useClock('2026-11-13T03:10:00Z');
    const again = await wPut(M.cookie, P[0]);
    expect([again.status, again.body]).toEqual([200, a.body]);
    expect(await rowsOf(M.user.user_id)).toBe(1);
    expect((await wPut(M.cookie, P[1])).status).toBe(200);
    expect((await wDel(M.cookie, P[4])).status).toBe(204);
    for (const id of [UNKNOWN, 'khong-phai-uuid', DRAFT]) {
      const r = await wPut(M.cookie, id);
      expect([r.status, r.body.error.code]).toEqual([404, 'not-found']);
    }
    expect(await rowsOf(M.user.user_id)).toBe(2);
  });

  it('đọc: mới thêm trước, có addedAt; sản phẩm bị ẩn không trả nhưng giữ trong DB và trở lại khi công khai lại; xoá mục của sản phẩm đã ẩn 204', async () => {
    useClock('2026-11-13T03:00:00Z');
    await wPut(M.cookie, P[0]);
    useClock('2026-11-13T03:00:05Z');
    await wPut(M.cookie, P[1]);
    useClock('2026-11-13T03:00:09Z');
    await wPut(M.cookie, P[2]);
    const r = await wGet(M.cookie);
    expect(r.body.items.map((i: { productId: string }) => i.productId)).toEqual([P[2], P[1], P[0]]);
    expect(r.body.total).toBe(3);
    expect(r.body.items[0].addedAt).toBe('2026-11-13T03:00:09.000Z');
    await setStatus(P[1], 'ARCHIVED');
    expect((await wGet(M.cookie)).body.items.map((i: { productId: string }) => i.productId)).toEqual([P[2], P[0]]);
    expect(await rowsOf(M.user.user_id)).toBe(3);
    await setStatus(P[1], 'ACTIVE');
    expect((await wGet(M.cookie)).body.total).toBe(3);
    await setStatus(P[2], 'DRAFT');
    expect((await wDel(M.cookie, P[2])).status).toBe(204);
    expect(await rowsOf(M.user.user_id)).toBe(2);
    expect((await wDel(M.cookie, 'khong-phai-uuid')).status).toBe(204);
    expect((await wDel(M.cookie, UNKNOWN)).status).toBe(204);
  });

  it('PUT không đọc thân: gửi thân rác vẫn 200', async () => {
    const r = await put(`/api/account/wishlist/${P[0]}`, { x: 1 }, { cookie: M.cookie, ip: freshIp() });
    expect(r.status).toBe(200);
  });
});

describe('T-WISH-03 AC-WISH-03: giới hạn 100 và đồng thời', () => {
  it('100 mục ACTIVE: mục 101 -> 409 wishlist-full, DB không đổi; thêm lại mục có sẵn vẫn 200; xoá 1 rồi thêm 1 -> 200', async () => {
    await seedItems(M.user.user_id, P.slice(0, 100));
    const r = await wPut(M.cookie, P[100]);
    expect([r.status, r.body.error.code]).toEqual([409, 'wishlist-full']);
    expect(await rowsOf(M.user.user_id)).toBe(100);
    expect((await wPut(M.cookie, P[5])).status).toBe(200);
    expect((await wDel(M.cookie, P[5])).status).toBe(204);
    expect((await wPut(M.cookie, P[100])).status).toBe(200);
    expect((await wGet(M.cookie)).body.total).toBe(100);
    expect((await wPut(M.cookie, P[5])).body.error.code).toBe('wishlist-full');
  });

  it('mục của sản phẩm đã ẩn không tính vào 100: 100 mục trong đó 1 ẩn -> thêm được; ẩn thêm rồi hiện lại -> đọc không quá 100', async () => {
    await seedItems(M.user.user_id, P.slice(0, 100));
    await setStatus(P[10], 'ARCHIVED');
    expect((await wPut(M.cookie, P[100])).status).toBe(200);
    expect(await rowsOf(M.user.user_id)).toBe(101);
    const read = await wGet(M.cookie);
    expect(read.body.total).toBe(100);
    expect(read.body.items).toHaveLength(100);
    expect(read.body.items.some((i: { productId: string }) => i.productId === P[10])).toBe(false);
  });

  it('20 yêu cầu thêm song song (sản phẩm khác nhau) khi có 95 mục: đúng 5 x 200, 15 x 409, tổng 100', async () => {
    await seedItems(M.user.user_id, P.slice(0, 95));
    const rs = await Promise.all(P.slice(95, 115).map((id) => wPut(M.cookie, id)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(5);
    const lost = rs.filter((r) => r.status !== 200);
    expect(lost).toHaveLength(15);
    expect(lost.every((r) => r.status === 409 && r.body.error.code === 'wishlist-full')).toBe(true);
    expect(await rowsOf(M.user.user_id)).toBe(100);
  });

  it('20 yêu cầu song song cùng một sản phẩm: 20 x 200, 1 hàng; PUT song song với merge khi 99: tổng không vượt 100', async () => {
    const same = await Promise.all(Array.from({ length: 20 }, () => wPut(M.cookie, P[0])));
    expect(same.every((r) => r.status === 200)).toBe(true);
    expect(await rowsOf(M.user.user_id)).toBe(1);
    await prisma.wishlistItem.deleteMany({});
    await seedItems(M.user.user_id, P.slice(0, 99));
    const rs = await Promise.all([wPut(M.cookie, P[110]), wMerge(M.cookie, [P[111], P[112]]), wPut(M.cookie, P[113]), wMerge(M.cookie, [P[114]])]);
    expect(rs.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(await rowsOf(M.user.user_id)).toBe(100);
  });
});

describe('T-WISH-05 AC-WISH-05: gộp khi đăng nhập', () => {
  it('server [P3]; local [P1, P2, id lạ, P7 DRAFT] -> {P3, P1, P2}, skipped 2, thứ tự mới trước theo thứ tự gửi; gọi lần hai không nhân đôi', async () => {
    await seedItems(M.user.user_id, [P[3]]);
    const r = await wMerge(M.cookie, [P[1], P[2], UNKNOWN, DRAFT]);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.skipped).toBe(2);
    expect(r.body.total).toBe(3);
    expect(r.body.items.map((i: { productId: string }) => i.productId)).toEqual([P[2], P[1], P[3]]);
    const r2 = await wMerge(M.cookie, [P[1], P[2], UNKNOWN, DRAFT]);
    expect(r2.body.skipped).toBe(2);
    expect(r2.body.items).toEqual(r.body.items);
    expect(await rowsOf(M.user.user_id)).toBe(3);
  });

  it('id đã có trên máy chủ và id trùng trong lần gửi không tính vào skipped; chuỗi rác / hoa-thường UUID', async () => {
    await seedItems(M.user.user_id, [P[0]]);
    const r = await wMerge(M.cookie, [P[0], P[1], P[1], P[2].toUpperCase(), 'abc', '  ']);
    expect(r.body.skipped).toBe(2); // 'abc' và '  '
    expect(r.body.items.map((i: { productId: string }) => i.productId).sort()).toEqual([P[0], P[1], P[2]].sort());
    expect((await wMerge(M.cookie, [])).body.skipped).toBe(0);
  });

  it('101 id -> 422 productIds (DB không đổi); phần tử không phải chuỗi / thiếu productIds / không phải mảng -> 422', async () => {
    const r = await wMerge(M.cookie, P.slice(0, 101));
    expect([r.status, r.body.error.code, r.body.error.field]).toEqual([422, 'validation', 'productIds']);
    expect(await rowsOf(M.user.user_id)).toBe(0);
    for (const bad of [[1, 2], [null], 'x', undefined, { a: 1 }, ['a'.repeat(65)]]) {
      const x = await wMerge(M.cookie, bad);
      expect([x.status, x.body.error.field]).toEqual([422, 'productIds']);
    }
    expect((await post('/api/account/wishlist/merge', [], { cookie: M.cookie, ip: freshIp() })).status).toBe(422);
    expect((await wMerge(M.cookie, P.slice(0, 100))).body.total).toBe(100);
  });

  it('server 99 + gộp 3 id mới hợp lệ: thêm 1 (đủ 100), skipped >= 2, mục của server không bị bỏ', async () => {
    await seedItems(M.user.user_id, P.slice(0, 99));
    const r = await wMerge(M.cookie, [P[120], P[121], P[122]]);
    expect([r.body.total, r.body.skipped]).toEqual([100, 2]);
    const ids = r.body.items.map((i: { productId: string }) => i.productId);
    for (const id of P.slice(0, 99)) expect(ids).toContain(id);
    expect(ids).toContain(P[120]); // thứ tự gửi: id đầu được thêm
    expect(ids).not.toContain(P[121]);
  });

  it('máy chủ là nguồn sự thật: mục xoá ở thiết bị A không quay lại khi B gộp danh sách rỗng; B chỉ gộp mục chưa đồng bộ', async () => {
    await wMerge(M.cookie, [P[1], P[2]]);
    await wDel(M.cookie, P[1]); // thiết bị A xoá
    const b = await wMerge(M.cookie, [P[4]]); // thiết bị B chỉ gửi mục chưa đồng bộ
    expect(b.body.items.map((i: { productId: string }) => i.productId).sort()).toEqual([P[2], P[4]].sort());
    expect((await wGet(M.cookie)).body.items.some((i: { productId: string }) => i.productId === P[1])).toBe(false);
  });
});

describe('T-WISH-06: giới hạn tần suất', () => {
  it('ghi lần thứ 61 trong 1 phút -> 429 rate-limited + Retry-After; đọc không bị ảnh hưởng; hết phút ghi lại được', async () => {
    for (let i = 0; i < 60; i++) expect((await wPut(M.cookie, P[0])).status).toBe(200);
    const r = await wPut(M.cookie, P[0]);
    expect([r.status, r.body.error.code]).toEqual([429, 'rate-limited']);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect((await wDel(M.cookie, P[0])).status).toBe(429);
    expect((await wMerge(M.cookie, [P[1]])).status).toBe(429);
    expect((await wGet(M.cookie)).status).toBe(200);
    expect((await wPut(N.cookie, P[0])).status).toBe(200); // tài khoản khác không ảnh hưởng
    useClock('2026-11-13T03:01:01Z');
    expect((await wPut(M.cookie, P[0])).status).toBe(200);
  });
});
