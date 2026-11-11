import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { maskEmail, maskPhone } from '../src/modules/users-admin/customer.mapper';
import {
  A as CRED, assertNoSecrets, firstWard, get, loginAdmin, loginMemberAgain, loginStaff, makeMember, makeOrder, makeStaff, resetCheckout, resetState, uGet, useClock,
} from './helpers';

/** Lát 7.2 (khách, chỉ đọc) + 7.6 sổ địa chỉ: T-USR-10..18, 50 ↔ AC-USR-11..20. */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let minh: Awaited<ReturnType<typeof makeMember>>;
const A = () => admin.cookie;
const S = () => staff.cookie;

const DAY = 86_400_000;
type Member = Awaited<ReturnType<typeof makeMember>>;
/** Đơn của khách với tổng tiền / trạng thái / thời điểm xác định. */
const orderFor = (u: Member, o: { total?: number; status?: 'to_ship' | 'completed' | 'cancelled' | 'to_pay'; at?: Date; deliveredAt?: Date } = {}) =>
  makeOrder({
    userId: u.user_id,
    email: u.email,
    status: o.status ?? 'to_ship',
    createdAt: o.at ?? new Date(),
    data: {
      ...(o.total !== undefined ? { total: o.total, subtotal: o.total } : {}),
      ...(o.status === 'cancelled' ? { cancelledAt: new Date(), cancelledBy: 'shop', cancelReasonCode: 'declined_on_call' } : {}),
      ...(o.deliveredAt ? { deliveredAt: o.deliveredAt } : {}),
    },
  });

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-c@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  staff = await loginStaff('staff-c@nine2fine.test', { firstName: 'Lan', lastName: 'Trần' });
});
beforeEach(() => resetCheckoutRateLimits());

describe('T-USR-10 AC-USR-11: danh sách phân trang, sắp theo đơn gần nhất, khách chưa có đơn ở cuối', () => {
  it('25 khách: trang 1 = 20 dòng (M đầu), trang 2 = 5 khách không đơn', async () => {
    const base = Date.now() - 10 * DAY;
    minh = await makeMember({ email: 'minh.nguyen@gmail.com', lastName: 'Nguyễn Văn', firstName: 'Minh', phone: '0912345678', birthDate: '1995-05-20', password: CRED.password });
    await orderFor(minh, { at: new Date(base + 30 * DAY / 10) });
    for (let i = 0; i < 19; i++) {
      const u = await makeMember({ email: `khach-list${i}@example.com`, firstName: `Khách${i}`, lastName: 'Lê' });
      await orderFor(u, { at: new Date(base + i * 60_000) });
    }
    for (let i = 0; i < 5; i++) await makeMember({ email: `khach-none${i}@example.com`, firstName: `Rảnh${i}`, lastName: 'Lê' });

    const p1 = await uGet('/customers', S());
    expect(p1.status).toBe(200);
    expect(p1.headers['cache-control']).toMatch(/no-store/);
    expect(p1.body).toMatchObject({ total: 25, page: 1, limit: 20, counts: { all: 25, blocked: 0 } });
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].orderCount).toBe(1);
    expect(p1.body.items.every((i: { orderCount: number }) => i.orderCount === 1)).toBe(true);
    const p2 = await uGet('/customers?page=2', S());
    expect(p2.body.items).toHaveLength(5);
    expect(p2.body.items.every((i: { orderCount: number; lastOrderAt: unknown }) => i.orderCount === 0 && i.lastOrderAt === null)).toBe(true);
    const adminList = await uGet('/customers', A());
    expect(adminList.body.items[0].email).toBe('minh.nguyen@gmail.com'); // M có đơn gần nhất
    expect(new Set([...p1.body.items, ...p2.body.items].map((i: { id: string }) => i.id)).size).toBe(25);

    expect((await uGet('/customers?limit=51', S())).body.error).toMatchObject({ code: 'validation', field: 'limit' });
    expect((await uGet('/customers?limit=0', S())).body.error).toMatchObject({ code: 'validation', field: 'limit' });
    expect((await uGet('/customers?page=0', S())).body.error).toMatchObject({ code: 'validation', field: 'page' });
    expect((await uGet('/customers?sort=bogus', S())).body.error).toMatchObject({ code: 'validation', field: 'sort' });
    const far = await uGet('/customers?page=99', S());
    expect(far.status).toBe(200);
    expect(far.body.items).toEqual([]);
    expect(far.body.total).toBe(25);
    const lim = await uGet('/customers?limit=7&page=4', S());
    expect(lim.body.items).toHaveLength(4);
  });

  it('sắp xếp totalSpent / orderCount / name, hoà theo id (ổn định giữa hai lần gọi)', async () => {
    const rich = await makeMember({ email: 'sort-rich@example.com', firstName: 'Ánh', lastName: 'Sortx' });
    await orderFor(rich, { status: 'completed', total: 9_000_000 });
    await orderFor(rich, { status: 'completed', total: 1_000_000 });
    const t = await uGet('/customers?q=sortx&sort=totalSpent', A());
    expect(t.body.items[0]).toMatchObject({ email: 'sort-rich@example.com', totalSpent: 10_000_000, orderCount: 2 });
    const byCount = await uGet('/customers?sort=orderCount&limit=1', A());
    expect(byCount.body.items[0].email).toBe('sort-rich@example.com');
    const names = await uGet('/customers?sort=name&limit=50', A());
    const firsts = names.body.items.map((i: { name: string }) => i.name.split(' ').pop()!.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    expect([...firsts].sort()).toEqual(firsts);
    const again = await uGet('/customers?sort=name&limit=50', A());
    expect(again.body.items.map((i: { id: string }) => i.id)).toEqual(names.body.items.map((i: { id: string }) => i.id));
    await prisma.order.deleteMany({ where: { userId: rich.user_id } });
    await prisma.user.delete({ where: { user_id: rich.user_id } });
  });
});

