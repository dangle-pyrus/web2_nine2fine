import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, flushMail, freshIp, get, loginAdmin, loginMember, loginStaff, makeOrder, mails, post, prisma, resetCheckout, resetState,
} from './helpers';
import { setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { autoCompleteDelivered } from '../src/modules/order/receive-order.service';

/** Đợt sửa theo feedback BR (2026-11-14): ORD-11 / COMMON-01.9, COMMON-01.5, COMMON-02.4, ADM-ORD-01 / 18. */
beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
});

const DAY = 24 * 3600_000;
let tn = 0;
const transit = (handedOverAt: Date) => {
  const code = `GHN-FB${String(++tn).padStart(4, '0')}`;
  return { carrier: 'GHN', trackingNumber: code, activeTrackingNumber: code, handedOverAt };
};
const cancelled = { cancelledAt: new Date(), cancelledBy: 'shop', cancelReasonCode: 'declined_on_call' };

describe('ORD-11 / COMMON-01.9: Đã nhận hàng + tự hoàn thành sau 7 ngày', () => {
  it('khách bấm "Đã nhận hàng": to_receive -> completed, COD paid, có delivered_at; lần hai 409', async () => {
    const m = await loginMember('nhan@example.com');
    const o = await makeOrder({ status: 'to_receive', userId: m.user.user_id, data: transit(new Date(Date.now() - DAY)) });
    const before = await get(`/api/orders/${o.code}`, { cookie: m.cookie, ip: freshIp() });
    expect(before.body.canConfirmReceived).toBe(true);
    const r = await post(`/api/orders/${o.code}/received`, {}, { cookie: m.cookie, ip: freshIp() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'completed', paymentStatus: 'paid', canConfirmReceived: false });
    const row = await prisma.order.findUniqueOrThrow({ where: { code: o.code } });
    expect(row.deliveredAt).not.toBeNull();
    const again = await post(`/api/orders/${o.code}/received`, {}, { cookie: m.cookie, ip: freshIp() });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('invalid-transition');
  });

  it('đơn của người khác -> 404; không phiên -> 401', async () => {
    const owner = await loginMember('chu@example.com');
    const other = await loginMember('khac@example.com');
    const o = await makeOrder({ status: 'to_receive', userId: owner.user.user_id, data: transit(new Date()) });
    expect((await post(`/api/orders/${o.code}/received`, {}, { cookie: other.cookie, ip: freshIp() })).status).toBe(404);
    expect((await post(`/api/orders/${o.code}/received`, {}, { ip: freshIp() })).status).toBe(401);
  });

  it('việc nền: bàn giao quá 7 ngày -> completed (actor system, có thư); chưa đủ 7 ngày giữ nguyên; chạy lại không đổi gì', async () => {
    const late = await makeOrder({ status: 'to_receive', data: transit(new Date(Date.now() - 7 * DAY - 60_000)) });
    const fresh = await makeOrder({ status: 'to_receive', data: transit(new Date(Date.now() - 6 * DAY)) });
    expect(await autoCompleteDelivered()).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: late.code } })).status).toBe('completed');
    expect((await prisma.order.findUniqueOrThrow({ where: { code: fresh.code } })).status).toBe('to_receive');
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: late.id, kind: 'delivered' } });
    expect(ev.actor).toBe('system');
    await flushMail();
    expect(mails.some((x) => x.to === 'khach@example.com')).toBe(true);
    expect(await autoCompleteDelivered()).toBe(0);
  });
});

