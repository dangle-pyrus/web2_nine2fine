import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet, adminPost, flushMail, freshIp, get, loginAdmin, loginMember, loginStaff, makeOrder, mails, post, prisma, resetCheckout, resetState, useClock,
} from './helpers';
import { addWorkingHours } from '../src/lib/working-hours';
import { ADMIN_ASSUMPTIONS } from '../src/config/assumptions';

/** Lát 4.6 (Should): ghi chú nội bộ, cờ quá hạn, giới hạn tần suất ghi. T-ADM-46, 48, 49 <-> AC-ADM-46, 48, 49. */

beforeEach(async () => {
  vi.useRealTimers();
  await resetState();
  await resetCheckout();
});
afterEach(() => vi.useRealTimers());

const row = (code: string) => prisma.order.findUniqueOrThrow({ where: { code }, include: { events: true } });
const note = (code: string, body: unknown, cookie: string, headers?: Record<string, string>) => adminPost(`/${code}/notes`, body, cookie, headers);

describe('T-ADM-46 ghi chú nội bộ (AC-ADM-46, BR-ADM-38)', () => {
  it('500 ký tự -> 200: 1 sự kiện note, trạng thái không đổi, không cần expectedStatus, không email; 501 / rỗng -> 422 field note', async () => {
    const s = await loginStaff('ghichu.nv@nine2fine.test', { firstName: 'Lan', lastName: 'Đỗ' });
    const { code } = await makeOrder();
    const before = await row(code);
    const text = 'ơ'.repeat(500);
    const r = await note(code, { note: `  ${text}  ` }, s.cookie);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('to_ship');
    expect(r.body.timeline[0]).toMatchObject({ kind: 'note', note: text, actor: { type: 'staff', name: 'Đỗ Lan', role: 'staff' }, fromStatus: 'to_ship', toStatus: 'to_ship' });
    expect(r.body.allowedActions).toContain('add-note');
    const after = await row(code);
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.filter((e) => e.kind === 'note')).toHaveLength(1);
    expect({ ...after, events: 0 }).toEqual({ ...before, events: 0 });
    await flushMail();
    expect(mails).toHaveLength(0);

    for (const bad of ['x'.repeat(501), '', '   ', 7, undefined]) {
      const e = await note(code, { note: bad }, s.cookie);
      expect(e.status).toBe(422);
      expect(e.body.error).toMatchObject({ code: 'validation', field: 'note' });
    }
    expect((await row(code)).events).toHaveLength(before.events.length + 1);
    expect((await note('N2F2611099999', { note: 'a' }, s.cookie)).status).toBe(404);
    expect((await adminPost(`/${code}/notes`, { note: 'a' }, undefined)).status).toBe(401);
  });

  it('mọi trạng thái, staff và admin; Idempotency-Key phát lại không ghi thêm sự kiện', async () => {
    const s = await loginStaff();
    const a = await loginAdmin();
    for (const status of ['to_pay', 'to_ship', 'to_receive', 'completed', 'cancelled'] as const) {
      const { code } = await makeOrder({
        status,
        ...(status === 'to_receive' ? { data: { carrier: 'GHN', trackingNumber: 'GHN-9', activeTrackingNumber: 'GHN-9', handedOverAt: new Date() } } : {}),
        ...(status === 'completed' ? { data: { deliveredAt: new Date(), paymentStatus: 'paid', paidAt: new Date() } } : {}),
        ...(status === 'cancelled' ? { data: { cancelledAt: new Date(), cancelledBy: 'shop' } } : {}),
      });
      const r = await note(code, { note: `ghi chú ${status}` }, status === 'to_ship' ? a.cookie : s.cookie);
      expect(r.status, status).toBe(200);
      expect(r.body.status).toBe(status);
    }
    const { code } = await makeOrder();
    const key = { 'Idempotency-Key': 'note-intent-0000000001' };
    const r1 = await note(code, { note: 'một lần' }, s.cookie, key);
    const r2 = await note(code, { note: 'một lần' }, s.cookie, key);
    expect(r2.headers['idempotency-replayed']).toBe('true');
    expect(r2.body).toEqual(r1.body);
    expect((await row(code)).events.filter((e) => e.kind === 'note')).toHaveLength(1);
  });

  it('ghi chú không lộ cho khách: DTO đơn, tra cứu, email sau thao tác kế tiếp (AC-ADM-12 mở rộng)', async () => {
    const s = await loginStaff('ghichu2.nv@nine2fine.test', { firstName: 'Mai', lastName: 'Vũ' });
    const m = await loginMember('kh46@example.com');
    const { code } = await makeOrder({ userId: m.user.user_id, email: 'kh46@example.com', needsCall: false });
    const secret = 'BI-MAT-NOI-BO khach hay bom hang';
    expect((await note(code, { note: secret }, s.cookie)).status).toBe(200);
    const ship = await adminPost(`/${code}/ship`, { expectedStatus: 'to_ship', carrier: 'GHTK', trackingNumber: 'GHTK-4646' }, s.cookie);
    expect(ship.status).toBe(200);
    const dto = await get(`/api/orders/${code}`, { cookie: m.cookie, ip: freshIp() });
    expect(dto.status).toBe(200);
    expect(dto.body.timeline.map((t: { title: string }) => t.title)).toEqual(['Đã đặt hàng', 'Đang vận chuyển']);
    const json = JSON.stringify(dto.body);
    for (const leak of ['BI-MAT', 'bom hang', 'Vũ Mai', 'ghichu2.nv', s.user.user_id]) expect(json).not.toContain(leak);
    await flushMail();
    expect(mails.length).toBeGreaterThan(0);
    for (const mm of mails) expect(`${mm.subject}\n${mm.text}`).not.toContain('BI-MAT');
    // Admin vẫn thấy.
    const adm = await adminGet(`/${code}`, s.cookie);
    expect(JSON.stringify(adm.body.timeline)).toContain('BI-MAT-NOI-BO');
  });
});