describe('T-USR-11 AC-USR-12: tìm theo tên / email / SĐT', () => {
  it('khớp một phần, không phân biệt dấu / hoa thường; SĐT chuẩn hoá +84; ký tự % _ là ký tự thường', async () => {
    const pct = await makeMember({ email: 'pct@example.com', firstName: 'Phần%Trăm', lastName: 'Giảm' });
    const ids = async (q: string, cookie = S()) => {
      const r = await uGet(`/customers?q=${encodeURIComponent(q)}&limit=50`, cookie);
      expect(r.status).toBe(200);
      return r.body.items.map((i: { id: string }) => i.id) as string[];
    };
    expect(await ids('nguyen van minh')).toEqual([minh.user_id]);
    expect(await ids('NGUYỄN VĂN MINH')).toEqual([minh.user_id]);
    expect(await ids('minh.ng')).toEqual([minh.user_id]);
    expect(await ids('0912')).toEqual([minh.user_id]);
    expect(await ids('+84912345')).toEqual([minh.user_id]);
    expect(await ids('0912 345-678')).toEqual([minh.user_id]);
    expect(await ids('091')).toEqual([]); // < 4 chữ số liên tiếp: không tìm theo SĐT (và không khớp tên / email)
    expect(await ids('%')).toEqual([pct.user_id]);
    expect(await ids('_')).toEqual([]);
    expect(await ids('\\')).toEqual([]);
    expect(await ids("'; DROP TABLE users; --")).toEqual([]);
    expect((await uGet(`/customers?q=${'a'.repeat(101)}`, S())).body.error).toMatchObject({ code: 'validation', field: 'q' });
    expect((await uGet(`/customers?q=${'a'.repeat(100)}`, S())).status).toBe(200);
    await prisma.user.delete({ where: { user_id: pct.user_id } });
  });
});

