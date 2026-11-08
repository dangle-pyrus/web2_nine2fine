import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, createUser, flushMail, freshIp, get, lastCode, loginAdmin, loginMember, loginStaff, makeOrder, mails, post, prisma,
  put, del, resetCheckout, resetState, vid, orderBody, submitOrder,
} from './helpers';
import { insertOrderEvent } from '../src/modules/order/order-event';
import { callStatsOf, computeAllowedActions, maxInWindow } from '../src/modules/order-admin/order-state';
import { escapeLike } from '../src/modules/order-admin/order-admin.query';
import { vnDayRange } from '../src/lib/vn-time';

let top: string;
let blazer: string;

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
});

const HOUR = 3600_000;
const snapshot = async (code: string) => {
  const o = await prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } });
  return JSON.stringify({ ...o, events: o.events.length });
};

describe('T-ADM-01 không phiên admin -> 401, no-store, không lộ dữ liệu (AC-ADM-01)', () => {
  it('không cookie / n2f_sid / n2f_asid thu hồi / hết hạn đều 401 unauthenticated', async () => {
    const { code } = await makeOrder();
    const m = await loginMember('tv@example.com');
    const staff = await loginStaff();
    await prisma.session.updateMany({ where: { audience: 'admin' }, data: { revoked_at: new Date() } });
    for (const cookie of [undefined, m.cookie, staff.cookie]) {
      for (const r of [
        await adminGet('', cookie),
        await adminGet('/counts', cookie),
        await adminGet(`/${code}`, cookie),
        await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'unreachable' }, cookie),
        await adminPost(`/${code}/ship`, { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: 'GHTK-1' }, cookie),
      ]) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
        expect(r.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(r.body)).not.toContain(code);
      }
    }
    // hết hạn
    const s2 = await loginStaff();
    await prisma.session.updateMany({ where: { audience: 'admin' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await adminGet('', s2.cookie)).status).toBe(401);
    expect((await prisma.order.findUniqueOrThrow({ where: { code } })).status).toBe('to_ship');
  });

  it('phản hồi hợp lệ, 404 và 422 cũng có Cache-Control: no-store', async () => {
    const staff = await loginStaff();
    for (const r of [await adminGet('', staff.cookie), await adminGet('/N2F0000000000', staff.cookie), await adminGet('?limit=0', staff.cookie)]) {
      expect(r.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('T-ADM-02 phân quyền theo hành động (AC-ADM-02)', () => {
  it('staff huỷ lý do other -> 403 forbidden, trước cả 404 / 422; đơn và sự kiện không đổi', async () => {
    const staff = await loginStaff();
    const { code } = await makeOrder();
    const before = await snapshot(code);
    const r = await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'other', note: 'lệch kho' }, staff.cookie);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('forbidden');
    expect((await adminPost('/N2F0000000000/cancel', { reason: 'other' }, staff.cookie)).status).toBe(403);
    expect((await adminPost(`/${code}/cancel`, { reason: 'other' }, staff.cookie)).status).toBe(403); // thiếu expectedStatus vẫn 403 trước
    expect(await snapshot(code)).toBe(before);
  });

  it('admin không bị chặn bởi cổng quyền (thực thi huỷ thuộc lát 4.3)', async () => {
    const admin = await loginAdmin();
    const { code } = await makeOrder();
    const r = await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'other', note: 'lệch kho' }, admin.cookie);
    expect(r.status).not.toBe(403);
  });

  it('allowedActions: staff không có cancel-other, admin có (T-ADM-04)', async () => {
    const staff = await loginStaff();
    const admin = await loginAdmin();
    const { code } = await makeOrder({ status: 'to_ship', needsCall: false });
    const s = await adminGet(`/${code}`, staff.cookie);
    const a = await adminGet(`/${code}`, admin.cookie);
    expect(s.body.allowedActions).not.toContain('cancel-other');
    expect(a.body.allowedActions).toContain('cancel-other');
    expect(s.body.allowedActions).toContain('cancel-customer-request');
  });
});

describe('T-ADM-03 vai trò đọc lại mỗi yêu cầu (AC-ADM-03)', () => {
  it('hạ admin -> staff bằng SQL: hành động chỉ admin 403, GET vẫn 200; is_active=false -> 401', async () => {
    const admin = await loginAdmin('doi.vai.tro@nine2fine.test');
    const { code } = await makeOrder();
    expect((await adminGet('', admin.cookie)).status).toBe(200);
    expect((await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'other', note: 'lệch kho' }, admin.cookie)).status).not.toBe(403);
    const before = await snapshot(code);
    await prisma.$executeRaw`UPDATE users SET role = 'staff' WHERE user_id = ${admin.user.user_id}::uuid`;
    const r = await adminPost(`/${code}/cancel`, { expectedStatus: 'to_ship', reason: 'other', note: 'lệch kho' }, admin.cookie);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('forbidden');
    expect((await adminGet('', admin.cookie)).status).toBe(200);
    expect((await adminGet(`/${code}`, admin.cookie)).body.allowedActions).not.toContain('cancel-other');
    expect(await snapshot(code)).toBe(before);

    await prisma.$executeRaw`UPDATE users SET is_active = false WHERE user_id = ${admin.user.user_id}::uuid`;
    const gone = await adminGet('', admin.cookie);
    expect(gone.status).toBe(401);
    expect(gone.body.error.code).toBe('unauthenticated');
    expect(JSON.stringify(gone.body)).not.toContain(code);
  });
});