describe('addWorkingHours (08:00-18:00, T2-T7, giờ VN)', () => {
  const cfg = ADMIN_ASSUMPTIONS.workHours;
  // Ngày mẫu: Thứ Hai 2026-11-09. VN = UTC+7.
  const vn = (iso: string) => new Date(`${iso}+07:00`);
  const at = (start: string, h: number) => addWorkingHours(vn(start), h, cfg).toISOString();
  it('trong giờ, qua 18:00, qua Chủ nhật, ngoài giờ', () => {
    expect(at('2026-11-09T09:00:00', 2)).toBe(vn('2026-11-09T11:00:00').toISOString());
    expect(at('2026-11-09T16:00:00', 2)).toBe(vn('2026-11-09T18:00:00').toISOString()); // đúng 18:00 giữ nguyên
    expect(at('2026-11-09T17:00:00', 2)).toBe(vn('2026-11-10T09:00:00').toISOString()); // dư sang hôm sau
    expect(at('2026-11-14T17:00:00', 2)).toBe(vn('2026-11-16T09:00:00').toISOString()); // T7 17:00 -> qua CN -> T2 09:00
    expect(at('2026-11-15T10:00:00', 2)).toBe(vn('2026-11-16T10:00:00').toISOString()); // CN: bắt đầu T2 08:00
    expect(at('2026-11-09T06:00:00', 2)).toBe(vn('2026-11-09T10:00:00').toISOString()); // trước giờ mở
    expect(at('2026-11-09T19:30:00', 2)).toBe(vn('2026-11-10T10:00:00').toISOString()); // sau giờ đóng
  });
});

