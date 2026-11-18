import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { setMailTransport } from '../src/mail/mailer';
import {
  aGet, aPost, assertNoAccountSecrets, createReturnReq, flushMail, freshIp, get, insertReturn, insertRevenueOrder, loginAdmin, loginStaff, makeReturnFixtures,
  mails, post, ReturnFixture, resetCheckout, resetState, SEED_ACCOUNT, setStock, stockOf, uploadMyPhoto, makeReturnPhoto, useClock, vnAt,
} from './helpers';

/** Lát 9.3 (admin): T-RET-02 (đủ), 30..41, 47. D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';
const ACCT = { bank: 'Vietcombank', number: SEED_ACCOUNT.accountNumber, name: 'NGUYEN VAN A' };
let F: ReturnFixture;
let S: Awaited<ReturnType<typeof loginStaff>>;
let A: Awaited<ReturnType<typeof loginAdmin>>;

const clearReturns = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "order_returns", "order_return_items", "return_photos", "idempotency_keys", "inventory_adjustments" RESTART IDENTITY CASCADE');
const stateOf = async (id: string) => (await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: id } })).state;
const payOf = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { order_id: orderId } })).paymentStatus;
const evCount = (kind: string) => prisma.orderEvent.count({ where: { kind: kind as never } });
const act = (id: string, action: string, body: unknown, cookie = S.cookie) => aPost(`/returns/${id}/${action}`, body, cookie);
const receiveAll = (id: string, extra: Record<string, unknown> = {}) =>
  act(id, 'receive', { lines: [{ variantId: F.v1, acceptedQuantity: 2, disposition: 'restock' }, { variantId: F.v2, acceptedQuantity: 1, disposition: 'restock' }], ...extra });

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  F = await makeReturnFixtures(D);
  S = await loginStaff('ret-staff@nine2fine.test', { firstName: 'Hoa', lastName: 'Trần' });
  A = await loginAdmin('ret-admin@nine2fine.test', { firstName: 'Minh', lastName: 'Lê' });
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  useClock(NOW);
  await clearReturns();
  mails.length = 0;
  await setStock(F.v1, 7);
  await setStock(F.v2, 4);
  await prisma.order.updateMany({ data: { paymentStatus: 'paid' }, where: { status: 'completed' } });
});
afterEach(() => {
  setMailTransport({ async send(m) { mails.push(m); } });
  setEmailRetryDelays([0, 10_000, 60_000]);
});

describe('T-RET-02 / 47 AC-RET-02, 03: quyền', () => {
  it('S: 200 duyệt / từ chối / nhận hàng, 403 hoàn tiền (không sự kiện, không đổi dữ liệu); A hoàn tiền được', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'requested' });
    expect((await act(a.id, 'approve', {})).status).toBe(200);
    expect((await receiveAll(a.id)).status).toBe(200);
    const before = await evCount('return_refunded');
    const r = await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'CK-0001' });
    expect([r.status, r.body.error.code]).toEqual([403, 'forbidden']);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(await stateOf(a.id)).toBe('received');
    expect(await evCount('return_refunded')).toBe(before);
    // thân sai vẫn 403 (kiểm quyền trước Zod)
    expect((await act(a.id, 'refund', { amount: 'x' })).status).toBe(403);
    expect((await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'CK-0001' }, A.cookie)).status).toBe(200);
    const b = await insertReturn({ orderId: F.R.R2.id, state: 'requested', reason: 'not-fit' });
    expect((await act(b.id, 'reject', { note: 'Hàng đã qua sử dụng' })).status).toBe(200);
  });
  it('không phiên / phiên khách: 401 no-store; hạ A xuống staff bằng SQL: 403 ngay; khoá staff: 401', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'received' });
    for (const cookie of [undefined, F.M.cookie]) {
      const r = await aPost(`/returns/${a.id}/approve`, {}, cookie);
      expect(r.status).toBe(401);
      expect(r.headers['cache-control']).toBe('no-store');
      expect((await aGet('/returns', cookie)).status).toBe(401);
    }
    const A2 = await loginAdmin('ret-admin2@nine2fine.test');
    const S2 = await loginStaff('ret-staff2@nine2fine.test');
    await prisma.user.update({ where: { user_id: A2.user.user_id }, data: { role: 'staff' } });
    const r = await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'CK-0002' }, A2.cookie);
    expect(r.status).toBe(403);
    await prisma.user.update({ where: { user_id: S2.user.user_id }, data: { isActive: false } });
    expect((await aGet('/returns', S2.cookie)).status).toBe(401);
    expect(await stateOf(a.id)).toBe('received');
  });
  it('giới hạn: 61 thao tác ghi / 60 giây -> 429; 31 ảnh / giờ -> 429', async () => {
    const S3 = await loginStaff('ret-staff3@nine2fine.test');
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await aPost(`/returns/${crypto.randomUUID()}/approve`, {}, S3.cookie)).status;
    expect(last).toBe(429);
    const img = makeReturnPhoto();
    let up = 0;
    for (let i = 0; i < 31; i++) up = (await uploadMyPhoto(F.M.cookie, img, 'image/jpeg')).status;
    expect(up).toBe(429);
  });
});

describe('T-RET-30 AC-RET-31: danh sách', () => {
  let ids: string[] = [];
  beforeEach(async () => {
    const p = (await prisma.productVariant.findFirstOrThrow({ where: { sku: 'RET-V3' } })).variant_id;
    ids = [];
    const states = [...Array(8).fill('requested'), ...Array(5).fill('approved'), ...Array(4).fill('received'), ...Array(5).fill('refunded'), ...Array(2).fill('rejected'), 'cancelled'];
    for (let i = 0; i < states.length; i++) {
      const o = await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), userId: F.M.user.user_id, lines: [{ variantId: p, quantity: 1, unitPrice: 100_000 + i * 1000 }] });
      const r = await insertReturn({ orderId: o.id, state: states[i], reason: 'not-fit', requestedAt: new Date(Date.parse(NOW) - (states.length - i) * 60_000 - 3_600_000) });
      ids.push(r.id);
    }
  });
  it('mặc định 20 dòng + counts 8 / 5 / 4 / 5 / 3 / 25; closed; limit 50; page quá cuối', async () => {
    const r = await aGet('/returns', S.cookie);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(20);
    expect([r.body.total, r.body.page, r.body.limit]).toEqual([25, 1, 20]);
    expect(r.body.counts).toEqual({ all: 25, requested: 8, approved: 5, received: 4, refunded: 5, closed: 3 });
    expect(Object.keys(r.body.items[0]).sort()).toEqual(['amount', 'fault', 'id', 'itemCount', 'orderCode', 'overdue', 'reason', 'recipientName', 'requestedAt', 'source', 'state', 'total'].filter((k) => k !== 'total').sort());
    const times = r.body.items.map((i: { requestedAt: string }) => i.requestedAt);
    expect([...times].sort().reverse()).toEqual(times);
    const closed = await aGet('/returns?state=closed', A.cookie);
    expect([closed.body.total, closed.body.items.length]).toEqual([3, 3]);
    expect(closed.body.counts.all).toBe(25);
    expect((await aGet('/returns?limit=50', S.cookie)).body.items).toHaveLength(25);
    const far = await aGet('/returns?page=99', S.cookie);
    expect([far.body.items.length, far.body.total]).toEqual([0, 25]);
    const p2 = await aGet('/returns?page=2', S.cookie);
    expect(p2.body.items).toHaveLength(5);
  });
  it('limit 0 / 51, sort / state lạ, q dài -> 422 theo trường; sort=amount giảm dần', async () => {
    for (const [qs, field] of [['limit=0', 'limit'], ['limit=51', 'limit'], ['sort=reason', 'sort'], ['state=bogus', 'state'], ['page=0', 'page'], [`q=${'a'.repeat(101)}`, 'q']]) {
      const r = await aGet(`/returns?${qs}`, S.cookie);
      expect([qs, r.status, r.body.error.field]).toEqual([qs, 422, field]);
    }
    const r = await aGet('/returns?sort=amount&limit=50', S.cookie);
    const amounts = r.body.items.map((i: { amount: number }) => i.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });
  it('q theo mã đơn / tên không dấu / SĐT; counts theo cùng q', async () => {
    const code = (await prisma.order.findFirstOrThrow({ where: { returns: { some: { return_id: ids[0] } } } })).code;
    const byCode = await aGet(`/returns?q=%23${code.toLowerCase()}`, S.cookie);
    expect([byCode.body.total, byCode.body.counts.all]).toEqual([1, 1]);
    expect((await aGet('/returns?q=nguyen%20van', S.cookie)).body.counts.all).toBe(25);
    expect((await aGet('/returns?q=0912345678', S.cookie)).body.total).toBe(25);
    expect((await aGet('/returns?q=0999999', S.cookie)).body.total).toBe(0);
  });
  it('hoà thời điểm: thứ tự ổn định qua các trang (return_id giảm)', async () => {
    await prisma.orderReturn.updateMany({ data: { requestedAt: new Date('2026-11-12T01:00:00Z') } });
    const a = await aGet('/returns?limit=20&page=1', S.cookie);
    const b = await aGet('/returns?limit=20&page=2', S.cookie);
    const all = [...a.body.items, ...b.body.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(25);
    expect(all).toEqual([...all].sort().reverse());
  });
});

describe('T-RET-31 AC-RET-32: chi tiết', () => {
  it('approved / received: người nhận đủ; số đầy đủ CHỈ admin (mọi trạng thái còn mở); id lạ 404; AdminOrder.return che số', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved', account: ACCT });
    const d1 = await aGet(`/returns/${a.id}`, A.cookie);
    expect(d1.status).toBe(200);
    expect(d1.body.recipient).toEqual({ name: 'Nguyễn Văn A', phone: '0912345678', email: 'khach@example.com' });
    expect(d1.body.refundTo).toEqual({ type: 'account', bank: 'Vietcombank', last4: '7890', accountName: 'NGUYEN VAN A', accountNumber: SEED_ACCOUNT.accountNumber });
    expect(d1.body.allowedActions).toEqual(['reject', 'receive']);
    const d1s = await aGet(`/returns/${a.id}`, S.cookie);
    expect(d1s.body.refundTo.accountNumber).toBeUndefined();
    assertNoAccountSecrets(d1s);
    await prisma.$executeRawUnsafe(`UPDATE order_returns SET state = 'received', received_at = now(), amount_final = true WHERE return_id = '${a.id}'`);
    const ra = await aGet(`/returns/${a.id}`, A.cookie);
    expect(ra.body.refundTo.accountNumber).toBe(SEED_ACCOUNT.accountNumber);
    expect(ra.body.allowedActions).toEqual(['refund']);
    const rs = await aGet(`/returns/${a.id}`, S.cookie);
    expect(rs.body.refundTo.accountNumber).toBeUndefined();
    expect(rs.body.allowedActions).toEqual([]);
    assertNoAccountSecrets(rs);
    expect((await aGet(`/returns/${crypto.randomUUID()}`, S.cookie)).status).toBe(404);
    expect((await aGet('/returns/khong-phai-uuid', S.cookie)).status).toBe(404);
    const o = await aGet(`/orders/${F.R.R1.code}`, A.cookie);
    expect(o.body.return.id).toBe(a.id);
    expect(o.body.return.refundTo.accountNumber).toBeUndefined();
    assertNoAccountSecrets(o);
    // bản "refunded": số đầy đủ không còn, chỉ bản che
    await prisma.$executeRawUnsafe(`UPDATE order_returns SET state = 'refunded', refunded_at = now(), refund_reference = 'CK-1234', account_number_enc = NULL WHERE return_id = '${a.id}'`);
    const rf = await aGet(`/returns/${a.id}`, A.cookie);
    expect(rf.body.refundTo).toEqual({ type: 'account', bank: 'Vietcombank', last4: '7890', accountName: 'NGUYEN VAN A' });
    expect(rf.body.refundReference).toBe('CK-1234');
  });
});

describe('T-RET-32 / 33 AC-RET-33, 34: duyệt và từ chối', () => {
  it('duyệt: ghi chú 251 -> 422 note; 250 / không ghi chú ok; tồn và payment_status không đổi; 1 sự kiện; 1 thư', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'requested' });
    const bad = await act(a.id, 'approve', { note: 'x'.repeat(251) });
    expect([bad.status, bad.body.error.field]).toEqual([422, 'note']);
    expect(await stateOf(a.id)).toBe('requested');
    const ok = await act(a.id, 'approve', { note: 'n'.repeat(250), carrier: 'GHN', trackingNumber: 'ABC123' });
    expect([ok.status, ok.body.state, ok.body.approveNote.length, ok.body.carrier, ok.body.trackingNumber]).toEqual([200, 'approved', 250, 'GHN', 'ABC123']);
    expect(await stockOf(F.v1)).toBe(7);
    expect(await payOf(F.R.R1.id)).toBe('paid');
    expect(await evCount('return_approved')).toBe(1);
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { kind: 'return_approved' } });
    expect([ev.actor, ev.actorName, ev.actorRole, ev.returnId, ev.reasonCode]).toEqual(['shop', 'Trần Hoa', 'staff', a.id, null]);
    await flushMail();
    expect(mails.filter((m) => m.subject.includes('đã được duyệt'))).toHaveLength(1);
    const again = await act(a.id, 'approve', {});
    expect([again.status, again.body.error.code, again.body.error.currentReturnState]).toEqual([409, 'invalid-transition', 'approved']);
    const o = await get(`/api/orders/${F.R.R1.code}`, { cookie: F.M.cookie, ip: freshIp() });
    expect(o.body.return.instructions).toContain('Tầng 5');
    expect(o.body.timeline.some((t: { title: string; actor: string }) => t.title === 'Yêu cầu trả hàng đã được duyệt' && t.actor === 'nine2fine')).toBe(true);
  });
  it('từ chối: ghi chú 4 / 5 / 250 / 251 / thiếu; approved -> rejected; tạo lại -> return-exists; số tài khoản xoá; thư có lý do', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved', account: ACCT });
    for (const note of [undefined, 'abcd', 'x'.repeat(251), '     ']) {
      const r = await act(a.id, 'reject', note === undefined ? {} : { note });
      expect([r.status, r.body.error.field]).toEqual([422, 'note']);
    }
    expect((await act(a.id, 'reject', { note: 'x'.repeat(250) })).status).toBe(200);
    await prisma.orderReturn.update({ where: { return_id: a.id }, data: { rejectNote: 'Hàng đã qua sử dụng' } });
    const row = await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: a.id } });
    expect([row.state, row.accountNumberEnc, row.accountLast4, row.activeOrderId]).toEqual(['rejected', null, '7890', F.R.R1.id]);
    const re = await createReturnReq(F.M.cookie, F.R.R1.code, { lines: [{ variantId: F.v1, quantity: 1 }], reason: 'not-fit', conditionAck: true, ...{ bank: 'VCB', accountNumber: '1234567890', accountName: 'A B' } });
    expect(re.body.error.code).toBe('return-exists');
    await flushMail();
    expect(mails.filter((m) => m.subject.includes('không được chấp nhận'))).toHaveLength(1);
    expect(await payOf(F.R.R1.id)).toBe('paid');
    // từ chối khi đã received -> 409
    const b = await insertReturn({ orderId: F.R.R2.id, state: 'received', reason: 'not-fit' });
    expect((await act(b.id, 'reject', { note: 'Không hợp lệ' })).status).toBe(409);
  });
});

describe('T-RET-34 AC-RET-35: nhận hàng và kiểm', () => {
  const lines = (a1: number, a2: number, d = 'restock') => [
    { variantId: F.v1, acceptedQuantity: a1, ...(a1 > 0 ? { disposition: d } : {}) }, { variantId: F.v2, acceptedQuantity: a2, ...(a2 > 0 ? { disposition: d } : {}) },
  ];
  it('a) đạt hết: 1.200.000 final, received', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved', account: ACCT });
    const r = await act(a.id, 'receive', { lines: lines(2, 1) });
    expect([r.status, r.body.state, r.body.amount.amount, r.body.amount.final]).toEqual([200, 'received', 1_200_000, true]);
    expect(r.body.lines.every((l: { acceptedQuantity: number; disposition: string }) => l.acceptedQuantity > 0 && l.disposition === 'restock')).toBe(true);
    expect(await evCount('return_received')).toBe(1);
  });
  it('b) defective L1 x2 chỉ đạt 1, L2 0: 422 note khi thiếu; có note -> 450.000 (không hoàn ship)', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved', reason: 'defective' });
    const bad = await act(a.id, 'receive', { lines: lines(1, 0) });
    expect([bad.status, bad.body.error.field]).toEqual([422, 'note']);
    expect(await stateOf(a.id)).toBe('approved');
    const r = await act(a.id, 'receive', { lines: lines(1, 0), note: 'Một chiếc bị rách' });
    expect([r.body.amount.amount, r.body.amount.shippingRefund, r.body.receiveNote]).toEqual([450_000, 0, 'Một chiếc bị rách']);
    expect(await stockOf(F.v1)).toBe(8);
  });
  it('d) đạt 0 -> rejected, payment_status không đổi, không đổi tồn; số tài khoản xoá', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved', account: ACCT });
    const r = await act(a.id, 'receive', { lines: lines(0, 0), note: 'Hàng đã qua sử dụng' });
    expect([r.status, r.body.state, r.body.rejectNote]).toEqual([200, 'rejected', 'Hàng đã qua sử dụng']);
    expect(await payOf(F.R.R1.id)).toBe('paid');
    expect(await stockOf(F.v1)).toBe(7);
    expect(await prisma.inventoryAdjustment.count({ where: { reason: 'return' } })).toBe(0);
    expect((await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: a.id } })).accountNumberEnc).toBeNull();
    expect(await evCount('return_rejected')).toBe(1);
    expect(await evCount('return_received')).toBe(0);
  });
  it('e) thiếu dòng, f) dòng lạ / trùng / vượt số lượng / thiếu disposition -> 422 lines', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved' });
    for (const bad of [
      [{ variantId: F.v1, acceptedQuantity: 2, disposition: 'restock' }],
      [...lines(2, 1), { variantId: F.v3, acceptedQuantity: 1, disposition: 'restock' }],
      [...lines(2, 1), { variantId: F.v1, acceptedQuantity: 1, disposition: 'restock' }],
      [{ variantId: F.v1, acceptedQuantity: 3, disposition: 'restock' }, { variantId: F.v2, acceptedQuantity: 1, disposition: 'restock' }],
      [{ variantId: F.v1, acceptedQuantity: 2 }, { variantId: F.v2, acceptedQuantity: 1, disposition: 'restock' }],
    ]) {
      const r = await act(a.id, 'receive', { lines: bad, note: 'ghi chú đủ dài' });
      expect([r.status, r.body.error.field]).toEqual([422, 'lines']);
    }
    expect(await stateOf(a.id)).toBe('approved');
    expect(await stockOf(F.v1)).toBe(7);
  });
  it('vượt tồn tối đa 100.000 -> 422 lines và rollback trọn gói', async () => {
    await setStock(F.v1, 99_999);
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved' });
    const r = await receiveAll(a.id);
    expect([r.status, r.body.error.field]).toEqual([422, 'lines']);
    expect(await stateOf(a.id)).toBe('approved');
    expect(await stockOf(F.v2)).toBe(4);
  });
});

describe('T-RET-35 AC-RET-36, 55: nhập kho đúng một lần', () => {
  it('V1 7 -> 9, 1 dòng adjustments (return, +2, ghi chú, người S); V2 writeoff vẫn 4; movements cùng định dạng', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'approved' });
    const r = await act(a.id, 'receive', { lines: [{ variantId: F.v1, acceptedQuantity: 2, disposition: 'restock' }, { variantId: F.v2, acceptedQuantity: 1, disposition: 'writeoff' }] });
    expect(r.status).toBe(200);
    expect([await stockOf(F.v1), await stockOf(F.v2)]).toEqual([9, 4]);
    const adj = await prisma.inventoryAdjustment.findMany({ where: { reason: 'return' } });
    expect(adj).toHaveLength(1);
    expect([adj[0].variantId, adj[0].delta, adj[0].availableAfter, adj[0].note, adj[0].actorUserId, adj[0].actorRole]).toEqual([F.v1, 2, 9, `Trả hàng #${F.R.R1.code}`, S.user.user_id, 'staff']);
    const mv = await aGet(`/inventory/${F.v1}/movements`, S.cookie);
    expect(mv.status).toBe(200);
    expect(JSON.stringify(mv.body)).toContain('return');
  });
  it('20 yêu cầu song song thật sự trên một yêu cầu approved', async () => {
    const a = await insertReturn({ orderId: F.R.R2.id, state: 'approved', reason: 'not-fit' });
    const staffs = await Promise.all(Array.from({ length: 4 }, (_, i) => loginStaff(`ret-par2${i}-${Date.now()}@nine2fine.test`)));
    const body = { lines: [{ variantId: F.v1, acceptedQuantity: 1, disposition: 'restock' }] };
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => act(a.id, 'receive', body, staffs[i % 4].cookie)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && r.body.error.code === 'invalid-transition' && r.body.error.currentReturnState)).toHaveLength(19);
    expect(await stockOf(F.v1)).toBe(8);
    expect(await prisma.inventoryAdjustment.count({ where: { reason: 'return' } })).toBe(1);
    expect(await evCount('return_received')).toBe(1);
  });
});

describe('T-RET-36 / 37 AC-RET-37, 38: hoàn tiền', () => {
  it('amount sai -> 422 amount; mã 3 / 4 / 60 / 61; đúng 200; lần hai invalid-transition; thư (d)', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'received', account: ACCT });
    expect((await act(a.id, 'refund', { amount: 1_199_999, refundReference: 'CK-1234' }, A.cookie)).body.error.field).toBe('amount');
    expect((await act(a.id, 'refund', { amount: 1_200_000.5, refundReference: 'CK-1234' }, A.cookie)).body.error.field).toBe('amount');
    for (const ref of ['abc', 'r'.repeat(61), undefined]) {
      expect((await act(a.id, 'refund', { amount: 1_200_000, refundReference: ref }, A.cookie)).body.error.field).toBe('refundReference');
    }
    expect(await stateOf(a.id)).toBe('received');
    expect((await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'abcd' }, A.cookie)).status).toBe(200);
    await prisma.orderReturn.update({ where: { return_id: a.id }, data: { refundReference: 'CK-VCB-2026' } });
    const row = await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: a.id } });
    expect([row.state, row.refundedBy, row.accountNumberEnc, row.accountLast4]).toEqual(['refunded', A.user.user_id, null, '7890']);
    const again = await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'abcd' }, A.cookie);
    expect([again.status, again.body.error.currentReturnState]).toEqual([409, 'refunded']);
    await flushMail();
    const m = mails.filter((x) => x.subject.includes('Đã hoàn tiền'));
    expect(m).toHaveLength(1);
    expect(m[0].text).toContain('1.200.000');
    expect(m[0].text).toContain('7890');
    expect(m[0].text).toContain('Vietcombank');
    expect(m[0].text).toContain('abcd');
    expect(m[0].text).not.toContain(SEED_ACCOUNT.accountNumber);
  });
  it('payment_status: (i) hoàn hết -> refunded; (ii) một phần -> partially_refunded; (iii) rejected sau nhận -> vẫn paid; refunded -> not-returnable', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'received' });
    expect((await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'CK-0001' }, A.cookie)).status).toBe(200);
    expect(await payOf(F.R.R1.id)).toBe('refunded');
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { kind: 'return_refunded' } });
    expect([ev.paymentStatus, ev.toStatus]).toEqual(['refunded', 'completed']);
    const again = await createReturnReq(F.M.cookie, F.R.R1.code, { lines: [{ variantId: F.v1, quantity: 1 }], reason: 'not-fit', conditionAck: true, bank: 'VCB', accountNumber: '1234567890', accountName: 'A B' });
    expect(again.body.error.code).toBe('not-returnable');
    const b = await insertReturn({ orderId: F.R.R5.id, state: 'received', reason: 'defective', lines: [{ variantId: F.v3, quantity: 3, accepted: 2 }] });
    expect((await act(b.id, 'refund', { amount: b.amount, refundReference: 'CK-0002' }, A.cookie)).status).toBe(200);
    expect(await payOf(F.R.R5.id)).toBe('partially_refunded');
    const c = await insertReturn({ orderId: F.R.R2.id, state: 'approved', reason: 'not-fit' });
    expect((await act(c.id, 'receive', { lines: [{ variantId: F.v1, acceptedQuantity: 0 }], note: 'Không đạt yêu cầu' })).body.state).toBe('rejected');
    expect(await payOf(F.R.R2.id)).toBe('paid');
  });
  it('bất biến bị phá giữa giao dịch -> unavailable và rollback (yêu cầu vẫn received)', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'received' });
    await prisma.order.update({ where: { order_id: F.R.R1.id }, data: { paymentStatus: 'pending' } });
    const r = await act(a.id, 'refund', { amount: 1_200_000, refundReference: 'CK-0003' }, A.cookie);
    expect([r.status, r.body.error.code]).toEqual([500, 'unavailable']);
    expect(await stateOf(a.id)).toBe('received');
    expect(await evCount('return_refunded')).toBe(0);
  });
});

describe('T-RET-38 AC-RET-39: đua giữa nhân viên', () => {
  it('20 lần: S1 duyệt đồng thời S2 từ chối -> sự kiện khớp số 200; refund A1 / A2 -> 1 x 200 + 1 x 409; sự kiện đúng 1 lần', async () => {
    const S1 = await loginStaff('ret-race-s1@nine2fine.test');
    const S2 = await loginStaff('ret-race-s2@nine2fine.test');
    const A1 = await loginAdmin('ret-race-a1@nine2fine.test');
    const A2 = await loginAdmin('ret-race-a2@nine2fine.test');
    const p = (await prisma.productVariant.findFirstOrThrow({ where: { sku: 'RET-V3' } })).variant_id;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      resetCheckoutRateLimits();
      const o = await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), userId: F.M.user.user_id, lines: [{ variantId: p, quantity: 1, unitPrice: 100_000 }] });
      const a = await insertReturn({ orderId: o.id, state: 'requested', reason: 'not-fit' });
      const [x, y] = await Promise.all([act(a.id, 'approve', {}, S1.cookie), act(a.id, 'reject', { note: 'Không đủ điều kiện' }, S2.cookie)]);
      // duyệt rồi từ chối đều hợp lệ nên [200, 200] cũng đúng; khi từ chối thắng trước thì duyệt phải 409. Bất biến: sự kiện = số 200, trạng thái cuối khớp.
      const wins = [x, y].filter((r) => r.status === 200).length;
      expect(wins).toBeGreaterThanOrEqual(1);
      for (const r of [x, y]) if (r.status !== 200) expect([r.status, r.body.error.code, !!r.body.error.currentReturnState]).toEqual([409, 'invalid-transition', true]);
      total += wins;
      expect((await evCount('return_approved')) + (await evCount('return_rejected'))).toBe(total);
      if (x.status === 200 && y.status === 200) expect(await stateOf(a.id)).toBe('rejected');
      const b = await insertReturn({ orderId: (await insertRevenueOrder({ deliveredAt: vnAt(D, -3, '10:00'), userId: F.M.user.user_id, lines: [{ variantId: p, quantity: 1, unitPrice: 100_000 }] })).id, state: 'received', reason: 'not-fit' });
      const [r1, r2] = await Promise.all([1, 2].map((k) => act(b.id, 'refund', { amount: b.amount, refundReference: `CK-RACE-${i}-${k}` }, k === 1 ? A1.cookie : A2.cookie)));
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect(await evCount('return_refunded')).toBe(i + 1);
    }
    await flushMail();
    expect(mails.filter((m) => m.subject.includes('Đã hoàn tiền'))).toHaveLength(20);
  });
  it('thao tác 422 không để lại gì (không sự kiện, không đổi trạng thái)', async () => {
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'requested' });
    await act(a.id, 'approve', { note: 'x'.repeat(300) });
    await act(a.id, 'reject', {});
    expect(await prisma.orderEvent.count()).toBe(0);
    expect(await stateOf(a.id)).toBe('requested');
  });
});

describe('T-RET-39 / 41 AC-RET-17, 40, 41: số tài khoản không lộ; log; thư', () => {
  it('luồng đủ: tạo -> duyệt -> nhận -> hoàn; số đầy đủ chỉ admin ở received; không có trong sự kiện / idempotency / thư / log; mỗi bước đúng 1 sự kiện', async () => {
    const logs: string[] = [];
    process.env.LOG_IN_TEST = '1';
    const spies = (['log', 'warn', 'error', 'info'] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' '))));
    try {
      const p = await uploadMyPhoto(F.M.cookie, makeReturnPhoto(), 'image/jpeg');
      const c = await createReturnReq(F.M.cookie, F.R.R1.code, {
        lines: [{ variantId: F.v1, quantity: 2 }, { variantId: F.v2, quantity: 1 }], reason: 'defective', detail: 'Chi tiết lỗi rất riêng tư XYZ123', photos: [p.body.id],
        bank: ACCT.bank, accountNumber: ACCT.number, accountName: 'Nguyen Van A',
      });
      expect(c.status).toBe(201);
      const id = c.body.id as string;
      const seeFull = async (cookie: string) => (await aGet(`/returns/${id}`, cookie)).body.refundTo.accountNumber;
      expect(await seeFull(A.cookie)).toBe(SEED_ACCOUNT.accountNumber);
      expect(await seeFull(S.cookie)).toBeUndefined();
      await act(id, 'approve', { note: 'Ghi mã đơn lên hộp, ghi chú-ABC' });
      expect(await seeFull(A.cookie)).toBe(SEED_ACCOUNT.accountNumber);
      expect((await receiveAll(id)).status).toBe(200);
      expect(await seeFull(A.cookie)).toBe(SEED_ACCOUNT.accountNumber);
      expect(await seeFull(S.cookie)).toBeUndefined();
      expect((await act(id, 'refund', { amount: 1_200_000, refundReference: 'MA-GD-SECRET-77' }, A.cookie)).status).toBe(200);
      expect(await seeFull(A.cookie)).toBeUndefined();
      await flushMail();

      for (const k of ['return_requested', 'return_approved', 'return_received', 'return_refunded']) expect(await evCount(k)).toBe(1);
      const dump = JSON.stringify([
        await prisma.orderEvent.findMany(), await prisma.idempotencyKey.findMany(), mails, await prisma.inventoryAdjustment.findMany(),
        (await aGet(`/audit-log?from=${D}&to=${D}&limit=50`, A.cookie)).body,
      ]);
      expect(dump).not.toContain(SEED_ACCOUNT.accountNumber);
      expect(mails.map((m) => m.subject).sort()).toEqual([
        `nine2fine – Yêu cầu trả hàng đơn #${F.R.R1.code} đã được duyệt`,
        `nine2fine – Đã hoàn tiền đơn #${F.R.R1.code}`,
        `nine2fine – Đã nhận yêu cầu trả hàng đơn #${F.R.R1.code}`,
        `nine2fine – Đã nhận hàng trả đơn #${F.R.R1.code}`,
      ].sort());
      expect(mails.some((m) => m.text.includes(SEED_ACCOUNT.accountNumber))).toBe(false);
      const row = await prisma.orderReturn.findUniqueOrThrow({ where: { return_id: id } });
      expect([row.accountNumberEnc, row.accountLast4, row.bankName]).toEqual([null, '7890', 'Vietcombank']);
      const output = logs.join('\n');
      for (const secret of [SEED_ACCOUNT.accountNumber, 'Vietcombank', 'XYZ123', 'ghi chú-ABC', 'MA-GD-SECRET-77', 'NGUYEN VAN A', process.env.RETURN_ACCOUNT_KEY!]) {
        expect(output, secret).not.toContain(secret);
      }
    } finally {
      for (const s of spies) s.mockRestore();
      delete process.env.LOG_IN_TEST;
    }
  });
});

describe('T-RET-40 AC-RET-41: thư', () => {
  it('4 thư tiêu đề đúng, hotline từ cài đặt, đến email đơn', async () => {
    const c = await createReturnReq(F.M.cookie, F.R.R1.code, { lines: [{ variantId: F.v1, quantity: 2 }, { variantId: F.v2, quantity: 1 }], reason: 'not-fit', conditionAck: true, bank: 'VCB', accountNumber: '1234567890', accountName: 'A B' });
    await act(c.body.id, 'approve', { note: 'Gửi trong 7 ngày' });
    await flushMail();
    const rej = await insertReturn({ orderId: F.R.R2.id, state: 'requested', reason: 'not-fit' });
    await act(rej.id, 'reject', { note: 'Hàng đã qua sử dụng' });
    const rec = await insertReturn({ orderId: F.R.R5.id, state: 'received', reason: 'defective' });
    await act(rec.id, 'refund', { amount: rec.amount, refundReference: 'CK-MAIL-1' }, A.cookie);
    await flushMail();
    const subjects = mails.map((m) => m.subject).sort();
    expect(subjects).toEqual([
      `nine2fine – Đã hoàn tiền đơn #${F.R.R5.code}`,
      `nine2fine – Đã nhận yêu cầu trả hàng đơn #${F.R.R1.code}`,
      `nine2fine – Yêu cầu trả hàng đơn #${F.R.R1.code} đã được duyệt`,
      `nine2fine – Yêu cầu trả hàng đơn #${F.R.R2.code} không được chấp nhận`,
    ].sort());
    for (const m of mails) {
      expect(m.to).toBe('khach@example.com');
      expect(m.text).toContain('1900 6868 29');
    }
    const rejected = mails.find((m) => m.subject.includes('không được chấp nhận'))!;
    expect(rejected.text).toContain('Hàng đã qua sử dụng');
  });
  it('SMTP lỗi ở bước duyệt: vẫn approved, email_attempts tăng; thử lại thành công không trùng', async () => {
    setEmailRetryDelays([0, 0, 0]);
    let calls = 0;
    setMailTransport({ async send(m) { if (++calls === 1) throw new Error('smtp down'); mails.push(m); } });
    const a = await insertReturn({ orderId: F.R.R1.id, state: 'requested' });
    expect((await act(a.id, 'approve', {})).status).toBe(200);
    await flushMail();
    expect(await stateOf(a.id)).toBe('approved');
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { kind: 'return_approved' } });
    expect(ev.emailAttempts).toBe(2);
    expect(ev.emailSentAt).not.toBeNull();
    expect(mails.filter((m) => m.subject.includes('đã được duyệt'))).toHaveLength(1);
  });
});

describe('ảnh phía admin (AC-RET-15)', () => {
  it('S / A xem ảnh đã gắn đúng byte; ảnh chưa gắn 404; không phiên 401; url admin', async () => {
    const img = makeReturnPhoto(500, 500);
    const up = await uploadMyPhoto(F.M.cookie, img, 'image/jpeg');
    const free = await uploadMyPhoto(F.M.cookie, img, 'image/jpeg');
    const c = await createReturnReq(F.M.cookie, F.R.R1.code, {
      lines: [{ variantId: F.v1, quantity: 1 }], reason: 'wrong-size', detail: 'Giao sai kích cỡ rồi', photos: [up.body.id], bank: 'VCB', accountNumber: '1234567890', accountName: 'A B',
    });
    expect(c.status).toBe(201);
    const d = await aGet(`/returns/${c.body.id}`, S.cookie);
    expect(d.body.photos[0].url).toBe(`/api/admin/return-photos/${up.body.id}`);
    for (const cookie of [S.cookie, A.cookie]) {
      const r = await get(`/api/admin/return-photos/${up.body.id}`, { cookie, ip: freshIp() });
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('private, no-store');
    }
    expect((await get(`/api/admin/return-photos/${free.body.id}`, { cookie: S.cookie, ip: freshIp() })).status).toBe(404);
    expect((await get(`/api/admin/return-photos/${up.body.id}`, { ip: freshIp() })).status).toBe(401);
    expect((await get(`/api/admin/return-photos/${up.body.id}`, { cookie: F.M.cookie, ip: freshIp() })).status).toBe(401);
    expect((await post(`/api/admin/return-photos/${up.body.id}`, {}, { cookie: S.cookie, ip: freshIp() })).status).toBe(404);
  });
});