describe('T-ADM-04 allowedActions theo trạng thái / điều kiện (AC-ADM-04, 09)', () => {
  it('đơn cần gọi: gọi / xác nhận / huỷ; chưa đủ 3 lần thì chưa có cancel-unreachable; không có ship', async () => {
    const admin = await loginAdmin();
    const { code, id } = await makeOrder({ status: 'to_ship', needsCall: true });
    let d = (await adminGet(`/${code}`, admin.cookie)).body;
    expect(d.needsCall).toBe(true);
    expect(d.tab).toBe('to-confirm');
    expect(d.allowedActions).toEqual(['call-attempt', 'confirm', 'cancel-declined-on-call', 'cancel-customer-request', 'cancel-other', 'add-note', 'print-slip']);
    const t0 = Date.now() - 3 * HOUR;
    for (const i of [0, 1, 2]) {
      await prisma.$executeRaw`INSERT INTO order_events (order_id, at, from_status, to_status, payment_status, actor, kind, actor_name, actor_role, actor_user_id)
        VALUES (${id}::uuid, ${new Date(t0 + i * HOUR)}::timestamptz AT TIME ZONE 'UTC', 'to_ship', 'to_ship', 'pending', 'shop', 'call_attempt', 'Trần Lan', 'staff', NULL)`;
      d = (await adminGet(`/${code}`, admin.cookie)).body;
      expect(d.allowedActions.includes('cancel-unreachable')).toBe(i === 2);
    }
    expect(d.callAttempts).toMatchObject({ total: 3, inFirstDay: 3 });
  });

  it('đơn không cần gọi / đã xác nhận: ship; to_receive: deliver + 2 lý do; completed / cancelled / to_pay: chỉ xem + ghi chú', async () => {
    const staff = await loginStaff();
    const get1 = async (o: Parameters<typeof makeOrder>[0]) => (await adminGet(`/${(await makeOrder(o)).code}`, staff.cookie)).body.allowedActions;
    expect(await get1({ status: 'to_ship', needsCall: false })).toEqual(['ship', 'cancel-customer-request', 'add-note', 'print-slip']);
    expect(await get1({ status: 'to_ship', needsCall: true, data: { confirmedAt: new Date() } })).toContain('ship');
    expect(await get1({ status: 'to_receive', data: { carrier: 'GHTK', trackingNumber: 'GHTK-1', activeTrackingNumber: 'GHTK-1', handedOverAt: new Date() } })).toEqual([
      'deliver', 'cancel-refused', 'cancel-undeliverable', 'add-note', 'print-slip',
    ]);
    expect(await get1({ status: 'completed' })).toEqual(['add-note']);
    expect(await get1({ status: 'to_pay' })).toEqual(['add-note']);
    expect(await get1({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'customer' } })).toEqual(['add-note']);
    expect(await get1({ status: 'cancel_requested', data: { cancelRequestedAt: new Date() } })).toEqual(['approve-cancel', 'reject-cancel', 'add-note']);
    expect(
      await get1({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'shop', returnedFromTransit: true } }),
    ).toEqual(['restock', 'write-off', 'add-note']);
  });

  it('đơn thanh toán chuyển khoản to_ship không cần gọi -> to-fulfil', async () => {
    const staff = await loginStaff();
    const o = await makeOrder({ status: 'to_ship', paymentMethod: 'bank_transfer', needsCall: true });
    const d = (await adminGet(`/${o.code}`, staff.cookie)).body;
    expect(d.tab).toBe('to-fulfil');
    expect(d.needsCall).toBe(false);
  });
});

describe('máy trạng thái thuần (đơn vị)', () => {
  it('cửa sổ 24 giờ bất kỳ, biên <= 24 giờ 00 phút', () => {
    const t = Date.parse('2026-11-08T00:00:00Z');
    const win = 24 * HOUR;
    expect(maxInWindow([t, t + 12 * HOUR, t + 24 * HOUR], win)).toBe(3);
    expect(maxInWindow([t, t + 12 * HOUR, t + 24 * HOUR + 60_000], win)).toBe(2);
    expect(maxInWindow([t, t + 23 * HOUR, t + 25 * HOUR], win)).toBe(2);
    expect(maxInWindow([t, t + 30 * HOUR, t + 31 * HOUR, t + 32 * HOUR], win)).toBe(3);
    expect(callStatsOf([]).inFirstDay).toBe(0);
    const stats = callStatsOf([new Date(t), new Date(t + HOUR)]);
    expect(stats).toMatchObject({ total: 2, inFirstDay: 2 });
    const order = { status: 'to_ship', paymentMethod: 'cod', needsConfirmCall: true, confirmedAt: null, returnedFromTransit: false, returnHandledAt: null, stockRestoredAt: null } as const;
    expect(computeAllowedActions(order, 'staff', stats)).not.toContain('cancel-unreachable');
  });

  it('vnDayRange: ngày VN bao gồm cả hai đầu', () => {
    const r = vnDayRange('2026-11-08', '2026-11-08');
    expect(r.gte!.toISOString()).toBe('2026-11-07T17:00:00.000Z');
    expect(r.lt!.toISOString()).toBe('2026-11-08T17:00:00.000Z');
    expect(escapeLike('a%b_c\\')).toBe('a\\%b\\_c\\\\');
  });
});