describe('COMMON-01.5 / ORD-CC-02: lý do huỷ bắt buộc khi gửi yêu cầu huỷ', () => {
  it('to_ship không lý do -> 422 reasonCode; "Lý do khác" thiếu ghi chú -> 422; có mã -> cancel_requested kèm câu lý do', async () => {
    const m = await loginMember('lydo@example.com');
    const o = await makeOrder({ status: 'to_ship', userId: m.user.user_id, needsCall: false });
    const none = await post(`/api/orders/${o.code}/cancel`, {}, { cookie: m.cookie, ip: freshIp() });
    expect(none.status).toBe(422);
    expect(none.body.error.field).toBe('reasonCode');
    const other = await post(`/api/orders/${o.code}/cancel`, { reasonCode: 'other' }, { cookie: m.cookie, ip: freshIp() });
    expect(other.status).toBe(422);
    expect(other.body.error.field).toBe('reason');
    const ok = await post(`/api/orders/${o.code}/cancel`, { reasonCode: 'slow_delivery', reason: 'Cần gấp' }, { cookie: m.cookie, ip: freshIp() });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('cancel_requested');
    const req = await prisma.order.findUniqueOrThrow({ where: { code: o.code } });
    expect(JSON.stringify(req)).toContain('Thời gian giao hàng dự kiến quá lâu');
  });
});

describe('COMMON-02.4: admin xác nhận đã hoàn tiền đơn huỷ đã thanh toán', () => {
  it('staff 403; admin -> refunded + sự kiện; đơn chưa thanh toán -> 409', async () => {
    const a = await loginAdmin();
    const s = await loginStaff();
    const paid = await makeOrder({ status: 'cancelled', paymentMethod: 'bank_transfer', data: { ...cancelled, paymentStatus: 'paid', paidAt: new Date() } });
    const detail = await adminGet(`/${paid.code}`, a.cookie);
    expect(detail.body.allowedActions).toContain('confirm-refund');
    expect((await adminGet(`/${paid.code}`, s.cookie)).body.allowedActions).not.toContain('confirm-refund');
    const body = { expectedStatus: 'cancelled', reference: 'FT2611140001' };
    expect((await adminPost(`/${paid.code}/refund-confirmed`, body, s.cookie)).status).toBe(403);
    const r = await adminPost(`/${paid.code}/refund-confirmed`, body, a.cookie);
    expect(r.status).toBe(200);
    expect(r.body.paymentStatus).toBe('refunded');
    expect(await prisma.orderEvent.count({ where: { orderId: paid.id, kind: 'refunded' } })).toBe(1);
    const unpaid = await makeOrder({ status: 'cancelled', data: cancelled });
    expect((await adminPost(`/${unpaid.code}/refund-confirmed`, body, a.cookie)).status).toBe(409);
  });
});

describe('ADM-ORD-01 / 18: sắp xếp và xuất CSV', () => {
  it('sort=total-asc đổi thứ tự; sort sai -> 422', async () => {
    const a = await loginAdmin();
    await makeOrder({ status: 'to_ship', items: [{ variantId: (await prisma.productVariant.findFirstOrThrow()).variant_id, quantity: 3 }] });
    await makeOrder({ status: 'to_ship' });
    const asc = (await adminGet('?sort=total-asc', a.cookie)).body.items.map((x: { total: number }) => x.total);
    expect(asc).toEqual([...asc].sort((x: number, y: number) => x - y));
    expect((await adminGet('?sort=hot', a.cookie)).status).toBe(422);
  });

  it('chỉ admin xuất; tên tệp don-hang-YYYY-MM-DD.csv, BOM, đúng số dòng theo codes', async () => {
    const a = await loginAdmin();
    const s = await loginStaff();
    const o1 = await makeOrder({ status: 'to_ship' });
    await makeOrder({ status: 'to_ship' });
    expect((await adminGet('/export', s.cookie)).status).toBe(403);
    const all = await adminGet('/export', a.cookie);
    expect(all.status).toBe(200);
    expect(all.headers['content-disposition']).toMatch(/^attachment; filename="don-hang-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(all.text.startsWith('﻿')).toBe(true);
    expect(all.text.trim().split('\r\n')).toHaveLength(3);
    const one = await adminGet(`/export?codes=${o1.code}`, a.cookie);
    expect(one.text.trim().split('\r\n')).toHaveLength(2);
    expect(one.text).toContain(o1.code);
  });
});
