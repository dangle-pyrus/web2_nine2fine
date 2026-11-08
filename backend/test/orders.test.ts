import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushMail, freshIp, get, loginMember, makeVoucher, mails, newKey, orderBody, post, prisma, resetCheckout, resetState, setStock, stockOf, submitOrder, useClock, vid } from './helpers';
import { generateOrderCode, normalizeOrderCode } from '../src/modules/order/order-code';
import { retryPendingEmails, setEmailRetryDelays } from '../src/modules/order/order-email.service';
import { setMailTransport } from '../src/mail/mailer';

let top: string; // off-duty-top Trắng/S 390.000 tồn 5
let shirt: string; // weekend-shirt Trắng/S 550.000 tồn 5
let blazer: string; // blazer Đen/S 1.290.000 tồn 5
let dress: string;

beforeEach(async () => {
  vi.useRealTimers();
  setEmailRetryDelays([0, 0, 0]);
  await resetState();
  await resetCheckout();
  top = await vid('off-duty-top', 'Trắng', 'S');
  shirt = await vid('weekend-shirt', 'Trắng', 'S');
  blazer = await vid('the-everyday-blazer', 'Đen', 'S');
  dress = await vid('after-hours-dress', 'Đỏ', 'S');
});

const it1 = (variantId: string, quantity = 1) => ({ variantId, quantity });
const orderCount = () => prisma.order.count();

describe('T-ORD-01 đặt COD (AC-CHK-02, AC-CHK-26, AC-CHK-30)', () => {
  it('khách: 201, to_ship + pending, tổng khớp công thức, tồn trừ, 1 email; phiên sai không 401; bỏ qua userId', async () => {
    const body = await orderBody([it1(blazer, 3)], { userId: 'hacker' });
    const res = await submitOrder({ ...body, userId: 'hacker', total: 1 }, { cookie: 'n2f_sid=phien-sai' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    const o = res.body.order;
    expect(o.id).toMatch(/^N2F\d{10}$/);
    expect(o).toMatchObject({ status: 'to_ship', paymentStatus: 'pending', paymentMethod: 'cod', canCancel: true, willCallToConfirm: true });
    expect(o.pricing).toEqual({ subtotal: 3_870_000, discount: 0, shippingFee: 30000, shippingDiscount: 30000, total: 3_870_000 });
    expect(o.pricing.subtotal - o.pricing.discount + o.pricing.shippingFee - o.pricing.shippingDiscount).toBe(o.pricing.total);
    expect(o.estimatedDelivery.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.items[0]).toMatchObject({ variantId: blazer, quantity: 3, unitPrice: 1_290_000, sku: expect.any(String), productSlug: 'the-everyday-blazer' });
    expect(o.recipient).toEqual({ name: 'Nguyễn Văn A', phone: '0912345678', email: 'khach@example.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/userId|user_id|order_id/);
    expect(o.timeline).toEqual([{ at: expect.any(String), title: 'Đã đặt hàng', actor: 'customer' }]);
    expect(await stockOf(blazer)).toBe(2);
    const db = await prisma.order.findUniqueOrThrow({ where: { code: o.id } });
    expect(db.userId).toBeNull();
    await flushMail();
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe(`nine2fine – Xác nhận đơn hàng #${o.id}`);
    expect(mails[0].to).toBe('khach@example.com');
    expect((await prisma.order.findUniqueOrThrow({ where: { code: o.id } })).confirmationEmailSentAt).not.toBeNull();
  });

  it('thành viên: đơn gắn tài khoản; đơn khách trùng email KHÔNG vào GET /orders (T-ORD-12)', async () => {
    const m = await loginMember('thanhvien@example.com');
    const mine = await submitOrder(await orderBody([it1(top)], { cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    expect(mine.status).toBe(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: mine.body.order.id } })).userId).toBe(m.user.user_id);
    const guest = await submitOrder(await orderBody([it1(shirt)], { email: m.email, phone: '0922222222' }));
    expect(guest.status).toBe(201);
    const list = await get('/api/orders', { cookie: m.cookie });
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([mine.body.order.id]);
  });

  it('staff không gắn đơn (đơn tạo như đơn khách)', async () => {
    const staff = await loginMember('staff1@example.com');
    await prisma.user.update({ where: { user_id: staff.user.user_id }, data: { role: 'staff' } });
    const res = await submitOrder(await orderBody([it1(top)]), { cookie: staff.cookie });
    expect(res.status).toBe(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: res.body.order.id } })).userId).toBeNull();
  });
});

