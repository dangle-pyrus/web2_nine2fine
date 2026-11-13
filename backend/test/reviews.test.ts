import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { createReview } from '../src/modules/reviews/review.service';
import {
  A, aGet, aPost, aPut, cookieFrom, createUser, freshIp, get, insertReturn, loginAdmin, loginPassword, loginStaff, makeOrder, makeProduct, post, prisma,
  resetCheckout, resetState, useClock,
} from './helpers';

/** Slice 10, lát 10.5: T-REV-01..06 (AC-REV-01..06, AC-REV-08). */

type Json = Record<string, any>;
const DAY = 86_400_000;

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let staff2: Awaited<ReturnType<typeof loginStaff>>;
let P: Array<{ id: string; slug: string; variantId: string; size: string }> = [];

async function member(email: string, firstName = 'Văn', lastName = 'Nguyễn') {
  const user = await createUser({ email, password: A.password, firstName, lastName });
  const res = await loginPassword(email, A.password, freshIp());
  return { user, cookie: cookieFrom(res, 'n2f_sid')! };
}
type Member = Awaited<ReturnType<typeof member>>;

/** Đơn `completed` đã giao `daysAgo` ngày trước chứa sản phẩm `p` (mặc định size của biến thể đầu). */
async function delivered(m: Member, p: (typeof P)[number], daysAgo: number, qty = 1, status: 'completed' | 'to_receive' | 'cancelled' = 'completed', variantId = p.variantId) {
  return makeOrder({
    status,
    userId: m.user.user_id,
    items: [{ variantId, quantity: qty }],
    data: status === 'completed' ? { deliveredAt: new Date(Date.now() - daysAgo * DAY) } : status === 'cancelled' ? { cancelledAt: new Date(), cancelledBy: 'customer' } : {},
  });
}

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-rev@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-rev@nine2fine.test', { firstName: 'Lan', lastName: 'Phạm' });
  staff2 = await loginStaff('staff-rev2@nine2fine.test');
  const prods = await prisma.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayOrder: 'asc' }, take: 5, include: { variants: { orderBy: { sortOrder: 'asc' } } } });
  P = prods.map((p) => ({ id: p.product_id, slug: p.slug, variantId: p.variants[0].variant_id, size: p.variants[0].size }));
});

beforeEach(async () => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
  await prisma.$executeRawUnsafe('DELETE FROM "product_reviews"');
  await prisma.$executeRawUnsafe(`UPDATE "products" SET "status" = 'ACTIVE' WHERE "status" = 'ARCHIVED'`);
});

const elig = (pid: string, cookie?: string) => get(`/api/reviews/eligibility?productId=${pid}`, { cookie, ip: freshIp() });
const submit = (cookie: string | undefined, body: Json, ip = freshIp()) => post('/api/reviews', body, { cookie, ip });
const good = (pid: string, over: Json = {}): Json => ({ productId: pid, rating: 5, fit: 0, title: 'Rất đẹp', body: 'Áo mặc vừa vặn, chất vải mát và đường may chắc chắn.', ...over });
const publicList = (pid: string, qs = '') => get(`/api/products/${pid}/reviews${qs}`, { ip: freshIp() });