describe('T-ADM-05 phân trang (AC-ADM-05)', () => {
  it('45 đơn: mặc định 20, page=3 = 5, page=9 rỗng total 45; limit 0 / 51 -> 422 field limit; có page + limit', async () => {
    const staff = await loginStaff();
    const base = Date.parse('2026-11-01T00:00:00Z');
    for (let i = 0; i < 45; i++) await makeOrder({ status: 'to_ship', createdAt: new Date(base + i * 60_000) });
    const p1 = await adminGet('', staff.cookie);
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 45, page: 1, limit: 20 });
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body).not.toHaveProperty('pageSize');
    expect(new Date(p1.body.items[0].placedAt).getTime()).toBeGreaterThan(new Date(p1.body.items[19].placedAt).getTime());
    expect((await adminGet('?page=3', staff.cookie)).body.items).toHaveLength(5);
    const far = await adminGet('?page=9', staff.cookie);
    expect(far.body).toMatchObject({ items: [], total: 45, page: 9 });
    for (const bad of ['?limit=0', '?limit=51', '?limit=abc']) {
      const r = await adminGet(bad, staff.cookie);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'limit' });
    }
    expect((await adminGet('?page=0', staff.cookie)).body.error.field).toBe('page');
    expect((await adminGet('?view=nope', staff.cookie)).body.error.field).toBe('view');
    expect((await adminGet('?limit=50', staff.cookie)).body.limit).toBe(50);
  });
});

describe('T-ADM-06 tìm kiếm q (AC-ADM-06)', () => {
  it('mã, #, tiền tố, SĐT, +84, 4 số, email hoa, tên không dấu, %, 101 ký tự, rỗng', async () => {
    const staff = await loginStaff();
    const a = await makeOrder({ phone: '0912345678', email: 'lan.nguyen@example.com', name: 'Nguyễn Thị Lan', createdAt: new Date('2026-11-02T00:00:00Z') });
    const b = await makeOrder({ phone: '0987654321', email: 'binh@example.com', name: 'Trần Văn Bình', createdAt: new Date('2026-11-03T00:00:00Z') });
    const ids = async (q: string) => ((await adminGet(`?q=${encodeURIComponent(q)}`, staff.cookie)).body.items as Array<{ id: string }>).map((i) => i.id);
    expect(await ids(a.code)).toEqual([a.code]);
    expect(await ids(`#${a.code.toLowerCase()}`)).toEqual([a.code]);
    expect(await ids(a.code.slice(0, 8))).toEqual([b.code, a.code]); // 6+ ký tự: tiền tố chung 8
    expect(await ids(a.code.slice(0, 13))).toEqual([a.code]);
    expect(await ids('0912345678')).toEqual([a.code]);
    expect(await ids('+84912345678')).toEqual([a.code]);
    expect(await ids('84 912 345 678')).toEqual([a.code]);
    expect(await ids('5678')).toEqual([a.code]);
    expect(await ids('4321')).toEqual([b.code]);
    expect(await ids('LAN.NGUYEN@EXAMPLE.COM')).toEqual([a.code]);
    expect(await ids('nguyen thi lan')).toEqual([a.code]);
    expect(await ids('BÌNH')).toEqual([b.code]);
    expect(await ids('tran van binh')).toEqual([b.code]);
    expect(await ids('%')).toEqual([]);
    expect(await ids('_')).toEqual([]);
    expect(await ids('   ')).toHaveLength(2);
    const long = await adminGet(`?q=${'a'.repeat(101)}`, staff.cookie);
    expect(long.status).toBe(422);
    expect(long.body.error).toMatchObject({ code: 'validation', field: 'q' });
    expect((await adminGet(`?q=${'a'.repeat(100)}`, staff.cookie)).status).toBe(200);
  });
});