describe('T-ORD-02/03 validation (AC-CHK-04, AC-CHK-09)', () => {
  const cases: Array<[string, (b: Record<string, any>) => void, string]> = [
    ['tên rỗng', (b) => (b.contact.name = ' '), 'contact.name'],
    ['tên 1 ký tự', (b) => (b.contact.name = 'A'), 'contact.name'],
    ['tên 51 ký tự', (b) => (b.contact.name = 'A'.repeat(51)), 'contact.name'],
    ['tên không có chữ cái', (b) => (b.contact.name = '12345'), 'contact.name'],
    ['SĐT đầu 01', (b) => (b.contact.phone = '0112345678'), 'contact.phone'],
    ['SĐT thiếu số', (b) => (b.contact.phone = '091234567'), 'contact.phone'],
    ['SĐT 0212345678 đầu 02', (b) => (b.contact.phone = '0212345678'), 'contact.phone'],
    ['SĐT 84912345678 thiếu dấu +', (b) => (b.contact.phone = '84912345678'), 'contact.phone'],
    ['email 101 ký tự', (b) => (b.contact.email = `${'a'.repeat(89)}@example.com`), 'contact.email'],
    ['email sai', (b) => (b.contact.email = 'khong-hop-le'), 'contact.email'],
    ['địa chỉ 4 ký tự', (b) => (b.address.street = 'abcd'), 'address.street'],
    ['địa chỉ 201 ký tự', (b) => (b.address.street = 'a'.repeat(201)), 'address.street'],
    ['ghi chú 251 ký tự', (b) => (b.note = 'n'.repeat(251)), 'note'],
    ['chưa tick điều khoản', (b) => (b.acceptedTerms = false), 'acceptedTerms'],
    ['thiếu điều khoản', (b) => delete b.acceptedTerms, 'acceptedTerms'],
    ['hoá đơn MST sai', (b) => (b.invoice = { companyName: 'Cty ABC', taxCode: '123', address: '12 Phố Huế', email: 'k@x.vn' }), 'invoice.taxCode'],
    ['hoá đơn thiếu tên công ty', (b) => (b.invoice = { taxCode: '0123456789', address: '12 Phố Huế', email: 'k@x.vn' }), 'invoice.companyName'],
    ['phương thức lạ', (b) => (b.paymentMethod = 'momo'), 'paymentMethod'],
    ['quantity 6', (b) => (b.items[0].quantity = 6), 'items'],
    ['variantId trùng', (b) => b.items.push({ ...b.items[0] }), 'items'],
  ];
  it.each(cases)('%s -> 422 validation đúng field, 0 đơn, tồn không đổi', async (_n, mutate, field) => {
    const body = await orderBody([it1(top)]);
    mutate(body);
    const res = await submitOrder(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'validation', field });
    expect(await orderCount()).toBe(0);
    expect(await stockOf(top)).toBe(5);
  });

  it('tổng quantity > 20 -> 422 items; SĐT +84 và email hoa được chuẩn hoá khi lưu', async () => {
    const dressM = await vid('after-hours-dress', 'Đỏ', 'M');
    const big = await orderBody([it1(top, 5), it1(shirt, 5), it1(blazer, 5), it1(dress, 5), it1(dressM, 1)]).catch(() => null);
    expect(big).toBeNull(); // quote đã từ chối (422 items) nên không dựng được body
    const body = await orderBody([it1(top)]);
    body.contact.phone = ' +84 912 345 678 ';
    body.contact.email = ' Khach@Example.COM ';
    body.contact.name = '  Nguyễn   Văn  A ';
    const res = await submitOrder(body);
    expect(res.status).toBe(201);
    const o = await prisma.order.findUniqueOrThrow({ where: { code: res.body.order.id } });
    expect(o).toMatchObject({ recipientPhone: '0912345678', email: 'khach@example.com', recipientName: 'Nguyễn Văn A' });
  });

  it('T-ORD-03 (AC-CHK-06): provinceCode lạ / wardCode của tỉnh khác -> 422 invalid-address', async () => {
    const wardOf48 = await prisma.ward.findFirstOrThrow({ where: { provinceCode: '48' } });
    const a = await orderBody([it1(top)]);
    a.address.wardCode = wardOf48.code;
    const r1 = await submitOrder(a);
    expect(r1.status).toBe(422);
    expect(r1.body.error).toMatchObject({ code: 'invalid-address', field: 'address.wardCode' });
    const b = await orderBody([it1(top)]);
    b.address.provinceCode = 'zz';
    expect((await submitOrder(b)).body.error.code).toBe('invalid-address');
    expect(await orderCount()).toBe(0);
  });

  it('AC-CHK-07: hoá đơn công ty hợp lệ được lưu và trả lại', async () => {
    const body = await orderBody([it1(top)]);
    body.invoice = { companyName: 'Công ty ABC', taxCode: '0123456789-001', address: '12 Phố Huế, Hà Nội', email: 'ketoan@abc.vn' };
    const res = await submitOrder(body);
    expect(res.status).toBe(201);
    expect(res.body.order.invoice).toEqual(body.invoice);
  });
});

