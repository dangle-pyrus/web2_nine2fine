import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { listAudit } from '../src/modules/insights-admin/audit.query';
import { parseAuditQuery } from '../src/modules/insights-admin/insights.schemas';
import {
  assertNoSecrets, call, freshIp, iGet, iPut, loginAdmin, loginStaff, makeMember, makeOrder, makeProduct, newKey, resetCheckout, resetState, resetStoreSettings,
  uPost, uPut, useClock, vnAt,
} from './helpers';

/** Lát 8.5 (Nhật ký hợp nhất, Should): T-AUD-01..06. D = 2026-11-12 VN, 15:00 VN. */

const D = '2026-11-12';
const NOW = '2026-11-12T08:00:00Z';
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-a@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-a@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(async () => {
  resetCheckoutRateLimits();
  await clearAudit();
  await resetStoreSettings();
  useClock(NOW);
});

const clearAudit = () =>
  prisma.$executeRawUnsafe('TRUNCATE TABLE "order_items", "order_events", "orders", "inventory_adjustments", "account_events", "store_settings_events" RESTART IDENTITY CASCADE');
const audit = (qs = '', cookie = admin.cookie) => iGet(`/audit-log${qs ? `?${qs}` : ''}`, cookie);

let variantSeq = 0;
async function product() {
  const p = await makeProduct({ name: 'Áo nhật ký', status: 'ACTIVE', variants: [{ sku: `AUD8-${++variantSeq}`, qty: 20 }] });
  return { id: p.id, variantId: p.variants[0].id, sku: p.variants[0].sku };
}

/** Điều chỉnh tồn trực tiếp ở DB (tải dữ liệu nhật ký): `at` do bên gọi chọn. */
async function adjustAt(variantId: string, at: Date, n = 1, actor = staff.user): Promise<void> {
  await prisma.inventoryAdjustment.createMany({
    data: Array.from({ length: n }, () => ({
      variantId, at, delta: 1, availableAfter: 21, reason: 'received', note: 'lô', actorUserId: actor.user_id, actorName: 'Trần Lan', actorRole: actor.role as 'staff',
    })),
  });
}