describe('T-ADM-07 counts khớp danh sách (AC-ADM-07)', () => {
  it('đủ 8 tab, tổng = all, khớp list từng tab; có bộ lọc vẫn khớp', async () => {
    const staff = await loginStaff();
    const past = new Date(Date.now() - 24 * HOUR);
    const mk = (o: Parameters<typeof makeOrder>[0]) => makeOrder({ createdAt: past, ...o });
    await mk({ status: 'to_pay' });
    await mk({ status: 'to_ship', needsCall: true });
    await mk({ status: 'to_ship', needsCall: true });
    await mk({ status: 'to_ship', needsCall: false, phone: '0987000111' });
    await mk({ status: 'to_ship', needsCall: true, data: { confirmedAt: new Date() } });
    await mk({ status: 'to_receive', data: { carrier: 'GHTK', trackingNumber: 'GHTK-9', activeTrackingNumber: 'GHTK-9', handedOverAt: new Date() } });
    await mk({ status: 'cancel_requested', data: { cancelRequestedAt: new Date() } });
    await mk({ status: 'completed', data: { deliveredAt: new Date() } });
    await mk({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'customer' } });
    await mk({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'shop', returnedFromTransit: true } });
    await mk({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'shop', returnedFromTransit: true, returnHandledAt: new Date(), returnDecision: 'written_off', returnNote: 'hư hỏng nặng' } });
    const check = async (qs: string, expectAll: number) => {
      const c = (await adminGet(`/counts${qs}`, staff.cookie)).body as Record<string, number>;
      const { all, ...tabs } = c;
      expect(Object.keys(tabs).sort()).toEqual(['cancel-requests', 'cancelled', 'completed', 'in-transit', 'pending-payment', 'returning', 'to-confirm', 'to-fulfil']);
      expect(Object.values(tabs).reduce((a, b) => a + b, 0)).toBe(all);
      expect(all).toBe(expectAll);
      for (const view of Object.keys(tabs)) {
        const l = await adminGet(`?view=${view}&limit=50${qs ? `&${qs.slice(1)}` : ''}`, staff.cookie);
        expect(l.body.total, view).toBe(tabs[view]);
        expect(l.body.items.every((i: { tab: string }) => i.tab === view)).toBe(true);
      }
      expect((await adminGet(`?limit=50${qs ? `&${qs.slice(1)}` : ''}`, staff.cookie)).body.total).toBe(all);
      return tabs;
    };
    const tabs = await check('', 11);
    expect(tabs).toMatchObject({ 'pending-payment': 1, 'to-confirm': 2, 'to-fulfil': 2, 'in-transit': 1, 'cancel-requests': 1, returning: 1, completed: 1, cancelled: 2 });
    await check('?payment=cod', 10);
    await check('?payment=bank-transfer', 1);
    await check('?q=0987000111', 1);
    expect((await adminGet('/counts?from=2026-12-31&to=2026-01-01', staff.cookie)).status).toBe(422);
  });

  it('xác nhận bằng SQL: to-confirm giảm 1, to-fulfil tăng 1', async () => {
    const staff = await loginStaff();
    const o = await makeOrder({ status: 'to_ship', needsCall: true });
    const before = (await adminGet('/counts', staff.cookie)).body;
    await prisma.order.update({ where: { code: o.code }, data: { confirmedAt: new Date() } });
    const after = (await adminGet('/counts', staff.cookie)).body;
    expect(after['to-confirm']).toBe(before['to-confirm'] - 1);
    expect(after['to-fulfil']).toBe(before['to-fulfil'] + 1);
    expect(after.all).toBe(before.all);
  });
});

describe('T-ADM-08 lọc ngày GMT+7, payment, kết hợp (AC-ADM-08)', () => {
  it('biên 00:30 ngày 08 (17:30Z hôm trước) vào ngày 08; 23:59 ngày 07 thì không', async () => {
    const staff = await loginStaff();
    const edge = await makeOrder({ createdAt: new Date('2026-11-07T17:30:00Z') }); // 00:30 ngày 08 VN
    const prev = await makeOrder({ createdAt: new Date('2026-11-07T16:59:00Z') }); // 23:59 ngày 07 VN
    const last = await makeOrder({ createdAt: new Date('2026-11-08T16:59:00Z'), paymentMethod: 'bank_transfer', status: 'to_pay' }); // 23:59 ngày 08 VN
    const ids = async (qs: string) => ((await adminGet(`?${qs}`, staff.cookie)).body.items as Array<{ id: string }>).map((i) => i.id).sort();
    expect(await ids('from=2026-11-08&to=2026-11-08')).toEqual([edge.code, last.code].sort());
    expect(await ids('from=2026-11-07&to=2026-11-07')).toEqual([prev.code]);
    expect(await ids('from=2026-11-08')).toEqual([edge.code, last.code].sort());
    expect(await ids('to=2026-11-07')).toEqual([prev.code]);
    expect(await ids('from=2026-11-08&to=2026-11-08&payment=bank-transfer')).toEqual([last.code]);
    expect(await ids('from=2026-11-08&to=2026-11-08&payment=bank-transfer&view=to-fulfil')).toEqual([]);
    expect(await ids('payment=cod&view=to-confirm&q=0912')).toEqual([prev.code, edge.code].sort());
    const bad = await adminGet('?from=2026-11-09&to=2026-11-08', staff.cookie);
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'from' });
    expect((await adminGet('?from=2026-13-40', staff.cookie)).body.error.field).toBe('from');
    expect((await adminGet('?payment=card', staff.cookie)).body.error.field).toBe('payment');
  });
});