describe('T-REV-01 điều kiện đánh giá (AC-REV-01)', () => {
  it('không phiên -> 200 sign-in, no-store, không Set-Cookie; cookie hỏng cũng vậy', async () => {
    for (const cookie of [undefined, 'n2f_sid=gia-mao']) {
      const r = await elig(P[0].id, cookie);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: 'sign-in' });
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['set-cookie']).toBeUndefined();
    }
  });

  it('M-P1 eligible kèm sizeBought theo đơn GIAO MỚI NHẤT; quá 365 ngày, đã trả hết, chưa nhận, huỷ: not-purchased', async () => {
    const m = await member('m-elig@example.com');
    const n = await member('n-elig@example.com');
    const p1 = P[0];
    const other = await prisma.productVariant.findFirst({ where: { productId: p1.id, size: { not: p1.size } } });
    // đơn cũ hơn: size gốc; đơn mới hơn: size khác (nếu có)
    await delivered(m, p1, 30);
    if (other) await delivered(m, p1, 5, 1, 'completed', other.variant_id);
    const r1 = await elig(p1.id, m.cookie);
    expect(r1.body).toEqual({ status: 'eligible', sizeBought: other ? other.size : p1.size });
    // P2 giao 400 ngày trước
    await delivered(m, P[1], 400);
    expect((await elig(P[1].id, m.cookie)).body).toEqual({ status: 'not-purchased' });
    // P3 trả hết (yêu cầu refunded đủ số lượng)
    const o3 = await delivered(m, P[2], 10, 2);
    await insertReturn({ orderId: o3.id, state: 'refunded' });
    expect((await elig(P[2].id, m.cookie)).body).toEqual({ status: 'not-purchased' });
    // P4 trả một phần (2 mua, 1 chấp nhận): vẫn đủ điều kiện
    const o4 = await delivered(m, P[3], 10, 2);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: o4.id } });
    await insertReturn({ orderId: o4.id, state: 'refunded', lines: [{ variantId: item.variantId, quantity: 1 }] });
    expect((await elig(P[3].id, m.cookie)).body.status).toBe('eligible');
    // N: to_receive và cancelled
    await delivered(n, p1, 0, 1, 'to_receive');
    await delivered(n, P[1], 0, 1, 'cancelled');
    expect((await elig(p1.id, n.cookie)).body).toEqual({ status: 'not-purchased' });
    expect((await elig(P[1].id, n.cookie)).body).toEqual({ status: 'not-purchased' });
    // staff đăng nhập storefront như tài khoản thường
    const st = await createUser({ email: 'st-sf@nine2fine.test', password: A.password, role: 'staff' });
    const sc = cookieFrom(await loginPassword(st.email, A.password, freshIp()), 'n2f_sid')!;
    expect((await elig(p1.id, sc)).body).toEqual({ status: 'not-purchased' });
  });

  it('biên 365 ngày (đồng hồ giả): đúng 365 ngày đủ, trễ 1 giây thì không', async () => {
    const m = await member('m-edge@example.com');
    const T = new Date('2026-11-13T05:00:00.000Z');
    useClock(T.toISOString());
    await makeOrder({ status: 'completed', userId: m.user.user_id, items: [{ variantId: P[0].variantId, quantity: 1 }], data: { deliveredAt: new Date(T.getTime() - 365 * DAY) } });
    await makeOrder({ status: 'completed', userId: m.user.user_id, items: [{ variantId: P[1].variantId, quantity: 1 }], data: { deliveredAt: new Date(T.getTime() - 365 * DAY - 1000) } });
    expect((await elig(P[0].id, m.cookie)).body.status).toBe('eligible');
    expect((await elig(P[1].id, m.cookie)).body.status).toBe('not-purchased');
  });

  it('đã có đánh giá (kể cả ẩn) -> reviewed; productId sai dạng 422; sản phẩm lạ / DRAFT 404', async () => {
    const m = await member('m-rev@example.com');
    await delivered(m, P[0], 3);
    expect((await submit(m.cookie, good(P[0].id))).status).toBe(201);
    expect((await elig(P[0].id, m.cookie)).body).toEqual({ status: 'reviewed' });
    await prisma.productReview.updateMany({ data: { status: 'hidden', hiddenAt: new Date(), hiddenReason: 'ẩn thử nghiệm' } });
    expect((await elig(P[0].id, m.cookie)).body).toEqual({ status: 'reviewed' });
    const bad = await elig('khong-phai-uuid', m.cookie);
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('productId');
    expect((await get('/api/reviews/eligibility', { cookie: m.cookie, ip: freshIp() })).status).toBe(422);
    expect((await elig('00000000-0000-4000-8000-000000000000', m.cookie)).status).toBe(404);
    const draft = await makeProduct({ status: 'DRAFT' });
    expect((await elig(draft.id, m.cookie)).status).toBe(404);
  });

  it('giới hạn đọc 120 / 60 giây, vượt -> 429', async () => {
    const ip = freshIp();
    for (let i = 0; i < 120; i++) expect((await get(`/api/reviews/eligibility?productId=${P[0].id}`, { ip })).status).toBe(200);
    const r = await get(`/api/reviews/eligibility?productId=${P[0].id}`, { ip });
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeTruthy();
  });
});