describe('T-AUD-01 AC-AUD-01: bốn nguồn hợp nhất', () => {
  it('S xác nhận đơn + điều chỉnh tồn, A khoá khách + tạo nhân viên + đổi cài đặt, sự kiện khách / hệ thống bị loại: đúng 5 dòng đủ trường', async () => {
    const p = await product();
    const member = await makeMember({ firstName: 'Mai', lastName: 'Lê' });
    const { id: orderId, code } = await makeOrder({ status: 'to_ship' }); // kèm sự kiện `placed` của khách (phải bị loại)
    await prisma.orderEvent.createMany({
      data: [
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind: 'confirmed', actorUserId: staff.user.user_id, actorName: 'Trần Lan', actorRole: 'staff', reasonCode: 'unreachable', internalNote: 'BÍ MẬT nội dung cuộc gọi', detail: 'chi tiết cuộc gọi riêng tư' },
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'cancelled', paymentStatus: 'pending', actor: 'system', kind: 'cancelled', detail: 'hết hạn thanh toán' },
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'customer', kind: 'cancel_requested', detail: 'khách yêu cầu' },
      ],
    });
    const adj = await uPost(`/inventory/${p.variantId}/adjustments`, { mode: 'delta', quantity: 5, reason: 'received', note: 'Nhập lô mới' }, staff.cookie, { 'Idempotency-Key': newKey() });
    expect(adj.status, JSON.stringify(adj.body)).toBe(200);
    expect((await uPost(`/customers/${member.user_id}/lock`, { reason: 'Hoàn hàng gian lận' }, admin.cookie)).status).toBe(200);
    const created = await uPost('/staff', { name: 'Nhân Viên Mới', email: 'nv-moi-a@nine2fine.test', role: 'staff' }, admin.cookie, { 'Idempotency-Key': newKey() });
    expect(created.status).toBe(201);
    const g = (await iGet('/settings/store', admin.cookie)).body;
    const { hotlineHref: _h, ...info } = g.info;
    expect((await iPut('/settings/store', { updatedAt: g.updatedAt, info: { ...info, hotline: '0909 111 222' }, operations: g.operations }, admin.cookie)).status).toBe(200);

    const r = await audit();
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/no-store/);
    expect(r.body).toMatchObject({ total: 5, page: 1, limit: 20 });
    const items = r.body.items as Array<Record<string, any>>;
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.action.code).sort()).toEqual(['account.locked', 'account.staff-created', 'inventory.adjusted', 'order.confirmed', 'settings.updated']);
    for (const i of items) {
      expect(i.id).toMatch(/^(order|inventory|account|settings):[0-9a-f-]{36}$/);
      expect(i.at).toMatch(/Z$/);
      expect(i.actor).toEqual({ id: expect.any(String), name: expect.any(String), role: expect.stringMatching(/^(staff|admin)$/) });
      expect(i.action.label).toEqual(expect.any(String));
      expect(['order', 'inventory', 'customer', 'staff', 'settings']).toContain(i.target.type);
    }
    const by = Object.fromEntries(items.map((i) => [i.action.code, i]));
    expect(by['order.confirmed']).toMatchObject({ actor: { id: staff.user.user_id, name: 'Trần Lan', role: 'staff' }, target: { type: 'order', id: code, label: `#${code}` }, reason: 'unreachable' });
    expect(by['inventory.adjusted']).toMatchObject({
      actor: { name: 'Trần Lan', role: 'staff' }, target: { type: 'inventory', id: p.variantId, label: `${p.sku} - Áo nhật ký` }, reason: 'Nhập lô mới',
      action: { label: 'Điều chỉnh tồn kho +5 (Nhập hàng)' },
    });
    expect(by['account.locked']).toMatchObject({ actor: { role: 'admin' }, target: { type: 'customer', id: member.user_id, label: expect.stringContaining('Mai') }, reason: 'Hoàn hàng gian lận' });
    expect(by['account.locked']).not.toHaveProperty('roleBefore');
    expect(by['account.staff-created']).toMatchObject({ target: { type: 'staff', label: 'Nhân Viên Mới' }, roleAfter: 'staff' });
    expect(by['account.staff-created']).not.toHaveProperty('roleBefore');
    expect(by['settings.updated']).toMatchObject({ target: { type: 'settings', id: 'store', label: 'Cài đặt cửa hàng' }, actor: { name: 'Trị Quản', role: 'admin' } });
    expect(by['settings.updated'].changes).toEqual([{ field: 'info.hotline', label: 'Hotline', before: '1900 6868 29', after: '0909 111 222' }]);
    // mở màn không tạo dòng nào
    expect((await audit()).body.total).toBe(5);
    assertNoSecrets(r);
  });

  it('dòng đổi vai trò có roleBefore / roleAfter; bộ lọc customer / staff theo vai trò bị tác động', async () => {
    const target = await uPost('/staff', { name: 'Nhân Viên Hai', email: 'nv-hai-a@nine2fine.test', role: 'staff' }, admin.cookie, { 'Idempotency-Key': newKey() });
    expect(target.status).toBe(201);
    const id = target.body.id ?? target.body.staff?.id ?? target.body.user?.id;
    expect(id).toBeTruthy();
    const role = await uPut(`/staff/${id}/role`, { role: 'admin', reason: 'Mở rộng quyền' }, admin.cookie);
    expect(role.status, JSON.stringify(role.body)).toBe(200);
    const member = await makeMember();
    await uPost(`/customers/${member.user_id}/lock`, { reason: 'Gian lận thanh toán' }, admin.cookie);
    const all = (await audit()).body;
    const changed = all.items.find((i: { action: { code: string } }) => i.action.code === 'account.role-changed');
    expect(changed).toMatchObject({ roleBefore: 'staff', roleAfter: 'admin', reason: 'Mở rộng quyền', target: { type: 'staff' } });
    const staffRows = (await audit('targetType=staff')).body;
    expect(staffRows.items.map((i: { action: { code: string } }) => i.action.code).sort()).toEqual(['account.role-changed', 'account.staff-created']);
    const customerRows = (await audit('targetType=customer')).body;
    expect(customerRows.items.map((i: { action: { code: string } }) => i.action.code)).toEqual(['account.locked']);
    expect((await audit('targetType=settings')).body.total).toBe(0);
    expect((await audit('targetType=order')).body.total).toBe(0);
  });
});