describe('T-ADM-09 chi tiết (AC-ADM-09)', () => {
  it('đủ trường, SĐT + email đầy đủ cho staff, mã #/hoa thường, mã lạ 404', async () => {
    const staff = await loginStaff();
    const { code } = await makeOrder({ status: 'to_ship', needsCall: true, items: [{ variantId: top, quantity: 2 }, { variantId: blazer, quantity: 1 }] });
    const r = await adminGet(`/${code}`, staff.cookie);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: code, status: 'to_ship', paymentMethod: 'cod', paymentStatus: 'pending', tab: 'to-confirm', needsCall: true,
      recipient: { name: 'Nguyễn Văn A', phone: '0912345678', email: 'khach@example.com' },
      shippingAddress: { street: '12 Phố Huế', ward: 'Ba Đình', province: 'Hà Nội' },
      estimatedDelivery: { from: '2026-11-11', to: '2026-11-13' },
      callAttempts: { total: 0, inFirstDay: 0 },
      overdue: [],
    });
    expect(r.body.items).toHaveLength(2);
    expect(r.body.pricing.total).toBeGreaterThan(0);
    expect(r.body).not.toHaveProperty('confirmation');
    expect(r.body).not.toHaveProperty('shipment');
    expect(r.body).not.toHaveProperty('userId');
    expect((await adminGet(`/%23${code.toLowerCase()}`, staff.cookie)).body.id).toBe(code);
    expect((await adminGet(`/${code.toLowerCase()}`, staff.cookie)).status).toBe(200);
    for (const bad of ['/N2F0000000000', '/abc', '/N2F123']) expect((await adminGet(bad, staff.cookie)).status).toBe(404);
  });

  it('đơn có xác nhận, bàn giao, huỷ, yêu cầu huỷ, hàng hoàn: các khối đủ trường, người = ảnh chụp ở sự kiện', async () => {
    const admin = await loginAdmin();
    const emp = await createUser({ email: 'nv@nine2fine.test', role: 'staff', firstName: 'Lan', lastName: 'Trần Thị' });
    const at = new Date('2026-11-08T03:00:00Z');
    const { code, id } = await makeOrder({
      status: 'cancelled',
      data: {
        confirmedAt: at, confirmedBy: emp.user_id, carrier: 'GHTK', trackingNumber: 'GHTK-12345', handedOverAt: at, handedOverBy: emp.user_id,
        cancelledAt: at, cancelledBy: 'shop', cancelReason: 'Đơn không được nhận khi giao hàng.', cancelReasonCode: 'refused', cancelNote: 'khách vắng',
        deliveryRefusedAt: at, returnedFromTransit: true, cancelRequestedAt: at, cancelRequestOutcome: 'rejected', cancelRequestDecidedAt: at,
        cancelRequestDecidedBy: emp.user_id, cancelRequestRejectReason: 'Đơn đã giao cho vận chuyển.',
      },
    });
    await insertOrderEventTx(id, 'confirmed', emp, at);
    await insertOrderEventTx(id, 'shipped', emp, new Date(at.getTime() + 1000));
    await prisma.user.update({ where: { user_id: emp.user_id }, data: { firstName: 'Đổi Tên' } }); // snapshot không đổi
    const d = (await adminGet(`/${code}`, admin.cookie)).body;
    expect(d.confirmation).toEqual({ confirmedAt: at.toISOString(), confirmedBy: { name: 'Trần Thị Lan', role: 'staff' } });
    expect(d.shipment).toEqual({ carrier: 'GHTK', trackingNumber: 'GHTK-12345', handedOverAt: at.toISOString(), handedOverBy: { name: 'Trần Thị Lan', role: 'staff' } });
    expect(d.cancellation).toEqual({ by: 'shop', at: at.toISOString(), reasonCode: 'refused', reason: 'Đơn không được nhận khi giao hàng.', note: 'khách vắng' });
    expect(d.cancelRequest).toMatchObject({ outcome: 'rejected', rejectReason: 'Đơn đã giao cho vận chuyển.', decidedBy: { role: 'staff' } });
    expect(d.returnHandling).toEqual({ state: 'pending' });
    expect(d.deliveryRefusedAt).toBe(at.toISOString());
    expect(d.tab).toBe('returning');
    expect(JSON.stringify(d)).not.toContain(emp.user_id);
    expect(JSON.stringify(d)).not.toContain('nv@nine2fine.test');
  });
});

async function insertOrderEventTx(
  orderId: string,
  kind: 'confirmed' | 'shipped' | 'call_attempt' | 'note',
  emp: { user_id: string },
  at: Date,
  extra: { internalNote?: string; detail?: string; role?: 'staff' | 'admin'; name?: string } = {},
) {
  await prisma.$transaction((tx) =>
    insertOrderEvent(tx, {
      orderId, at, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind,
      detail: extra.detail ?? null, internalNote: extra.internalNote ?? null,
      actorUser: { id: emp.user_id, name: extra.name ?? 'Trần Thị Lan', role: extra.role ?? 'staff' },
    }),
  );
}