describe('T-USR-12 AC-USR-13: tab, lọc hạng, counts', () => {
  it('blocked / tier / tier + blocked; counts theo cùng q + tier, không theo view', async () => {
    const mk = async (n: string, spent: number, isActive: boolean) => {
      const u = await makeMember({ email: `tier-${n}@example.com`, firstName: n, lastName: 'Tiertest', isActive });
      if (spent > 0) await orderFor(u, { status: 'completed', total: spent });
      return u;
    };
    const g1 = await mk('G1', 40_000_000, true);
    const g2 = await mk('G2', 41_000_000, false);
    const s1 = await mk('S1', 18_000_000, true);
    const b1 = await mk('B1', 0, false);
    const q = async (qs: string) => {
      const r = await uGet(`/customers?q=tiertest&${qs}`, A());
      expect(r.status).toBe(200);
      return r.body as { items: Array<{ id: string; tier: string }>; total: number; counts: { all: number; blocked: number } };
    };
    const all = await q('');
    expect(all.items).toHaveLength(4);
    expect(all.counts).toEqual({ all: 4, blocked: 2 });
    const blocked = await q('view=blocked');
    expect(blocked.items.map((i) => i.id).sort()).toEqual([g2.user_id, b1.user_id].sort());
    expect(blocked.total).toBe(2);
    expect(blocked.counts).toEqual({ all: 4, blocked: 2 });
    const gold = await q('tier=gold');
    expect(gold.items.map((i) => i.id).sort()).toEqual([g1.user_id, g2.user_id].sort());
    expect(gold.counts).toEqual({ all: 2, blocked: 1 });
    const goldBlocked = await q('tier=gold&view=blocked');
    expect(goldBlocked.items.map((i) => i.id)).toEqual([g2.user_id]);
    expect(goldBlocked.total).toBe(1);
    expect(goldBlocked.counts).toEqual({ all: 2, blocked: 1 });
    expect((await q('tier=silver')).items.map((i) => i.id)).toEqual([s1.user_id]);
    expect((await q('tier=bronze')).items.map((i) => i.id)).toEqual([b1.user_id]);
    expect((await uGet('/customers?tier=platinum', A())).body.error).toMatchObject({ code: 'validation', field: 'tier' });
    expect((await uGet('/customers?view=zzz', A())).body.error).toMatchObject({ code: 'validation', field: 'view' });
    for (const u of [g1, g2, s1, b1]) {
      await prisma.order.deleteMany({ where: { userId: u.user_id } });
      await prisma.user.delete({ where: { user_id: u.user_id } });
    }
  });
});

describe('T-USR-13 AC-USR-14: chỉ khách (member)', () => {
  it('không dòng nào là admin / staff; chi tiết id nhân viên, id lạ, sai dạng -> 404', async () => {
    const other = await makeStaff();
    const r = await uGet('/customers?limit=50', A());
    const ids = r.body.items.map((i: { id: string }) => i.id);
    for (const id of [admin.user.user_id, staff.user.user_id, other.user_id]) expect(ids).not.toContain(id);
    expect(r.body.total).toBe(await prisma.user.count({ where: { role: 'member' } }));
    for (const id of [staff.user.user_id, admin.user.user_id, '00000000-0000-4000-8000-000000000000', 'abc', '1']) {
      const d = await uGet(`/customers/${id}`, A());
      expect(d.status).toBe(404);
      expect(d.body.error.code).toBe('not-found');
      expect((await uGet(`/customers/${id}/orders`, S())).status).toBe(404);
    }
    await prisma.user.delete({ where: { user_id: other.user_id } });
  });
});