describe('T-AUD-02 AC-AUD-01 (an toàn): không lộ ghi chú nội bộ / nội dung cuộc gọi', () => {
  it('internal_note, detail, IP, UA không xuất hiện; reason đơn chỉ là mã', async () => {
    const { id: orderId } = await makeOrder({ status: 'to_ship' });
    await prisma.orderEvent.createMany({
      data: [
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind: 'call_attempt', actorUserId: staff.user.user_id, actorName: 'Trần Lan', actorRole: 'staff', detail: 'KHÁCH NÓI SẼ CHUYỂN KHOẢN', internalNote: 'GHI CHÚ NỘI BỘ BÍ MẬT' },
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind: 'note', actorUserId: staff.user.user_id, actorName: 'Trần Lan', actorRole: 'staff', internalNote: 'NỘI DUNG GHI CHÚ RIÊNG TƯ' },
        { orderId, at: new Date(), fromStatus: 'to_ship', toStatus: 'cancelled', paymentStatus: 'pending', actor: 'shop', kind: 'cancelled', actorUserId: staff.user.user_id, actorName: 'Trần Lan', actorRole: 'staff', reasonCode: 'out-of-stock', detail: 'GIẢI THÍCH CHO KHÁCH', internalNote: 'lý do nội bộ' },
        { orderId, at: new Date(), fromStatus: null, toStatus: 'to_ship', paymentStatus: 'pending', actor: 'shop', kind: 'confirmed', detail: null }, // dữ liệu cũ thiếu người thao tác
      ],
    });
    const r = await audit('targetType=order');
    expect(r.body.total).toBe(4);
    for (const bad of ['BÍ MẬT', 'RIÊNG TƯ', 'KHÁCH NÓI', 'GIẢI THÍCH', 'lý do nội bộ', 'internal', 'detail', 'ip_address', 'user_agent', 'email_', 'ipAddress']) expect(r.text).not.toContain(bad);
    assertNoSecrets(r);
    const items = r.body.items as Array<Record<string, any>>;
    expect(items.map((i) => i.action.code).sort()).toEqual(['order.call-attempt', 'order.cancelled', 'order.confirmed', 'order.note-added']);
    expect(items.find((i) => i.action.code === 'order.cancelled')!.reason).toBe('out-of-stock');
    expect(items.find((i) => i.action.code === 'order.call-attempt')).not.toHaveProperty('reason');
    const legacy = items.find((i) => i.action.code === 'order.confirmed')!;
    expect(legacy.actor).toEqual({ id: null, name: 'Nhân viên', role: 'staff' });
  });
});