describe('T-ORD-04..05 price-changed / stock-changed (AC-CHK-12, AC-CHK-13)', () => {
  it('price-changed khi giá tăng và khi giảm; 0 đơn; quote mới; gửi lại với số mới -> 201', async () => {
    for (const newPrice of [400000, 380000]) {
      await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: 390000 } });
      const body = await orderBody([it1(top)]);
      await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { price: newPrice } });
      const res = await submitOrder(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('price-changed');
      expect(res.body.error.quote.lines[0].unitPrice).toBe(newPrice);
      expect(res.body.error.quote.pricing.subtotal).toBe(newPrice);
      expect(await orderCount()).toBe(0);
      expect(await stockOf(top)).toBe(5);
      const fresh = await orderBody([it1(top)]);
      const ok = await submitOrder(fresh);
      expect(ok.status).toBe(201);
      await prisma.order.deleteMany();
      await setStock(top, 5);
    }
  });

  it('phí giao / tổng khách thấy sai cũng là price-changed', async () => {
    const body = await orderBody([it1(top)]);
    body.expected.pricing.total = 1;
    const res = await submitOrder(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('price-changed');
    expect(res.body.error.quote.pricing.total).toBe(420000);
  });

  it('stock-changed chỉ dòng thiếu; tồn dòng đủ không đổi; gộp MỌI dòng thiếu; 0 đơn', async () => {
    const body = await orderBody([it1(blazer, 3), it1(top, 1), it1(shirt, 2)]);
    await setStock(blazer, 2);
    await setStock(shirt, 0);
    const res = await submitOrder(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stock-changed');
    const issues = Object.fromEntries(res.body.error.stockIssues.map((i: { variantId: string; available: number }) => [i.variantId, i.available]));
    expect(issues).toEqual({ [blazer]: 2, [shirt]: 0 });
    expect(res.body.error.quote.lines.find((l: { variantId: string }) => l.variantId === blazer).effectiveQuantity).toBe(2);
    expect(await stockOf(top)).toBe(5);
    expect(await stockOf(blazer)).toBe(2);
    expect(await orderCount()).toBe(0);
  });

  it('sản phẩm ngừng bán -> stock-changed available 0', async () => {
    const body = await orderBody([it1(top)]);
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { status: 'DRAFT' } });
    const res = await submitOrder(body);
    expect(res.status).toBe(409);
    expect(res.body.error.stockIssues).toEqual([{ variantId: top, available: 0 }]);
  });
});