describe('T-USR-14 AC-USR-15: số liệu theo đơn có user_id', () => {
  it('orderCount 2, totalSpent 2.000.000, lastOrderAt = giờ đặt O2; huỷ và đơn vãng lai không tính', async () => {
    const u = await makeMember({ email: 'so-lieu@example.com', firstName: 'Số', lastName: 'Liệu' });
    const t1 = new Date(Date.now() - 3 * DAY);
    const t2 = new Date(Date.now() - 2 * DAY);
    await orderFor(u, { status: 'completed', total: 1_000_000, at: t1 });
    await orderFor(u, { status: 'completed', total: 1_000_000, at: t2 });
    await orderFor(u, { status: 'cancelled', total: 5_000_000, at: new Date(Date.now() - DAY) });
    await makeOrder({ userId: null, email: u.email, status: 'completed', createdAt: new Date(), data: { total: 7_000_000, subtotal: 7_000_000 } }); // đơn vãng lai cùng email
    const r = await uGet('/customers?q=so-lieu@example.com', S());
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ orderCount: 2, totalSpent: 2_000_000, lastOrderAt: t2.toISOString(), status: 'active' });
    const d = await uGet(`/customers/${u.user_id}`, S());
    expect(d.body).toMatchObject({ orderCount: 2, totalSpent: 2_000_000, lastOrderAt: t2.toISOString(), spentThisYear: 2_000_000 });
    expect(d.body.recentOrders).toHaveLength(3); // kể cả đơn huỷ
  });
});

describe('T-USR-15 AC-USR-16: hạng theo BR-ACC-15', () => {
  it('ranh giới 18 / 40 triệu, năm ngoái không tính, ranh giới năm giờ VN; khớp GET /account/membership', async () => {
    const mk = async (n: string) => makeMember({ email: `hang-${n}@example.com`, firstName: n, lastName: 'Hangtest', password: CRED.password });
    const k1 = await mk('K1');
    const k2 = await mk('K2');
    const k3 = await mk('K3');
    const k4 = await mk('K4');
    await orderFor(k1, { status: 'completed', total: 17_999_999 });
    await orderFor(k2, { status: 'completed', total: 18_000_000 });
    await orderFor(k3, { status: 'completed', total: 40_000_000 });
    const lastYear = new Date(Date.now() - 366 * DAY);
    await orderFor(k4, { status: 'completed', total: 50_000_000, at: lastYear, deliveredAt: lastYear });
    const expected: Array<[Member, string, number]> = [[k1, 'bronze', 17_999_999], [k2, 'silver', 18_000_000], [k3, 'gold', 40_000_000], [k4, 'bronze', 0]];
    for (const [u, tier, spent] of expected) {
      const d = await uGet(`/customers/${u.user_id}`, A());
      expect(d.body).toMatchObject({ tier, spentThisYear: spent });
      const cookie = await loginMemberAgain(u.email);
      const m = await get('/api/account/membership', { cookie, ip: '10.9.9.9' });
      expect(m.status).toBe(200);
      expect({ tier: m.body.tier, spent: m.body.spent }).toEqual({ tier, spent });
    }
    expect((await uGet('/customers?q=hangtest&tier=silver', A())).body.items.map((i: { id: string }) => i.id)).toEqual([k2.user_id]);
    expect(k4.user_id).toBeTruthy();
    // totalSpent mọi thời gian vẫn gồm năm ngoái
    expect((await uGet(`/customers/${k4.user_id}`, A())).body.totalSpent).toBe(50_000_000);

    // Ranh giới năm giờ VN: 31/12 23:59:59 VN (16:59:59Z) là năm cũ; 00:00:00 01/01 VN (17:00:00Z) là năm mới.
    useClock('2026-06-01T05:00:00.000Z');
    const k5 = await mk('K5');
    const k6 = await mk('K6');
    await orderFor(k5, { status: 'completed', total: 20_000_000, at: new Date('2025-12-31T16:00:00.000Z'), deliveredAt: new Date('2025-12-31T16:59:59.000Z') });
    await orderFor(k6, { status: 'completed', total: 20_000_000, at: new Date('2025-12-31T16:00:00.000Z'), deliveredAt: new Date('2025-12-31T17:00:00.000Z') });
    expect((await uGet(`/customers/${k5.user_id}`, A())).body).toMatchObject({ tier: 'bronze', spentThisYear: 0 });
    expect((await uGet(`/customers/${k6.user_id}`, A())).body).toMatchObject({ tier: 'silver', spentThisYear: 20_000_000 });
    const m6 = await get('/api/account/membership', { cookie: await loginMemberAgain(k6.email), ip: '10.9.9.8' });
    expect(m6.body).toMatchObject({ tier: 'silver', spent: 20_000_000 });
  });
});