describe('T-ADM-10 timeline admin (AC-ADM-10)', () => {
  it('mới nhất trước; đặt hàng = Khách; staff = tên + vai trò; PUT / DELETE -> 404; không có route sửa / xoá sự kiện', async () => {
    const staff = await loginStaff();
    const admin = await loginAdmin();
    const { code, id } = await makeOrder({ createdAt: new Date('2026-11-08T01:00:00Z') });
    await insertOrderEventTx(id, 'call_attempt', staff.user, new Date('2026-11-08T02:00:00Z'), { internalNote: 'Máy bận' });
    await insertOrderEventTx(id, 'note', admin.user, new Date('2026-11-08T03:00:00Z'), { internalNote: 'Khách dặn gọi chiều', role: 'admin', name: 'Quản Trị' });
    const d = (await adminGet(`/${code}`, admin.cookie)).body;
    expect(d.timeline.map((t: { kind: string }) => t.kind)).toEqual(['note', 'call_attempt', 'placed']);
    expect(d.timeline[0]).toMatchObject({ actor: { type: 'staff', name: 'Quản Trị', role: 'admin' }, note: 'Khách dặn gọi chiều', title: 'Ghi chú nội bộ', fromStatus: 'to_ship', toStatus: 'to_ship' });
    expect(d.timeline[1]).toMatchObject({ actor: { type: 'staff', name: 'Trần Thị Lan', role: 'staff' }, note: 'Máy bận' });
    expect(d.timeline[2]).toMatchObject({ kind: 'placed', actor: { type: 'customer' }, fromStatus: null, toStatus: 'to_ship' });
    expect(d.timeline[2].actor).not.toHaveProperty('name');
    const before = await prisma.orderEvent.count();
    const ck = { cookie: admin.cookie, ip: freshIp() };
    for (const r of [
      await put(`/api/admin/orders/${code}`, {}, ck),
      await del(`/api/admin/orders/${code}`, ck),
      await put(`/api/admin/orders/${code}/events/1`, {}, ck),
      await del(`/api/admin/orders/${code}/events/1`, ck),
    ]) {
      expect(r.status).toBe(404);
    }
    expect(await prisma.orderEvent.count()).toBe(before);
  });

  it('đơn Slice 3 (sự kiện cũ, kind NULL): hiện Khách / Hệ thống đúng theo actor, suy ra loại (AC-ADM-45)', async () => {
    const staff = await loginStaff();
    const { code, id } = await makeOrder({ status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'system', cancelReason: 'Hết thời gian thanh toán' } });
    await prisma.orderEvent.updateMany({ where: { orderId: id }, data: { kind: null } });
    await prisma.orderEvent.create({ data: { orderId: id, at: new Date(Date.now() + 1000), fromStatus: 'to_pay', toStatus: 'cancelled', paymentStatus: 'pending', actor: 'system', detail: 'Hết thời gian thanh toán' } });
    const d = (await adminGet(`/${code}`, staff.cookie)).body;
    expect(d.timeline.map((t: { kind: string; actor: { type: string } }) => [t.kind, t.actor.type])).toEqual([['cancelled', 'system'], ['placed', 'customer']]);
    expect(d.timeline[0].detail).toBe('Hết thời gian thanh toán');
  });
});