describe('T-REV-02 kiểm tra dữ liệu gửi (AC-REV-02)', () => {
  let m: Member;
  beforeAll(async () => {
    m = await member('m-val@example.com', 'Minh', 'Trần');
    await delivered(m, P[0], 3);
  });

  const ok = async (over: Json) => {
    await prisma.$executeRawUnsafe('DELETE FROM "product_reviews"');
    resetCheckoutRateLimits();
    const r = await submit(m.cookie, good(P[0].id, over));
    expect(r.status, JSON.stringify([over, r.body])).toBe(201);
    return r.body as Json;
  };
  const bad = async (over: Json, field: string) => {
    resetCheckoutRateLimits();
    const r = await submit(m.cookie, good(P[0].id, over));
    expect(r.status, JSON.stringify([over, r.body])).toBe(422);
    expect(r.body.error.code).toBe('validation');
    expect(r.body.error.field).toBe(field);
    expect(r.body.error.fieldErrors.map((f: Json) => f.field)).toContain(field);
    return r;
  };

  it('rating 0 / 6 sai; 1 / 5 đúng; không nguyên sai', async () => {
    await bad({ rating: 0 }, 'rating');
    await bad({ rating: 6 }, 'rating');
    await bad({ rating: 4.5 }, 'rating');
    await bad({ rating: '5' }, 'rating');
    expect((await ok({ rating: 1 })).rating).toBe(1);
    expect((await ok({ rating: 5 })).rating).toBe(5);
  });

  it('title 1 / 81 sai; 2 / 80 đúng; toàn khoảng trắng sai', async () => {
    await bad({ title: 'a' }, 'title');
    await bad({ title: 'a'.repeat(81) }, 'title');
    await bad({ title: '        ' }, 'title');
    await bad({ title: ' a ' }, 'title');
    expect((await ok({ title: 'ab' })).title).toBe('ab');
    expect((await ok({ title: 'a'.repeat(80) })).title).toHaveLength(80);
  });

  it('body 19 / 1001 sai; 20 / 1000 đúng; đếm sau khi cắt khoảng trắng', async () => {
    await bad({ body: 'a'.repeat(19) }, 'body');
    await bad({ body: `  ${'a'.repeat(19)}  ` }, 'body');
    await bad({ body: 'a'.repeat(1001) }, 'body');
    expect((await ok({ body: 'a'.repeat(20) })).body).toHaveLength(20);
    expect((await ok({ body: 'a'.repeat(1000) })).body).toHaveLength(1000);
  });

  it('height 21 sai; 20 / vắng đúng; fit 2 / "1" sai; -1 / 0 / 1 đúng', async () => {
    await bad({ height: 'h'.repeat(21) }, 'height');
    await bad({ fit: 2 }, 'fit');
    await bad({ fit: '1' }, 'fit');
    expect((await ok({ height: 'h'.repeat(20) })).height).toHaveLength(20);
    const noHeight = await ok({ height: undefined });
    expect(noHeight.height).toBe('');
    for (const fit of [-1, 0, 1]) expect((await ok({ fit })).fit).toBe(fit);
  });

  it('ký tự điều khiển -> 422; xuống dòng hợp lệ; NFC + cắt hai đầu', async () => {
    await bad({ body: `${'a'.repeat(20)}\u0007` }, 'body');
    await bad({ title: 'ti\u0000tle' }, 'title');
    const r = await ok({ title: '  Café  ', body: `  ${'a'.repeat(10)}\n${'b'.repeat(10)}  ` });
    expect(r.title).toBe('Café');
    expect(r.body).toBe(`${'a'.repeat(10)}\n${'b'.repeat(10)}`);
  });

  it('nhiều lỗi trả cùng lúc, field = trường đầu; thiếu thân / sai kiểu', async () => {
    const r = await submit(m.cookie, { productId: P[0].id, rating: 9, fit: 7, title: '', body: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.error.fieldErrors.map((f: Json) => f.field)).toEqual(['rating', 'fit', 'title', 'body']);
    expect(r.body.error.field).toBe('rating');
    const noPid = await submit(m.cookie, { rating: 5, fit: 0, title: 'ab', body: 'a'.repeat(20) });
    expect(noPid.body.error.field).toBe('productId');
    expect((await post('/api/reviews', 'null', { cookie: m.cookie, ip: freshIp() })).status).toBe(422);
  });

  it('sizeBought / author / verified / status / date do FE gửi bị bỏ qua; máy chủ đặt theo đơn và tên', async () => {
    const r = await ok({ sizeBought: 'XXL', author: 'Hacker', verified: false, status: 'hidden', date: '2000-01-01', id: 'x', reply: { body: 'x' } });
    expect(r).toMatchObject({ sizeBought: P[0].size, author: 'Trần M.', verified: true });
    expect(r.date).not.toBe('2000-01-01');
    expect(r.reply).toBeUndefined();
    const row = await prisma.productReview.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'visible', sizeBought: P[0].size, authorDisplay: 'Trần M.' });
    expect(Object.keys(r).sort()).toEqual(['author', 'body', 'date', 'fit', 'height', 'id', 'rating', 'sizeBought', 'title', 'verified'].sort());
  });
});