describe('T-USR-16 AC-USR-17: đơn gần đây và danh sách đơn của khách', () => {
  it('khách 12 đơn: chi tiết đúng 10 đơn mới nhất; GET .../orders phân trang đủ 12; mở được ở /admin/orders/{id}', async () => {
    const u = await makeMember({ email: 'nhieu-don@example.com', firstName: 'Đơn', lastName: 'Nhiều' });
    const codes: string[] = [];
    for (let i = 0; i < 12; i++) codes.push((await orderFor(u, { at: new Date(Date.now() - (20 - i) * 60_000) })).code);
    const newestFirst = [...codes].reverse();
    const d = await uGet(`/customers/${u.user_id}`, S());
    expect(d.body.recentOrders.map((o: { id: string }) => o.id)).toEqual(newestFirst.slice(0, 10));
    expect(d.body.orderCount).toBe(12);
    const p1 = await uGet(`/customers/${u.user_id}/orders?limit=5`, S());
    const p2 = await uGet(`/customers/${u.user_id}/orders?limit=5&page=2`, S());
    const p3 = await uGet(`/customers/${u.user_id}/orders?limit=5&page=3`, S());
    expect([p1, p2, p3].map((p) => p.body.items.length)).toEqual([5, 5, 2]);
    expect(p3.body).toMatchObject({ total: 12, page: 3, limit: 5 });
    expect([...p1.body.items, ...p2.body.items, ...p3.body.items].map((o: { id: string }) => o.id)).toEqual(newestFirst);
    expect(JSON.stringify(p1.body)).not.toMatch(/recipientPhone|0912345678/); // chỉ dòng tóm tắt, không SĐT người nhận
    const open = await get(`/api/admin/orders/${d.body.recentOrders[0].id}`, { cookie: S(), ip: '10.9.8.1' });
    expect(open.status).toBe(200);
    expect((await uGet(`/customers/${u.user_id}/orders?limit=51`, S())).body.error).toMatchObject({ code: 'validation', field: 'limit' });
  });
});