describe('T-ADM-12 DTO khách không lộ nhân viên (AC-ADM-12, 41)', () => {
  const GUEST = 'khach.moi@example.com';
  async function setup() {
    const staff = await loginStaff('nv.bi.mat@nine2fine.test', { firstName: 'BíMật', lastName: 'Nhân Viên' });
    const placed = await submitOrder(await orderBody([{ variantId: top, quantity: 1 }], { email: GUEST }));
    expect(placed.status).toBe(201);
    await flushMail();
    const code = placed.body.order.id as string;
    const o = await prisma.order.findUniqueOrThrow({ where: { code } });
    const t = (n: number) => new Date(Date.now() + n * 1000);
    await insertOrderEventTx(o.order_id, 'call_attempt', staff.user, t(1), { internalNote: 'GHI-CHU-NOI-BO-GOI' });
    await insertOrderEventTx(o.order_id, 'confirmed', staff.user, t(2));
    await insertOrderEventTx(o.order_id, 'note', staff.user, t(3), { internalNote: 'GHI-CHU-NOI-BO-NOTE' });
    await prisma.$transaction((tx) =>
      insertOrderEvent(tx, {
        orderId: o.order_id, at: t(4), fromStatus: 'to_ship', toStatus: 'to_receive', paymentStatus: 'pending', actor: 'shop', kind: 'shipped',
        detail: 'GHTK - GHTK-12345', actorUser: { id: staff.user.user_id, name: 'Nhân Viên BíMật', role: 'staff' }, internalNote: 'GHI-CHU-NOI-BO-SHIP',
      }),
    );
    await prisma.order.update({
      where: { code },
      data: {
        status: 'to_receive', carrier: 'GHTK', trackingNumber: 'GHTK-12345', activeTrackingNumber: 'GHTK-12345', handedOverAt: t(4),
        handedOverBy: staff.user.user_id, confirmedAt: t(2), confirmedBy: staff.user.user_id, cancelNote: 'CANCEL-NOTE-NOI-BO',
      },
    });
    return { code, staff };
  }
  const forbidden = (staff: { user: { user_id: string } }) => ['nv.bi.mat', 'BíMật', 'Nhân Viên', staff.user.user_id, 'GHI-CHU-NOI-BO', 'CANCEL-NOTE', 'call_attempt', 'actorName', 'actor_user'];

  it('thành viên xem đơn: đặt hàng + đang vận chuyển (đơn vị + mã), không lần gọi / ghi chú / tên nhân viên', async () => {
    const m = await loginMember('chu.don@example.com');
    const { code, staff } = await setup();
    await prisma.order.update({ where: { code }, data: { userId: m.user.user_id } });
    const r = await get(`/api/orders/${code}`, { cookie: m.cookie, ip: freshIp() });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('to_receive');
    expect(r.body.timeline.map((t: { title: string }) => t.title)).toEqual(['Đã đặt hàng', 'Đang vận chuyển']);
    expect(r.body.timeline[0]).toMatchObject({ actor: 'customer' });
    expect(r.body.timeline[1]).toMatchObject({ actor: 'nine2fine', detail: 'GHTK - GHTK-12345' });
    expect(r.body.shipment).toMatchObject({ carrier: 'GHTK', trackingNumber: 'GHTK-12345' });
    expect(r.body.canCancel).toBe(false);
    const text = JSON.stringify(r.body);
    for (const w of forbidden(staff)) expect(text).not.toContain(w);
    expect(text).not.toMatch(/"(userId|confirmedBy|handedOverBy)"/);
  });

  it('khách tra cứu bằng OTP: cùng kết quả, không lộ', async () => {
    const { code, staff } = await setup();
    mails.length = 0;
    expect((await post('/api/orders/lookup/codes', { orderCode: code, email: GUEST }, { ip: freshIp() })).status).toBe(200);
    await flushMail();
    const otp = lastCode(GUEST)!;
    const r = await post('/api/orders/lookup/verify', { orderCode: code, email: GUEST, code: otp }, { ip: freshIp() });
    expect(r.status).toBe(200);
    expect(r.body.timeline.map((t: { actor: string }) => t.actor)).toEqual(['customer', 'nine2fine']);
    const text = JSON.stringify(r.body);
    for (const w of forbidden(staff)) expect(text).not.toContain(w);
  });

  it('đơn Slice 3 đã huỷ: timeline Khách / Hệ thống = customer / nine2fine; huỷ do shop -> nine2fine', async () => {
    const m = await loginMember('c2@example.com');
    const { code } = await makeOrder({ userId: m.user.user_id, status: 'cancelled', data: { cancelledAt: new Date(), cancelledBy: 'customer', cancelReason: 'Đổi ý' } });
    const o = await prisma.order.findUniqueOrThrow({ where: { code } });
    await prisma.orderEvent.create({ data: { orderId: o.order_id, at: new Date(Date.now() + 1000), fromStatus: 'to_ship', toStatus: 'cancelled', paymentStatus: 'pending', actor: 'customer', detail: 'Đổi ý' } });
    const r = await get(`/api/orders/${code}`, { cookie: m.cookie, ip: freshIp() });
    expect(r.body.timeline.map((t: { actor: string }) => t.actor)).toEqual(['customer', 'customer']);
    expect(r.body.cancelMode).toBeUndefined();
    expect(r.body.canCancel).toBe(false);
  });
});