describe('T-ORD-06 Idempotency-Key (AC-CHK-17, AC-CHK-18)', () => {
  it('cùng khoá + nội dung -> cùng đơn, 200 + header, 1 đơn, tồn trừ 1 lần, 1 email', async () => {
    const body = await orderBody([it1(blazer, 2)]);
    const key = newKey();
    const a = await submitOrder(body, { key });
    const b = await submitOrder(body, { key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.headers['idempotency-replayed']).toBe('true');
    expect(b.body.order.id).toBe(a.body.order.id);
    expect(await orderCount()).toBe(1);
    expect(await stockOf(blazer)).toBe(3);
    await flushMail();
    expect(mails).toHaveLength(1);
  });

  it('khác nội dung -> 409 idempotency-conflict; thiếu / sai dạng khoá -> 422', async () => {
    const body = await orderBody([it1(top)]);
    const key = newKey();
    await submitOrder(body, { key });
    const other = await orderBody([it1(shirt)]);
    const c = await submitOrder(other, { key });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('idempotency-conflict');
    const none = await post('/api/orders', body, { ip: freshIp() });
    expect(none.status).toBe(422);
    expect(none.body.error.field).toBe('Idempotency-Key');
    expect((await submitOrder(body, { key: 'ngan10kytu' })).body.error.field).toBe('Idempotency-Key');
    expect((await submitOrder(body, { key: 'co khoang trang nhung du dai 16+' })).status).toBe(422);
  });

  it('sau 25 giờ khoá hết hiệu lực -> lượt mới; lỗi 409 trước đó không đốt khoá', async () => {
    const body = await orderBody([it1(top)]);
    await setStock(top, 0);
    const key = newKey();
    const fail = await submitOrder(body, { key });
    expect(fail.status).toBe(409);
    await setStock(top, 5);
    const ok = await submitOrder(body, { key });
    expect(ok.status).toBe(201); // cùng khoá, xử lý lại từ đầu
    useClock(new Date(Date.now() + 25 * 3600 * 1000).toISOString());
    const again = await submitOrder(body, { key });
    expect(again.status).toBe(201);
    expect(again.body.order.id).not.toBe(ok.body.order.id);
  });
});

describe('T-ORD-07 đơn trùng 10 phút (Should)', () => {
  it('409 possible-duplicate kèm existingOrderCode; confirmDuplicate -> 201; sau 11 phút không hỏi', async () => {
    const body = await orderBody([it1(top)]);
    const first = await submitOrder(body);
    expect(first.status).toBe(201);
    const second = await submitOrder(body);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: 'possible-duplicate', existingOrderCode: first.body.order.id });
    expect(second.body.error.quote).toBeUndefined();
    const confirmed = await submitOrder({ ...body, confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
    expect(await orderCount()).toBe(2);
    useClock(new Date(Date.now() + 11 * 60_000).toISOString());
    const later = await submitOrder(body);
    expect(later.status).toBe(201);
  });
});

describe('T-ORD-08 mã đơn (AC-CHK-21)', () => {
  it('1.000 mã: đúng dạng, 6 số đầu = ngày VN; tra cứu chữ thường / có #', () => {
    const at = new Date('2026-11-08T17:30:00Z'); // 00:30 ngày 09/11 giờ VN
    for (let i = 0; i < 1000; i++) {
      const c = generateOrderCode(at);
      expect(c).toMatch(/^N2F\d{10}$/);
      expect(c.slice(3, 9)).toBe('261109');
    }
    expect(normalizeOrderCode(' #n2f2611090427 ')).toBe('N2F2611090427');
    expect(normalizeOrderCode('abc')).toBeNull();
  });
});

describe('T-ORD-09 bản chụp đơn (AC-CHK-22)', () => {
  it('đổi tên, giá sản phẩm, phí giao sau khi đặt: đơn giữ nguyên', async () => {
    const m = await loginMember('chup@example.com');
    const res = await submitOrder(await orderBody([it1(top)], { cookie: m.cookie }), { cookie: m.cookie });
    const before = (await get(`/api/orders/${res.body.order.id}`, { cookie: m.cookie })).body;
    await prisma.product.update({ where: { slug: 'off-duty-top' }, data: { name: 'Tên mới', price: 999000 } });
    await prisma.$executeRawUnsafe(`UPDATE store_settings SET shipping_fee = 55000`);
    const after = (await get(`/api/orders/${res.body.order.id}`, { cookie: m.cookie })).body;
    expect(after).toEqual(before);
    expect(after.items[0].name).toBe('Off-Duty Top');
  });
});

describe('T-ORD-10 phương thức thanh toán (AC-CHK-23, AC-CHK-24)', () => {
  it('COD > 5.000.000 và SĐT bị chặn -> 422 paymentMethod; QR tắt -> 422', async () => {
    const big = await orderBody([it1(blazer, 4), it1(dress, 1)]);
    const r = await submitOrder(big);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'validation', field: 'paymentMethod' });
    const bank = await submitOrder(await orderBody([it1(top)], { paymentMethod: 'bank-transfer' }));
    expect(bank.status).toBe(422);
    expect(bank.body.error.field).toBe('paymentMethod');
    // SĐT đang có 3 đơn COD chưa giao
    const phone = '0933333333';
    for (const v of [top, shirt, dress]) {
      expect((await submitOrder(await orderBody([it1(v)], { phone }))).status).toBe(201);
    }
    const blocked = await submitOrder({ ...(await orderBody([it1(top)], { phone })), confirmDuplicate: true });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.field).toBe('paymentMethod');
    expect(await orderCount()).toBe(3);
  });
});