describe('T-REV-03 một đánh giá mỗi (tài khoản, sản phẩm) (AC-REV-03)', () => {
  it('không phiên 401, thiếu Origin 403, staff chưa mua 409 not-eligible, vãng lai không có đường gửi', async () => {
    expect((await submit(undefined, good(P[0].id))).status).toBe(401);
    const m = await member('m-auth@example.com');
    await delivered(m, P[0], 3);
    expect((await post('/api/reviews', good(P[0].id), { cookie: m.cookie, ip: freshIp(), origin: null })).status).toBe(403);
    const st = await createUser({ email: 'st2-sf@nine2fine.test', password: A.password, role: 'staff' });
    const sc = cookieFrom(await loginPassword(st.email, A.password, freshIp()), 'n2f_sid')!;
    const r = await submit(sc, good(P[0].id));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('not-eligible');
    expect(await prisma.productReview.count()).toBe(0);
  });

  it('chưa đủ điều kiện (P2 quá 365 ngày, P3 trả hết) -> 409 not-eligible, không tạo bản ghi; sản phẩm lạ / DRAFT 404', async () => {
    const m = await member('m-ne@example.com');
    await delivered(m, P[1], 400);
    const o3 = await delivered(m, P[2], 10);
    await insertReturn({ orderId: o3.id, state: 'refunded' });
    for (const p of [P[1], P[2]]) {
      const r = await submit(m.cookie, good(p.id));
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('not-eligible');
    }
    expect((await submit(m.cookie, good('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    const draft = await makeProduct({ status: 'DRAFT' });
    expect((await submit(m.cookie, good(draft.id))).status).toBe(404);
    expect(await prisma.productReview.count()).toBe(0);
  });

  it('lần hai (kể cả khi đánh giá đầu đang ẩn) -> 409 already-reviewed; hiện ngay ở danh sách công khai', async () => {
    const m = await member('m-twice@example.com');
    await delivered(m, P[0], 3);
    const first = await submit(m.cookie, good(P[0].id));
    expect(first.status).toBe(201);
    expect(first.headers['cache-control']).toBe('no-store');
    const second = await submit(m.cookie, good(P[0].id, { title: 'Lần hai' }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already-reviewed');
    expect((await publicList(P[0].id)).body.items.map((i: Json) => i.id)).toEqual([first.body.id]);
    await prisma.productReview.updateMany({ data: { status: 'hidden', hiddenAt: new Date(), hiddenReason: 'ẩn thử nghiệm' } });
    expect((await submit(m.cookie, good(P[0].id))).body.error.code).toBe('already-reviewed');
    expect(await prisma.productReview.count()).toBe(1);
  });

  it('10 yêu cầu đồng thời: đúng 1 x 201, 9 x 409 already-reviewed, DB 1 hàng', async () => {
    const m = await member('m-race@example.com');
    await delivered(m, P[0], 3);
    // mỗi yêu cầu một IP; giới hạn theo tài khoản là 5 / giờ nên nâng bằng cách đặt lại bộ đếm giữa các lần là không thể
    // đồng thời; vì vậy dùng 5 yêu cầu (đúng hạn mức) cho phần đua, rồi 10 yêu cầu ở tài khoản khác.
    const rs = await Promise.all(Array.from({ length: 5 }, () => submit(m.cookie, good(P[0].id))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && r.body.error.code === 'already-reviewed')).toHaveLength(4);
    expect(await prisma.productReview.count({ where: { userId: m.user.user_id } })).toBe(1);
  });

  it('10 yêu cầu đồng thời ở tầng dịch vụ (không qua giới hạn tần suất): đúng 1 thành công, 9 already-reviewed, DB 1 hàng', async () => {
    const m = await member('m-race10@example.com');
    await delivered(m, P[0], 3);
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => createReview(m.user, good(P[0].id), new Date())));
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.map((r) => (r.reason as { code?: string }).code)).toEqual(Array(9).fill('already-reviewed'));
    expect(await prisma.productReview.count({ where: { userId: m.user.user_id } })).toBe(1);
  });

  it('gửi lúc SQL đã có hàng trùng -> already-reviewed (UNIQUE là lưới an toàn)', async () => {
    const m = await member('m-sql@example.com');
    await delivered(m, P[0], 3);
    await prisma.productReview.create({
      data: { productId: P[0].id, userId: m.user.user_id, authorDisplay: 'Nguyễn V.', rating: 3, fit: 0, sizeBought: 'S', title: 'Có sẵn', body: 'a'.repeat(30) },
    });
    expect((await submit(m.cookie, good(P[0].id))).body.error.code).toBe('already-reviewed');
    expect((await prisma.productReview.count({ where: { userId: m.user.user_id } }))).toBe(1);
  });

  it('giới hạn 5 / giờ / tài khoản (đếm cả lần lỗi): lần 6 -> 429 + Retry-After', async () => {
    const m = await member('m-rl@example.com');
    for (let i = 0; i < 5; i++) expect((await submit(m.cookie, { productId: P[0].id }, freshIp())).status).toBe(422);
    const r = await submit(m.cookie, { productId: P[0].id }, freshIp());
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate-limited');
    expect(r.headers['retry-after']).toBeTruthy();
  });
});

describe('T-REV-04 danh sách công khai (AC-REV-04, AC-REV-08)', () => {
  const seedReviews = async (pid: string, n: number, over: Json = {}) => {
    for (let i = 0; i < n; i++) {
      await prisma.productReview.create({
        data: {
          productId: pid, authorDisplay: 'Nguyễn V.', rating: (i % 5) + 1, fit: ((i % 3) - 1), sizeBought: 'M', title: `Tiêu đề ${i}`, body: `Nội dung đánh giá số ${i} đủ dài.`,
          createdAt: new Date(Date.now() - (n - i) * 60_000), updatedAt: new Date(Date.now() - (n - i) * 60_000), ...over,
        },
      });
    }
  };

  it('không cookie vẫn 200, public max-age=10, chỉ visible, mới nhất trước, mặc định limit 10, cookie kèm theo bị bỏ qua', async () => {
    await seedReviews(P[0].id, 5);
    await seedReviews(P[0].id, 1, { status: 'hidden', hiddenAt: new Date(), hiddenReason: 'ẩn thử nghiệm', title: 'Đã ẩn' });
    const r = await publicList(P[0].id);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=10');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.body).toMatchObject({ total: 5, page: 1, limit: 10 });
    expect(r.body.items.map((i: Json) => i.title)).toEqual(['Tiêu đề 4', 'Tiêu đề 3', 'Tiêu đề 2', 'Tiêu đề 1', 'Tiêu đề 0']);
    const item = r.body.items[0];
    expect(item).toMatchObject({ author: 'Nguyễn V.', verified: true, sizeBought: 'M' });
    expect(item.sample).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/@|userId|user_id/);
    const withCookie = await get(`/api/products/${P[0].id}/reviews`, { cookie: 'n2f_sid=gia-mao', ip: freshIp() });
    expect(withCookie.status).toBe(200);
    expect(withCookie.headers['set-cookie']).toBeUndefined();
  });

  it('limit 3 phân trang đúng total; limit 21 / 0 / abc, page 0 -> 422; trang quá cuối rỗng; rating lọc (Should)', async () => {
    await seedReviews(P[0].id, 7);
    const p1 = await publicList(P[0].id, '?limit=3');
    expect(p1.body).toMatchObject({ total: 7, page: 1, limit: 3 });
    expect(p1.body.items).toHaveLength(3);
    const p3 = await publicList(P[0].id, '?limit=3&page=3');
    expect(p3.body.items).toHaveLength(1);
    expect((await publicList(P[0].id, '?limit=3&page=9')).body).toMatchObject({ items: [], total: 7 });
    for (const [qs, field] of [['?limit=21', 'limit'], ['?limit=0', 'limit'], ['?limit=abc', 'limit'], ['?page=0', 'page'], ['?rating=6', 'rating'], ['?rating=0', 'rating']]) {
      const r = await publicList(P[0].id, qs);
      expect(r.status, qs).toBe(422);
      expect(r.body.error.field).toBe(field);
    }
    const star = await publicList(P[0].id, '?rating=4');
    expect(star.body.items.every((i: Json) => i.rating === 4)).toBe(true);
    expect(star.body.total).toBe(star.body.items.length);
    // summary không theo bộ lọc rating
    expect(star.body.summary.count).toBe(7);
  });

  it('sản phẩm DRAFT / lạ / sai dạng -> 404 (không lộ); giữ dữ liệu và trở lại khi công khai lại; summary đúng', async () => {
    await seedReviews(P[0].id, 5);
    expect((await publicList('khong-phai-uuid')).status).toBe(404);
    expect((await publicList('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    await prisma.product.update({ where: { product_id: P[0].id }, data: { status: 'DRAFT' } });
    expect((await publicList(P[0].id)).status).toBe(404);
    await prisma.product.update({ where: { product_id: P[0].id }, data: { status: 'ACTIVE' } });
    const r = await publicList(P[0].id);
    expect(r.status).toBe(200);
    expect(r.body.summary).toMatchObject({ count: 5, average: 3, distribution: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 } });
    expect(r.body.summary.fit.small + r.body.summary.fit.true + r.body.summary.fit.large).toBe(5);
    expect((await get(`/api/products/${P[0].id}/reviews`, { ip: freshIp(), origin: null })).status).toBe(200);
    expect((await post(`/api/products/${P[0].id}/reviews`, {}, { ip: freshIp() })).status).toBe(404);
  });
});

describe('T-REV-05 điểm trung bình (AC-REV-05)', () => {
  const add = (pid: string, rating: number, status = 'visible') =>
    prisma.productReview.create({
      data: {
        productId: pid, authorDisplay: 'Nguyễn V.', rating, fit: 0, sizeBought: 'M', title: 'Tiêu đề', body: 'Nội dung đánh giá đủ dài rồi.',
        status, ...(status === 'hidden' ? { hiddenAt: new Date(), hiddenReason: 'ẩn thử nghiệm' } : {}),
      },
    });
  const rating = async (slug: string, pid: string) => {
    const detail = (await get(`/api/products/${slug}`, { ip: freshIp() })).body;
    const listed = (await get(`/api/products?ids=${pid}`, { ip: freshIp() })).body.items[0];
    expect(listed.rating).toEqual(detail.rating); // PLP = PDP
    return detail.rating as { average: number; count: number } | undefined;
  };

  it('5,4,4 -> 4,3 / 3; ẩn một 4 -> 4,5 / 2; hiện lại -> 4,3 / 3; ẩn hết -> không có rating; thêm 3 sao -> 4,0 / 4', async () => {
    const p = P[0];
    const r5 = await add(p.id, 5);
    const r4a = await add(p.id, 4);
    const r4b = await add(p.id, 4);
    await add(p.id, 1, 'hidden');
    expect(await rating(p.slug, p.id)).toEqual({ average: 4.3, count: 3 });
    const hide = await aPost(`/reviews/${r4a.review_id}/hide`, { reason: 'Vi phạm quy định', updatedAt: r4a.updatedAt.toISOString() }, staff.cookie);
    expect(hide.status, JSON.stringify(hide.body)).toBe(200);
    expect(await rating(p.slug, p.id)).toEqual({ average: 4.5, count: 2 });
    const show = await aPost(`/reviews/${r4a.review_id}/show`, { updatedAt: hide.body.updatedAt }, staff.cookie);
    expect(show.status).toBe(200);
    expect(await rating(p.slug, p.id)).toEqual({ average: 4.3, count: 3 });
    await add(p.id, 3);
    expect(await rating(p.slug, p.id)).toEqual({ average: 4, count: 4 });
    await prisma.productReview.updateMany({ where: { productId: p.id }, data: { status: 'hidden', hiddenAt: new Date(), hiddenReason: 'ẩn hết thử nghiệm' } });
    expect(await rating(p.slug, p.id)).toBeUndefined();
    void r5; void r4b;
  });

  it('làm tròn half-up: 17/4 = 4,25 -> 4,3; 9/2 = 4,5; sản phẩm không có đánh giá không có rating', async () => {
    const p = P[1];
    for (const s of [5, 4, 4, 4]) await add(p.id, s); // 17 / 4
    expect(await rating(p.slug, p.id)).toEqual({ average: 4.3, count: 4 });
    expect(await rating(P[2].slug, P[2].id)).toBeUndefined();
  });

});

describe('T-REV-06 kiểm duyệt (AC-REV-06)', () => {
  /** 25 đánh giá: 3 ẩn, trong 22 hiện có 6 chưa trả lời; 4 đánh giá <= 2 sao (một cái đang ẩn). */
  async function build() {
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const hidden = i < 3;
      const row = await prisma.productReview.create({
        data: {
          productId: P[i % 2].id, authorDisplay: 'Nguyễn V.', rating: i === 0 || i === 3 || i === 4 || i === 5 ? (i % 2) + 1 : 3 + (i % 3), fit: 0, sizeBought: 'M',
          title: `Tiêu đề ${i}`, body: `Nội dung đánh giá ${i} đủ dài rồi.`, status: hidden ? 'hidden' : 'visible',
          createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)), updatedAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
          ...(hidden ? { hiddenAt: new Date(), hiddenReason: 'ẩn thử nghiệm', hiddenByName: 'X', hiddenBy: staff.user.user_id } : {}),
          ...(i >= 9 ? { replyBody: 'Cảm ơn bạn đã đánh giá', replyAt: new Date(), replyByName: 'Phạm Lan', replyBy: staff.user.user_id } : {}),
        },
      });
      ids.push(row.review_id);
    }
    return ids;
  }

  it('phân quyền: member / không cookie 401, member storefront 401; staff và admin đều có reviews.moderate', async () => {
    const m = await member('m-mod@example.com');
    expect((await aGet('/reviews', undefined)).status).toBe(401);
    expect((await aGet('/reviews', m.cookie)).status).toBe(401);
    for (const c of [staff.cookie, admin.cookie]) {
      const r = await aGet('/reviews', c);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
    }
    // hạ vai trò đọc từ DB mỗi yêu cầu: vô hiệu hoá -> 401
    const dead = await loginStaff('dead-rev@nine2fine.test');
    await prisma.user.update({ where: { user_id: dead.user.user_id }, data: { isActive: false } });
    expect((await aGet('/reviews', dead.cookie)).status).toBe(401);
  });

  it('counts đúng cho mọi tab; view all / unanswered / low / hidden; rating; sắp createdAt giảm; limit 20 / 50 / 51', async () => {
    await build();
    const all = await aGet('/reviews', staff.cookie);
    expect(all.body.counts).toEqual({ all: 25, unanswered: 6, low: 4, hidden: 3 });
    expect(all.body).toMatchObject({ total: 25, page: 1, limit: 20 });
    expect(all.body.items).toHaveLength(20);
    const times = all.body.items.map((i: Json) => i.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(all.body.average).toEqual(expect.any(Number));
    const un = await aGet('/reviews?view=unanswered', staff.cookie);
    expect(un.body.total).toBe(6);
    expect(un.body.items.every((i: Json) => i.status === 'visible' && !i.reply)).toBe(true);
    const low = await aGet('/reviews?view=low', staff.cookie);
    expect(low.body.total).toBe(4);
    expect(low.body.items.every((i: Json) => i.rating <= 2)).toBe(true);
    const hid = await aGet('/reviews?view=hidden', staff.cookie);
    expect(hid.body.total).toBe(3);
    expect(hid.body.items[0]).toMatchObject({ status: 'hidden', hiddenReason: 'ẩn thử nghiệm', hiddenBy: { name: 'X', role: 'staff' } });
    expect(hid.body.counts).toEqual(all.body.counts); // counts cố định cho thanh tab
    const r1 = await aGet('/reviews?rating=1', staff.cookie);
    expect(r1.body.items.every((i: Json) => i.rating === 1)).toBe(true);
    const r1low = await aGet('/reviews?view=low&rating=2', staff.cookie);
    expect(r1low.body.items.every((i: Json) => i.rating === 2)).toBe(true);
    expect((await aGet('/reviews?limit=50', staff.cookie)).body.items).toHaveLength(25);
    expect((await aGet('/reviews?limit=50&page=2', staff.cookie)).body).toMatchObject({ items: [], total: 25 });
    for (const [qs, field] of [['limit=51', 'limit'], ['limit=10', 'limit'], ['view=xyz', 'view'], ['rating=9', 'rating'], ['page=0', 'page'], ['productId=abc', 'productId']]) {
      const r = await aGet(`/reviews?${qs}`, staff.cookie);
      expect(r.status, qs).toBe(422);
      expect(r.body.error.field).toBe(field);
    }
    const byProduct = await aGet(`/reviews?productId=${P[0].id}`, staff.cookie);
    expect(byProduct.body.items.every((i: Json) => i.productId === P[0].id)).toBe(true);
    expect(all.body.items[0]).toEqual(expect.objectContaining({ productName: expect.any(String), productSlug: expect.any(String), productImage: expect.any(String), verified: true }));
  });

  it('ẩn: lý do 4 / 251 -> 422, 5 / 250 hợp lệ; ghi người + thời điểm; biến khỏi công khai; ẩn lại với token khớp = 200 không đổi', async () => {
    const [id] = await build().then((a) => a.slice(5));
    const get1 = async () => (await aGet(`/reviews?limit=50`, staff.cookie)).body.items.find((i: Json) => i.id === id) as Json;
    let cur = await get1();
    for (const reason of ['abcd', 'x'.repeat(251), '     ']) {
      const r = await aPost(`/reviews/${id}/hide`, { reason, updatedAt: cur.updatedAt }, staff.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('reason');
    }
    const ok5 = await aPost(`/reviews/${id}/hide`, { reason: 'abcde', updatedAt: cur.updatedAt }, staff.cookie);
    expect(ok5.status, JSON.stringify(ok5.body)).toBe(200);
    expect(ok5.body).toMatchObject({ status: 'hidden', hiddenReason: 'abcde', hiddenBy: { name: 'Phạm Lan', role: 'staff' } });
    expect(new Date(ok5.body.updatedAt).getTime()).toBeGreaterThan(new Date(cur.updatedAt).getTime());
    expect((await publicList(cur.productId, '?limit=20')).body.items.some((i: Json) => i.id === id)).toBe(false);
    // ẩn lại: 200, không đè lý do
    const again = await aPost(`/reviews/${id}/hide`, { reason: 'lý do khác hẳn', updatedAt: ok5.body.updatedAt }, staff.cookie);
    expect(again.status).toBe(200);
    expect(again.body.hiddenReason).toBe('abcde');
    // hiện lại: xoá dấu vết ẩn
    const shown = await aPost(`/reviews/${id}/show`, { updatedAt: again.body.updatedAt }, admin.cookie);
    expect(shown.body.status).toBe('visible');
    expect(shown.body.hiddenReason).toBeUndefined();
    expect(shown.body.hiddenBy).toBeUndefined();
    cur = shown.body;
    const max = await aPost(`/reviews/${id}/hide`, { reason: 'y'.repeat(250), updatedAt: cur.updatedAt }, staff.cookie);
    expect(max.status).toBe(200);
    // show đang visible, token khớp = 200 không đổi
    const unhidden = await aPost(`/reviews/${id}/show`, { updatedAt: max.body.updatedAt }, staff.cookie);
    const noop = await aPost(`/reviews/${id}/show`, { updatedAt: unhidden.body.updatedAt }, staff.cookie);
    expect(noop.status).toBe(200);
    expect(noop.body.updatedAt).toBe(unhidden.body.updatedAt);
  });

  it('trả lời: 4 / 501 -> 422; 5 / 500 hợp lệ; sửa; xoá bằng null; công khai thấy reply (không tên nhân viên); trả lời được đánh giá đang ẩn', async () => {
    const ids = await build();
    const id = ids[5]; // đang visible, chưa trả lời
    const find = async (rid: string) => (await aGet('/reviews?limit=50', staff.cookie)).body.items.find((i: Json) => i.id === rid) as Json;
    let cur = await find(id);
    for (const body of ['abcd', 'z'.repeat(501), '    ']) {
      const r = await aPut(`/reviews/${id}/reply`, { body, updatedAt: cur.updatedAt }, staff.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('body');
    }
    const a = await aPut(`/reviews/${id}/reply`, { body: 'abcde', updatedAt: cur.updatedAt }, staff.cookie);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.reply).toMatchObject({ body: 'abcde', author: 'Phạm Lan' });
    const pub = (await publicList(cur.productId, '?limit=20')).body.items.find((i: Json) => i.id === id);
    expect(pub.reply).toEqual({ body: 'abcde', at: expect.any(String) });
    expect(JSON.stringify(pub)).not.toContain('Phạm');
    const b = await aPut(`/reviews/${id}/reply`, { body: 'r'.repeat(500), updatedAt: a.body.updatedAt }, admin.cookie);
    expect(b.status).toBe(200);
    const cleared = await aPut(`/reviews/${id}/reply`, { body: null, updatedAt: b.body.updatedAt }, staff.cookie);
    expect(cleared.status).toBe(200);
    expect(cleared.body.reply).toBeUndefined();
    const hiddenId = ids[0]; // đang ẩn
    cur = await find(hiddenId);
    const onHidden = await aPut(`/reviews/${hiddenId}/reply`, { body: 'Xin lỗi bạn', updatedAt: cur.updatedAt }, staff.cookie);
    expect(onHidden.status).toBe(200);
    expect(onHidden.body.status).toBe('hidden');
    expect((await publicList(cur.productId, '?limit=20')).body.items.some((i: Json) => i.id === hiddenId)).toBe(false);
  });

  it('updatedAt cũ -> 409 version-conflict (không đổi); hai nhân viên ẩn đồng thời: 1 x 200, còn lại 409; id sai dạng / lạ 404; thân sai 422 trước 404', async () => {
    const ids = await build();
    const id = ids[6];
    const cur = (await aGet('/reviews?limit=50', staff.cookie)).body.items.find((i: Json) => i.id === id) as Json;
    const stale = await aPost(`/reviews/${id}/hide`, { reason: 'Lý do hợp lệ', updatedAt: '2020-01-01T00:00:00.000Z' }, staff.cookie);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version-conflict');
    expect((await prisma.productReview.findUniqueOrThrow({ where: { review_id: id } })).status).toBe('visible');
    const rs = await Promise.all([
      aPost(`/reviews/${id}/hide`, { reason: 'Nhân viên một', updatedAt: cur.updatedAt }, staff.cookie),
      aPost(`/reviews/${id}/hide`, { reason: 'Nhân viên hai', updatedAt: cur.updatedAt }, staff2.cookie),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await aPost('/reviews/khong-phai-uuid/hide', { reason: 'Lý do hợp lệ', updatedAt: cur.updatedAt }, staff.cookie)).status).toBe(404);
    expect((await aPost('/reviews/00000000-0000-4000-8000-000000000000/show', { updatedAt: cur.updatedAt }, staff.cookie)).status).toBe(404);
    expect((await aPost('/reviews/khong-phai-uuid/hide', { reason: 'x', updatedAt: cur.updatedAt }, staff.cookie)).status).toBe(422);
    expect((await aPost(`/reviews/${id}/show`, {}, staff.cookie)).body.error.field).toBe('updatedAt');
  });

  it('sản phẩm không ACTIVE: ẩn khỏi công khai nhưng admin vẫn thấy đánh giá', async () => {
    await build();
    await prisma.product.update({ where: { product_id: P[0].id }, data: { status: 'ARCHIVED' } });
    expect((await publicList(P[0].id)).status).toBe(404);
    const r = await aGet(`/reviews?productId=${P[0].id}`, staff.cookie);
    expect(r.body.total).toBeGreaterThan(0);
  });
});