describe('T-AUD-03 AC-AUD-02: phân trang, khoảng, bộ lọc', () => {
  it('60 dòng trong 30 ngày + 5 dòng 100 ngày trước: trang đủ 20; limit 51 / 0 422; page=99 rỗng; 93 ngày 422; targetType lạ 422', async () => {
    const p = await product();
    for (let i = 0; i < 30; i++) await adjustAt(p.variantId, vnAt(D, -i, '10:00'), 2);
    await adjustAt(p.variantId, vnAt(D, -100, '10:00'), 5);
    const total = await prisma.inventoryAdjustment.count();
    expect(total).toBe(65);
    const pages = [await audit('page=1'), await audit('page=2'), await audit('page=3'), await audit('page=4')];
    expect(pages.map((x) => x.body.items.length)).toEqual([20, 20, 20, 0]);
    expect(pages.every((x) => x.body.total === 60)).toBe(true);
    const ids = pages.flatMap((x) => x.body.items.map((i: { id: string }) => i.id));
    expect(new Set(ids).size).toBe(60);
    const ats: string[] = pages.flatMap((x) => x.body.items.map((i: { at: string }) => i.at));
    expect([...ats].sort().reverse()).toEqual(ats); // mới trước
    expect(ats[0]).toBe(vnAt(D, 0, '10:00').toISOString());
    const past = await audit('page=99');
    expect(past.status).toBe(200);
    expect(past.body).toMatchObject({ items: [], total: 60, page: 99 });
    for (const limit of ['51', '0', 'abc']) {
      const r = await audit(`limit=${limit}`);
      expect(r.status).toBe(422);
      expect(r.body.error.field).toBe('limit');
    }
    expect((await audit('limit=50')).body.items).toHaveLength(50);
    expect((await audit('page=0')).body.error.field).toBe('page');
    const wide = await audit('from=2026-08-12&to=2026-11-12'); // 93 ngày
    expect(wide.status).toBe(422);
    expect(wide.body.error.field).toBe('to');
    const ok92 = await audit('from=2026-08-13&to=2026-11-12'); // đúng 92 ngày: 5 dòng D-100 vẫn ngoài
    expect(ok92.status).toBe(200);
    expect(ok92.body.total).toBe(60);
    const old = await audit('from=2026-08-01&to=2026-08-04');
    expect(old.body.total).toBe(5); // D-100 = 2026-08-04
    const bad = await audit('targetType=product');
    expect(bad.status).toBe(422);
    expect(bad.body.error.field).toBe('targetType');
    expect((await audit('from=2026-11-13&to=2026-11-12')).body.error.field).toBe('from');
    expect((await audit('from=2026-02-30')).body.error.field).toBe('from');
    expect((await audit('targetType=inventory')).body.total).toBe(60);
  });
});

describe('T-AUD-04 AC-AUD-03: thứ tự ổn định khi hoà thời điểm', () => {
  it('năm dòng cùng `at` (cả cùng micro-giây): thứ tự giống nhau qua nhiều lần gọi và qua ranh giới trang; không trùng / sót', async () => {
    const p = await product();
    const at = vnAt(D, 0, '09:00');
    await adjustAt(p.variantId, at, 5);
    const rows = await prisma.$queryRaw<Array<{ adjustment_id: string }>>`SELECT adjustment_id FROM inventory_adjustments`;
    const expected = rows.map((r) => `inventory:${r.adjustment_id}`).sort().reverse();
    const walk = async () => {
      const got: string[] = [];
      for (const page of [1, 2, 3]) got.push(...(await audit(`limit=2&page=${page}`)).body.items.map((i: { id: string }) => i.id));
      return got;
    };
    const first = await walk();
    expect(first).toEqual(expected);
    expect(await walk()).toEqual(first);
    expect(new Set(first).size).toBe(5);
    // hoà trộn nhiều nguồn cùng `at`: vẫn ổn định
    await prisma.$executeRawUnsafe(`INSERT INTO store_settings_events (at, actor_name, actor_role, changes) VALUES ('${at.toISOString()}', 'A', 'admin', '[{"field":"x"}]'::jsonb)`);
    const mixed = (await audit('limit=3&page=1')).body.items.map((i: { id: string }) => i.id).concat((await audit('limit=3&page=2')).body.items.map((i: { id: string }) => i.id));
    const all = (await audit('limit=50')).body.items.map((i: { id: string }) => i.id);
    expect(mixed).toEqual(all);
    expect([...all].sort().reverse()).toEqual(all);
  });
});