describe('T-USR-17 AC-USR-18, 19: che dữ liệu liên hệ theo vai trò ở máy chủ', () => {
  beforeAll(async () => {
    const ward = await firstWard();
    await prisma.address.create({ data: { userId: minh.user_id, recipientName: 'Nguyễn Văn Minh', phone_number: '0912345678', street: '45 Lê Lợi', provinceCode: '01', wardCode: ward, isDefault: false, createdAt: new Date('2026-01-01T00:00:00Z') } });
    await prisma.address.create({ data: { userId: minh.user_id, recipientName: 'Trần Thị Hoa', phone_number: '0987654321', street: '12 Phố Huế', provinceCode: '01', wardCode: ward, isDefault: true, createdAt: new Date('2026-02-01T00:00:00Z') } });
  });

  it('staff: email / SĐT đã che, không khoá birthDate / addresses, JSON không chứa dữ liệu gốc', async () => {
    const d = await uGet(`/customers/${minh.user_id}`, S());
    expect(d.status).toBe(200);
    assertNoSecrets(d);
    expect(d.body).toMatchObject({ email: 'mi***@gmail.com', phone: '0912 *** 678', contactMasked: true });
    expect(Object.keys(d.body)).not.toContain('birthDate');
    expect(Object.keys(d.body)).not.toContain('addresses');
    for (const leak of ['minh.nguyen', '0912345678', '1995', '45 Lê Lợi', 'Phố Huế', '0987654321', 'Trần Thị Hoa', 'birthDate', 'addresses']) expect(d.text).not.toContain(leak);
    const list = await uGet('/customers?q=minh.nguyen@gmail.com', S());
    expect(list.body.items).toHaveLength(1); // staff vẫn tìm bằng giá trị đầy đủ
    expect(list.body.items[0]).toMatchObject({ email: 'mi***@gmail.com', phone: '0912 *** 678', contactMasked: true });
    for (const leak of ['minh.nguyen', '0912345678']) expect(list.text).not.toContain(leak);
    const byPhone = await uGet('/customers?q=0912345678', S());
    expect(byPhone.body.items.map((i: { id: string }) => i.id)).toEqual([minh.user_id]);
    expect(byPhone.text).not.toContain('0912345678');
  });

  it('admin: đầy đủ, kèm ngày sinh và sổ địa chỉ (mặc định đứng đầu) (T-USR-50 AC-USR-20)', async () => {
    const d = await uGet(`/customers/${minh.user_id}`, A());
    expect(d.body).toMatchObject({ email: 'minh.nguyen@gmail.com', phone: '0912345678', contactMasked: false, birthDate: '1995-05-20', marketingOptIn: false });
    expect(d.body.addresses).toHaveLength(2);
    expect(d.body.addresses[0]).toMatchObject({ recipient: 'Trần Thị Hoa', phone: '0987654321', isDefault: true });
    expect(d.body.addresses[0].line).toMatch(/^12 Phố Huế, .+, .+$/);
    expect(d.body.addresses[1]).toMatchObject({ recipient: 'Nguyễn Văn Minh', isDefault: false });
    expect(Object.keys(d.body.addresses[0]).sort()).toEqual(['isDefault', 'line', 'phone', 'recipient']);
    const l = await uGet('/customers?q=minh.nguyen', A());
    expect(l.body.items[0]).toMatchObject({ email: 'minh.nguyen@gmail.com', phone: '0912345678', contactMasked: false });
    // không có trường Won't
    for (const k of ['note', 'tags', 'returnCount', 'usualSizes', 'averageOrderValue']) expect(Object.keys(d.body)).not.toContain(k);
  });

  it('khách chưa có SĐT: phone = null ở cả hai vai trò', async () => {
    const u = await makeMember({ email: 'no-phone@example.com', firstName: 'Không', lastName: 'Sđt', phone: null });
    expect((await uGet(`/customers/${u.user_id}`, S())).body.phone).toBeNull();
    expect((await uGet(`/customers/${u.user_id}`, A())).body.phone).toBeNull();
  });
});

describe('T-USR-18 BR-USR-09/11: maskEmail / maskPhone ca biên', () => {
  it('maskEmail', () => {
    expect(maskEmail('minh.nguyen@gmail.com')).toBe('mi***@gmail.com');
    expect(maskEmail('abc@x.vn')).toBe('ab***@x.vn');
    expect(maskEmail('ab@x.vn')).toBe('a***@x.vn');
    expect(maskEmail('a@x.vn')).toBe('a***@x.vn');
    expect(maskEmail('a.b+tag@sub.domain.com')).toBe('a.***@sub.domain.com');
  });
  it('maskPhone', () => {
    expect(maskPhone('0912345678')).toBe('0912 *** 678');
    expect(maskPhone('+84 912 345 678')).toBe('0912 *** 678');
    expect(maskPhone('84912345678')).toBe('0912 *** 678');
    expect(maskPhone('12345678')).toBe('1234 *** 678');
    expect(maskPhone('1234567')).toBe('*** 67');
    expect(maskPhone('12')).toBe('*** 12');
    expect(maskPhone('')).toBe('***');
    expect(maskPhone(null)).toBeNull();
  });
});