describe('T-ADM-48 cờ quá hạn (AC-ADM-48, BR-ADM-40)', () => {
  // Phiên đăng nhập hết hạn khi đồng hồ giả nhảy xa: mỗi lần đọc đăng nhập lại theo đồng hồ hiện tại.
  const flags = async (code: string, _cookie?: string) => {
    const cookie = (await loginStaff()).cookie;
    const d = await adminGet(`/${code}`, cookie);
    const l = await adminGet(`?q=${code}`, cookie);
    expect(l.status, JSON.stringify(l.body)).toBe(200);
    expect(l.body.items).toHaveLength(1);
    expect(l.body.items[0].overdue, 'list khớp detail').toEqual(d.body.overdue);
    return d.body.overdue as string[];
  };

  it('cần gọi quá 2 giờ làm việc; qua Chủ nhật; trong hạn không cờ; đã xác nhận / đơn không cần gọi không cờ', async () => {
    const s = await loginStaff();
    const placed = new Date('2026-11-09T09:00:00+07:00'); // T2 09:00
    const { code } = await makeOrder({ createdAt: placed });
    useClock('2026-11-09T10:59:00+07:00');
    expect(await flags(code, s.cookie)).toEqual([]);
    useClock('2026-11-09T11:01:00+07:00');
    expect(await flags(code, s.cookie)).toEqual(['confirm-call']);

    const sat = await makeOrder({ createdAt: new Date('2026-11-14T17:00:00+07:00') }); // T7 17:00
    useClock('2026-11-15T12:00:00+07:00'); // CN: đồng hồ chưa chạy tiếp
    expect(await flags(sat.code, s.cookie)).toEqual([]);
    useClock('2026-11-16T08:30:00+07:00'); // T2 08:30: mới 1,5 giờ
    expect(await flags(sat.code, s.cookie)).toEqual([]);
    useClock('2026-11-16T09:05:00+07:00');
    expect(await flags(sat.code, s.cookie)).toEqual(['confirm-call']);

    const confirmed = await makeOrder({ createdAt: placed, data: { confirmedAt: new Date('2026-11-09T09:30:00+07:00') } });
    const noCall = await makeOrder({ createdAt: placed, needsCall: false });
    expect(await flags(confirmed.code, s.cookie)).toEqual([]);
    expect(await flags(noCall.code, s.cookie)).toEqual([]);
    // Chỉ là cờ: trạng thái không tự đổi.
    expect((await row(code)).status).toBe('to_ship');
  });

  it('cancel_requested quá 24 giờ; to_receive quá ngày giao dự kiến muộn nhất (ngày VN)', async () => {
    const s = await loginStaff();
    const now = new Date('2026-11-10T12:00:00+07:00');
    const fresh = await makeOrder({ status: 'cancel_requested', data: { cancelRequestedAt: new Date(now.getTime() - 23 * 3600_000) } });
    const stale = await makeOrder({ status: 'cancel_requested', data: { cancelRequestedAt: new Date(now.getTime() - 25 * 3600_000) } });
    // estimated_to của makeOrder = 2026-11-13
    const ship = { carrier: 'GHN', trackingNumber: 'GHN-4848', activeTrackingNumber: 'GHN-4848', handedOverAt: new Date('2026-11-10T08:00:00+07:00') };
    const transit = await makeOrder({ status: 'to_receive', data: ship });
    useClock(now.toISOString());
    expect(await flags(fresh.code, s.cookie)).toEqual([]);
    expect(await flags(stale.code, s.cookie)).toEqual(['cancel-request']);
    expect(await flags(transit.code, s.cookie)).toEqual([]);
    useClock('2026-11-13T23:30:00+07:00'); // vẫn trong ngày 13
    expect(await flags(transit.code, s.cookie)).toEqual([]);
    useClock('2026-11-14T00:30:00+07:00');
    expect(await flags(transit.code, s.cookie)).toEqual(['delivery']);
    expect((await row(transit.code)).status).toBe('to_receive');
    // Đơn đã giao không còn cờ.
    const done = await makeOrder({ status: 'completed', data: { deliveredAt: new Date(), paymentStatus: 'paid', paidAt: new Date() } });
    expect(await flags(done.code, s.cookie)).toEqual([]);
  });
});

describe('T-ADM-49 giới hạn tần suất ghi (AC-ADM-49, BR-ADM-41)', () => {
  it('61 POST / 60 giây -> 429 + retryAfterSeconds; tài khoản khác không ảnh hưởng; GET dùng bộ đếm riêng', async () => {
    const a = await loginStaff();
    const b = await loginStaff();
    const { code } = await makeOrder();
    const ip = '198.51.100.9';
    const w = (cookie: string, n: number) => post(`/api/admin/orders/${code}/notes`, { note: `n${n}` }, { cookie, ip });
    for (let i = 0; i < 60; i++) expect((await w(a.cookie, i)).status).toBe(200);
    const over = await w(a.cookie, 61);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate-limited');
    expect(over.body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(over.headers['retry-after'])).toBe(over.body.error.retryAfterSeconds);
    expect((await w(b.cookie, 1)).status).toBe(200);
    expect((await get(`/api/admin/orders/${code}`, { cookie: a.cookie, ip })).status).toBe(200);
    expect((await row(code)).events.filter((e) => e.kind === 'note')).toHaveLength(61);
  }, 60_000);

  it('thao tác bình thường: xác nhận 20 đơn liên tiếp không chạm giới hạn', async () => {
    const s = await loginStaff();
    for (let i = 0; i < 20; i++) {
      const { code } = await makeOrder();
      expect((await adminPost(`/${code}/confirm`, { expectedStatus: 'to_ship' }, s.cookie)).status).toBe(200);
    }
  }, 60_000);
});