describe('T-ADM-45 / T-ADM-90 schema', () => {
  it('migration chỉ cộng thêm: không DROP / TRUNCATE / DELETE / RENAME / đổi kiểu cột', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(path.resolve(__dirname, '../prisma/migrations/20261108000100_admin_orders_schema/migration.sql'), 'utf8');
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '');
    expect(stripped).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
    expect(stripped).not.toMatch(/ALTER COLUMN/i);
  });

  it('các bảng đơn hàng / checkout còn bật RLS (migration không tắt)', async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
        AND c.relname IN ('orders','order_items','order_events','idempotency_keys','order_access_grants','vouchers','voucher_redemptions','store_settings')`;
    expect(rows).toEqual([]);
  });

  const bad = async (data: Record<string, unknown>, status: 'to_ship' | 'to_receive' | 'cancel_requested' | 'completed' | 'cancelled' = 'to_ship') => {
    const { code } = await makeOrder({ status: 'to_ship' });
    return prisma.order.update({ where: { code }, data: { status, ...data } }).then(
      () => 'ok',
      (e: Error) => (/chk_orders_\w+|Unique constraint/.exec(e.message)?.[0] ?? e.message.slice(0, 80)),
    );
  };

  it('CHECK / UNIQUE mới chặn dữ liệu sai', async () => {
    expect(await bad({}, 'cancel_requested')).toBe('chk_orders_cancel_requested');
    expect(await bad({ deliveredAt: new Date() })).toBe('chk_orders_delivered');
    expect(await bad({ carrier: 'GHTK' })).toBe('chk_orders_shipment');
    expect(await bad({ carrier: 'GHTK', trackingNumber: 'ab c!', handedOverAt: new Date() }, 'to_receive')).toBe('chk_orders_tracking_format');
    expect(await bad({ carrier: 'GHTK', trackingNumber: 'GHTK-1', activeTrackingNumber: 'KHAC-1', handedOverAt: new Date() }, 'to_receive')).toBe('chk_orders_active_tracking');
    expect(await bad({ confirmedBy: (await createUser({ email: 'u1@nine2fine.test', role: 'staff' })).user_id })).toBe('chk_orders_confirmed');
    expect(await bad({ cancelReasonCode: 'refused' })).toBe('chk_orders_cancel_reason_code');
    expect(await bad({ returnedFromTransit: true })).toBe('chk_orders_returned_transit');
    expect(await bad({ returnDecision: 'restocked' }, 'cancelled')).toMatch(/chk_orders_(cancelled|return_pair)/);
    expect(await bad({ deliveryRefusedAt: new Date() })).toBe('chk_orders_delivery_refused');
    expect(await bad({ cancelRequestOutcome: 'maybe', cancelRequestedAt: new Date() })).toBe('chk_orders_cancel_request_outcome');
  });

  it('mã vận đơn trùng đơn chưa huỷ bị chặn; huỷ rồi (active = NULL) thì dùng lại được', async () => {
    const ship = { status: 'to_receive' as const, data: { carrier: 'GHTK', trackingNumber: 'GHTK-777', activeTrackingNumber: 'GHTK-777', handedOverAt: new Date() } };
    const a = await makeOrder(ship);
    await expect(makeOrder(ship)).rejects.toThrow(/Unique constraint/);
    await prisma.order.update({ where: { code: a.code }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'shop', activeTrackingNumber: null } });
    await makeOrder(ship);
    expect(await prisma.order.count({ where: { trackingNumber: 'GHTK-777' } })).toBe(2);
  });

  it('order_events: actor_user_id chỉ khi actor = shop; email_attempts 0..3', async () => {
    const u = await createUser({ email: 'u2@nine2fine.test', role: 'staff' });
    const { id } = await makeOrder();
    await expect(
      prisma.orderEvent.create({ data: { orderId: id, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'customer', actorUserId: u.user_id } }),
    ).rejects.toThrow(/chk_order_events_actor_user/);
    await expect(
      prisma.orderEvent.create({ data: { orderId: id, fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', emailAttempts: 4 } }),
    ).rejects.toThrow(/chk_order_events_email_attempts/);
  });

  it('xoá nhân viên: sự kiện giữ tên + vai trò đã chụp, user_id về NULL', async () => {
    const emp = await createUser({ email: 'roi.di@nine2fine.test', role: 'staff', firstName: 'Mai', lastName: 'Lê' });
    const admin = await loginAdmin();
    const { code, id } = await makeOrder();
    await insertOrderEventTx(id, 'note', emp, new Date(), { internalNote: 'x', name: 'Lê Mai' });
    await prisma.user.delete({ where: { user_id: emp.user_id } });
    const d = (await adminGet(`/${code}`, admin.cookie)).body;
    expect(d.timeline[0].actor).toEqual({ type: 'staff', name: 'Lê Mai', role: 'staff' });
  });
});

describe('T-ADM-42 bảng mã lỗi lát 4.1', () => {
  it('3 mã mới có HTTP 409 và phần mở rộng currentStatus / order qua errorHandler', async () => {
    const { Errors } = await import('../src/lib/errors');
    expect(Errors.invalidTransition('completed').status).toBe(409);
    expect(Errors.orderStateChanged({ id: 'x' }, 'to_receive')).toMatchObject({ status: 409, code: 'order-state-changed', extras: { currentStatus: 'to_receive', order: { id: 'x' } } });
    expect(Errors.conditionNotMet('m', 'to_ship')).toMatchObject({ status: 409, code: 'condition-not-met' });
  });

  it('origin sai ở POST -> 403 origin-not-allowed; GET admin không cần X-Requested-With', async () => {
    const staff = await loginStaff();
    const { code } = await makeOrder();
    const r = await post(`/api/admin/orders/${code}/confirm`, { expectedStatus: 'to_ship' }, { cookie: staff.cookie, origin: 'http://evil.example', ip: freshIp() });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('origin-not-allowed');
    expect((await adminGet('', staff.cookie)).status).toBe(200);
  });
});

describe('T-ADM-49 giới hạn tần suất theo tài khoản (BR-ADM-41)', () => {
  it('121 GET / 60 giây -> 429 + Retry-After; tài khoản khác không bị ảnh hưởng; 401 không đốt bộ đếm', async () => {
    const a = await loginStaff();
    const b = await loginStaff();
    const ip = '198.51.100.7'; // cùng IP: bộ đếm theo tài khoản nên không chung
    const g = (cookie: string) => get('/api/admin/orders/counts', { cookie, ip });
    for (let i = 0; i < 120; i++) expect((await g(a.cookie)).status).toBe(200);
    const over = await g(a.cookie);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate-limited');
    expect(Number(over.headers['retry-after'])).toBe(over.body.error.retryAfterSeconds);
    expect((await g(b.cookie)).status).toBe(200);
    expect((await get('/api/admin/orders/counts', { ip })).status).toBe(401);
  }, 60_000);
});