describe('T-ORD-11 cần gọi xác nhận (AC-CHK-26)', () => {
  it('khách true; thành viên có đơn completed và đơn < 1.000.000 -> false; ≥ 1.000.000 -> true', async () => {
    const m = await loginMember('quen@example.com');
    const first = await submitOrder(await orderBody([it1(top)], { cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    expect(first.body.order.willCallToConfirm).toBe(true);
    await prisma.order.update({ where: { code: first.body.order.id }, data: { status: 'completed' } });
    const small = await submitOrder(await orderBody([it1(shirt)], { cookie: m.cookie, email: m.email, phone: '0944444444' }), { cookie: m.cookie });
    expect(small.body.order.willCallToConfirm).toBe(false);
    const large = await submitOrder(await orderBody([it1(blazer)], { cookie: m.cookie, email: m.email, phone: '0955555555' }), { cookie: m.cookie });
    expect(large.body.order.willCallToConfirm).toBe(true);
  });
});

describe('T-VOU-07..09 voucher khi đặt hàng', () => {
  it('T-VOU-07 (AC-VOU-12): mã hết hạn giữa chừng -> 409 voucher-changed, 0 đơn, quote mới; gửi lại -> 201', async () => {
    const v = await makeVoucher({ code: 'TEXP2', value: 50000, endsAt: new Date(Date.now() + 3600_000) });
    const body = await orderBody([it1(top)], { voucherCodes: ['TEXP2'] });
    expect(body.expected.pricing.total).toBe(370000);
    await prisma.voucher.update({ where: { voucher_id: v.voucher_id }, data: { endsAt: new Date(Date.now() - 1000), startsAt: null } });
    const res = await submitOrder(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('voucher-changed');
    expect(res.body.error.removedVoucherCodes).toEqual(['TEXP2']);
    expect(res.body.error.quote.pricing.total).toBe(420000);
    expect(res.body.error.quote.vouchers).toEqual([]);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(top)).toBe(5);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'TEXP2' } })).usedCount).toBe(0);
    const retry = await submitOrder(await orderBody([it1(top)]));
    expect(retry.status).toBe(201);
  });

  it('T-VOU-08: WELCOME15 hai dòng -> tổng phần giảm theo dòng = 141.000', async () => {
    const res = await submitOrder(await orderBody([it1(top), it1(shirt)], { voucherCodes: ['N2FWELCOME15'] }));
    expect(res.status).toBe(201);
    expect(res.body.order.pricing.discount).toBe(141000);
    expect(res.body.order.vouchers).toEqual([{ code: 'N2FWELCOME15', kind: 'discount', amount: 141000 }]);
    const sum = res.body.order.items.reduce((a: number, i: { lineDiscount: number }) => a + i.lineDiscount, 0);
    expect(sum).toBe(141000);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } })).usedCount).toBe(1);
    expect(await prisma.voucherRedemption.count()).toBe(1);
  });

  it('AC-VOU-08: 3 dòng 390.000 + 550.000 + 790.000, WELCOME15 -> 259.000 = 58.387 + 82.341 + 118.272 (dư 1 đ vào dòng lớn nhất)', async () => {
    const vest = await vid('city-vest', 'Đen', 'S').catch(async () => (await prisma.productVariant.findFirstOrThrow({ where: { product: { slug: 'city-vest' }, inventoryQty: { gt: 0 } } })).variant_id);
    const res = await submitOrder(await orderBody([it1(top), it1(shirt), it1(vest)], { voucherCodes: ['N2FWELCOME15'] }));
    expect(res.status).toBe(201);
    expect(res.body.order.pricing.subtotal).toBe(1_730_000);
    expect(res.body.order.pricing.discount).toBe(259_000);
    const by = (v: string) => res.body.order.items.find((i: { variantId: string }) => i.variantId === v).lineDiscount;
    expect([by(top), by(shirt), by(vest)]).toEqual([58_387, 82_341, 118_272]);
    const rows = await prisma.orderItem.findMany({ where: { order: { code: res.body.order.id } } });
    expect(Object.fromEntries(rows.map((r) => [r.variantId, r.lineDiscount]))).toEqual({ [top]: 58_387, [shirt]: 82_341, [vest]: 118_272 });
  });

  it('T-VOU-08/01: WELCOME15 + FREESHIP trên đơn 390.000 -> 332.000', async () => {
    const res = await submitOrder(await orderBody([it1(top)], { voucherCodes: ['N2FWELCOME15', 'N2FFREESHIP'] }));
    expect(res.status).toBe(201);
    expect(res.body.order.pricing).toEqual({ subtotal: 390000, discount: 58000, shippingFee: 30000, shippingDiscount: 30000, total: 332000 });
    expect(res.body.order.vouchers.map((x: { code: string }) => x.code)).toEqual(['N2FWELCOME15', 'N2FFREESHIP']);
    expect(await prisma.voucherRedemption.count()).toBe(2);
  });

  it('T-VOU-09: mã hết hạn sau khi đặt, đơn giữ nguyên giảm giá và tổng', async () => {
    const m = await loginMember('vou9@example.com');
    const res = await submitOrder(await orderBody([it1(top)], { voucherCodes: ['N2FWELCOME15'], cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    expect(res.status).toBe(201);
    await prisma.voucher.update({ where: { code: 'N2FWELCOME15' }, data: { endsAt: new Date(Date.now() - 1000) } });
    const got = await get(`/api/orders/${res.body.order.id}`, { cookie: m.cookie });
    expect(got.body.pricing).toEqual(res.body.order.pricing);
    expect(got.body.vouchers).toEqual(res.body.order.vouchers);
  });

  it('mã đơn đầu tiên dùng lần hai (cùng SĐT) -> bị từ chối ở quote; ép đặt -> voucher-changed', async () => {
    const first = await submitOrder(await orderBody([it1(top)], { voucherCodes: ['N2FWELCOME15'] }));
    expect(first.status).toBe(201);
    const stale = await orderBody([it1(shirt)], { phone: '0912345678' });
    const body = { ...stale, voucherCodes: ['N2FWELCOME15'] };
    const res = await submitOrder(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('voucher-changed');
    expect(await orderCount()).toBe(1);
  });
});

describe('T-CART-08 đặt đơn thành viên chỉ xoá dòng đã mua', () => {
  it('giỏ giữ lại các dòng không mua', async () => {
    const m = await loginMember('giohang@example.com');
    const c = { cookie: m.cookie };
    for (const id of [top, shirt, blazer]) expect((await post('/api/cart/lines', { variantId: id, quantity: 1 }, c)).status).toBe(200);
    const res = await submitOrder(await orderBody([it1(top), it1(shirt)], { cookie: m.cookie, email: m.email }), { cookie: m.cookie });
    expect(res.status).toBe(201);
    const cart = await get('/api/cart', c);
    expect(cart.body.lines.map((l: { variantId: string }) => l.variantId)).toEqual([blazer]);
  });
});

describe('T-MAIL email (AC-CHK-34, AC-CHK-35)', () => {
  it('T-MAIL-01: nội dung đủ mục, câu chống lừa đảo, tổng khớp đơn', async () => {
    const res = await submitOrder(await orderBody([it1(top)], { voucherCodes: ['N2FWELCOME15', 'N2FFREESHIP'] }));
    await flushMail();
    const text = mails[0].text;
    expect(text).toContain(`#${res.body.order.id}`);
    expect(text).toContain('Off-Duty Top | Trắng | S | SL 1 | 390.000₫');
    expect(text).toContain('Tạm tính: 390.000₫');
    expect(text).toContain('Giảm giá (N2FWELCOME15): -58.000₫');
    expect(text).toContain('Tổng thanh toán: 332.000₫');
    expect(text).toContain('Thanh toán khi nhận hàng (COD)');
    expect(text).toContain('Nguyễn Văn A - 0912345678');
    expect(text).toContain('12 Phố Huế');
    expect(text).toContain('Dự kiến giao:');
    expect(text).toContain(`/track-order?code=${res.body.order.id}`);
    expect(text).toContain('nine2fine sẽ gọi xác nhận trong 2 giờ làm việc.');
    expect(text).toContain('nine2fine không yêu cầu chuyển khoản ngoài trang thanh toán của đơn và không hỏi mật khẩu hay mã OTP.');
    expect(text).toContain('/policies/returns');
    expect(text).toContain('Hotline');
  });

  it('email chờ thanh toán có số tiền, hạn, link thanh toán, KHÔNG có số tài khoản', async () => {
    const { orderAwaitingPaymentMail } = await import('../src/mail/order-templates');
    const res = await submitOrder(await orderBody([it1(top)]));
    const order = res.body.order;
    const mail = orderAwaitingPaymentMail({ ...order, status: 'to_pay', paymentMethod: 'bank-transfer', paymentDueAt: new Date(Date.now() + 1800_000).toISOString() }, false);
    expect(mail.subject).toBe(`nine2fine – Đơn #${order.id} đang chờ thanh toán`);
    expect(mail.text).toContain('Số tiền cần chuyển: 420.000₫');
    expect(mail.text).toContain('Hạn thanh toán:');
    expect(mail.text).toContain(`/payment/${order.id}`);
    expect(mail.text).not.toMatch(/tài khoản|STK/i);
  });

  it('T-MAIL-02: SMTP lỗi -> đơn vẫn 201, thử đúng 3 lần, báo CSKH (không kèm email khách); retryPendingEmails gửi lại', async () => {
    let attempts = 0;
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    let failing = true;
    setMailTransport({
      async send(msg) {
        if (msg.to === 'khach@example.com') {
          attempts++;
          if (failing) throw new Error('smtp down');
        }
        sent.push(msg);
      },
    });
    const res = await submitOrder(await orderBody([it1(top)]));
    expect(res.status).toBe(201);
    await flushMail();
    expect(attempts).toBe(3);
    const support = sent.find((m) => m.to === 'support@example.test');
    expect(support?.subject).toBe(`Không gửi được email xác nhận đơn ${res.body.order.id}`);
    expect(support?.text).not.toContain('khach@example.com');
    const row = await prisma.order.findUniqueOrThrow({ where: { code: res.body.order.id } });
    expect(row).toMatchObject({ emailAttempts: 3, confirmationEmailSentAt: null, status: 'to_ship' });
    // đã đủ 3 lần -> job không gửi thêm
    expect(await retryPendingEmails(new Date(Date.now() + 5 * 60_000))).toBe(0);
    // tiến trình chết sau commit: chưa thử lần nào -> job gửi lại
    await prisma.order.update({ where: { code: res.body.order.id }, data: { emailAttempts: 1 } });
    failing = false;
    expect(await retryPendingEmails(new Date(Date.now() + 5 * 60_000))).toBe(1);
    expect(sent.filter((m) => m.to === 'khach@example.com')).toHaveLength(1);
  });
});

describe('T-RL-01 giới hạn đặt hàng (AC-CHK-36)', () => {
  it('11 đơn / 10 phút / IP -> 429 retryAfterSeconds; IP khác không bị', async () => {
    const ip = freshIp();
    const bad = await orderBody([it1(top)]);
    bad.acceptedTerms = false; // 422 vẫn tính vào bộ đếm, không cần tạo đơn thật
    for (let i = 0; i < 10; i++) expect((await submitOrder(bad, { ip })).status).toBe(422);
    const res = await submitOrder(bad, { ip });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate-limited');
    expect(res.body.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect((await submitOrder(bad, { ip: freshIp() })).status).toBe(422);
  });
});

describe('T-ERR-01 định dạng lỗi', () => {
  it('lỗi không lộ stack / SQL; route lạ trong /orders -> 404 not-found', async () => {
    const res = await get('/api/orders/khong-ton-tai', { cookie: 'n2f_sid=x' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select |prisma|at \w+ \(/i);
    const m = await loginMember('loi@example.com');
    const nf = await get('/api/orders/khong-ton-tai', { cookie: m.cookie });
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not-found');
  });
});


describe('AC-CHK-37 DB không khả dụng', () => {
  const dbDown = () => Object.assign(new Error("Can't reach database server at `db.example:5432` select * from orders"), { code: 'P1001', name: 'PrismaClientInitializationError' });

  it('POST /orders khi $transaction lỗi kết nối -> 500 unavailable chuẩn, không lộ stack/SQL, 0 đơn, tồn không đổi', async () => {
    const body = await orderBody([it1(top)]);
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValue(dbDown());
    let res;
    try {
      res = await submitOrder(body);
    } finally {
      spy.mockRestore();
    }
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('unavailable');
    expect(typeof res.body.error.message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select |prisma|P1001|db\.example|at \w+ \(/i);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(top)).toBe(5);
  });

  it('POST /checkout/quote khi truy vấn lỗi kết nối -> 500 unavailable chuẩn, không lộ stack/SQL', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(dbDown());
    let res;
    try {
      res = await post('/api/checkout/quote', { items: [it1(top)], voucherCodes: [], contact: { phone: '0912345678', email: 'khach@example.com' } }, { ip: freshIp() });
    } finally {
      spy.mockRestore();
    }
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('unavailable');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select |prisma|P1001|db\.example|at \w+ \(/i);
    expect(await orderCount()).toBe(0);
    expect(await stockOf(top)).toBe(5);
  });
});