describe('T-AUD-05 AC-AUD-04: quyền, chỉ đọc, thao tác thất bại không có dòng', () => {
  it('S 403; A lọc inventory = số điều chỉnh trong khoảng; 403 / 409 / 422 không dòng; PUT / DELETE 404; mở màn không tạo dòng', async () => {
    const p = await product();
    await adjustAt(p.variantId, vnAt(D, -1, '10:00'), 3);
    await adjustAt(p.variantId, vnAt(D, -40, '10:00'), 2); // ngoài khoảng mặc định
    const s = await audit('', staff.cookie);
    expect(s.status).toBe(403);
    expect(s.body.error.code).toBe('forbidden');
    expect(s.headers['cache-control']).toMatch(/no-store/);
    expect((await audit('limit=999', staff.cookie)).status).toBe(403); // quyền trước Zod
    expect((await iGet('/audit-log')).status).toBe(401);
    const inv = await audit('targetType=inventory');
    expect(inv.body.total).toBe(3);
    const count = async () => (await prisma.inventoryAdjustment.count()) + (await prisma.accountEvent.count()) + (await prisma.storeSettingsEvent.count()) + (await prisma.orderEvent.count());
    const before = await count();
    // thao tác bị từ chối: staff đổi cài đặt (403), điều chỉnh sai (422), khoá khách bằng staff (403), mở màn nhiều lần
    expect((await iPut('/settings/store', {}, staff.cookie)).status).toBe(403);
    expect((await uPost(`/inventory/${p.variantId}/adjustments`, { mode: 'delta', quantity: 5, reason: 'damaged', note: '' }, staff.cookie, { 'Idempotency-Key': newKey() })).status).toBe(422);
    const m = await makeMember();
    expect((await uPost(`/customers/${m.user_id}/lock`, { reason: 'Lý do hợp lệ ở đây' }, staff.cookie)).status).toBe(403);
    expect((await iPut('/settings/store', { updatedAt: 'x' }, admin.cookie)).status).toBe(422);
    for (let i = 0; i < 3; i++) await audit();
    expect(await count()).toBe(before);
    for (const method of ['put', 'patch', 'delete', 'post'] as const) {
      const r = await call(method, '/api/admin/audit-log', method === 'delete' ? undefined : {}, { cookie: admin.cookie, ip: freshIp() });
      expect(r.status, method).toBe(404);
    }
    expect(await count()).toBe(before);
  });
});

describe('T-AUD-06 AC-AUD-02 (múi giờ): ranh giới ngày VN dưới nhiều múi giờ phiên', () => {
  it('dòng 16:59:59Z / 17:00:00Z: from=to theo giờ VN, cùng kết quả dưới 4 múi giờ', async () => {
    const p = await product();
    await adjustAt(p.variantId, new Date('2026-11-11T16:59:59.000Z'), 1);
    await adjustAt(p.variantId, new Date('2026-11-11T17:00:00.000Z'), 2);
    const q = (day: string) => parseAuditQuery({ from: day, to: day, targetType: 'inventory' }, new Date(NOW));
    const results: Record<string, unknown> = {};
    for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      results[tz] = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${tz}'`);
        const d11 = await listAudit(tx, q('2026-11-11'));
        const d12 = await listAudit(tx, q('2026-11-12'));
        return { d11: d11.items.map((i) => [i.id, i.at]), d12: d12.items.map((i) => [i.id, i.at]), totals: [d11.total, d12.total] };
      });
    }
    const base = results.UTC as { d11: unknown[]; d12: unknown[]; totals: number[] };
    expect(base.totals).toEqual([1, 2]); // ngày 11: 16:59:59Z; ngày 12: 17:00:00Z (x2)
    expect((base.d11[0] as string[])[1]).toBe('2026-11-11T16:59:59.000Z');
    expect(base.d12.map((x) => (x as string[])[1])).toEqual(['2026-11-11T17:00:00.000Z', '2026-11-11T17:00:00.000Z']);
    for (const tz of Object.keys(results)) expect(results[tz], tz).toEqual(base);
    const api = await audit('from=2026-11-12&to=2026-11-12&targetType=inventory');
    expect(api.body.total).toBe(2);
  });
});
