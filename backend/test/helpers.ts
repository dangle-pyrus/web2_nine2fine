import request from 'supertest';
import type { Router } from 'express';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import prisma from '../src/config/prisma';
import { ASSUMPTIONS } from '../src/config/assumptions';
import { hashPassword } from '../src/lib/crypto';
import { flushMail, MailMessage, setMailTransport } from '../src/mail/mailer';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { assertLocalTestDb } from './guard';
import { clearCategoryCache } from '../src/modules/catalog/catalog.cache';
import { resetCatalogRateLimit } from '../src/middleware/catalog-rate-limit';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { seedCatalog } from '../prisma/seed-catalog';
import { seedCheckout } from '../prisma/seed-checkout';

export const ORIGIN = 'http://localhost:4200';

// Route giả để kiểm phân quyền (AC-AUTH-84, 85, 88) bằng đúng middleware dùng chung.
export const app = createApp({
  extraApiRoutes: (r: Router) => {
    r.get('/account/ping', requireAuth('storefront'), (req, res) => void res.json({ ok: true, id: req.auth!.user.user_id }));
    r.get('/admin/ping', requireAuth('admin'), (_req, res) => void res.json({ ok: true }));
    r.get('/admin/settings/staff', requireAuth('admin'), requireRole('admin'), (_req, res) => void res.json({ ok: true }));
    r.get('/boom', () => {
      throw new Error('select * from users where password_hash = secret');
    });
  },
});

export const mails: MailMessage[] = [];

export async function resetState(): Promise<void> {
  assertLocalTestDb(); // chốt chặn trước mọi thao tác xoá
  // Slice 6: products / vouchers / media / nhật ký kho có FK tới users nên TRUNCATE users CASCADE sẽ xoá cả catalog.
  // Truncate phía đơn / giỏ / phiên rồi DELETE users (FK SET NULL) để catalog sống sót như trước.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sessions", "auth_action_tokens", "auth_rate_limits", "login_attempts", "addresses", "carts", "cart_lines", "orders", "order_items", "order_events", "voucher_redemptions", "order_access_grants", "idempotency_keys", "account_events" RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe('DELETE FROM "users"');
  mails.length = 0;
  setMailTransport({
    async send(msg) {
      mails.push(msg);
    },
  });
  vi.useRealTimers();
}

/** Xoá toàn bộ catalog rồi seed lại 8 sản phẩm chuẩn. Không nằm trong resetState() của auth. */
export async function resetCatalog(): Promise<void> {
  assertLocalTestDb();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "product_variants", "products", "size_charts", "categories" RESTART IDENTITY CASCADE',
  );
  clearCategoryCache();
  resetCatalogRateLimit();
  await seedCatalog(prisma);
}

let locationsSeeded = false;
/**
 * Xoá dữ liệu đơn / giỏ / voucher / tham số, seed lại catalog + tham số + voucher + ngày nghỉ.
 * Địa giới (tỉnh, phường) chỉ nạp một lần mỗi tiến trình test, không TRUNCATE.
 */
export async function resetCheckout(): Promise<void> {
  assertLocalTestDb();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "idempotency_keys","order_access_grants","order_events","voucher_redemptions","order_items","orders","cart_lines","carts","vouchers","store_settings","holidays" RESTART IDENTITY CASCADE',
  );
  await resetCatalog();
  await prisma.$executeRawUnsafe(`DELETE FROM "auth_rate_limits" WHERE "key" LIKE 'voucher-miss:%' OR "key" LIKE 'order-lookup:%'`);
  await seedCheckout(prisma, { locations: !locationsSeeded });
  locationsSeeded = true;
  resetCheckoutRateLimits();
}

export const useClock = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};
export const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

let ipCounter = 10;
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

export interface CallOpts {
  ip?: string;
  cookie?: string;
  origin?: string | null;
  xrw?: string | null;
  headers?: Record<string, string>;
}

export function call(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown, opts: CallOpts = {}) {
  const r = request(app)[method](path);
  r.set('X-Forwarded-For', opts.ip ?? '203.0.113.9');
  if (opts.origin !== null) r.set('Origin', opts.origin ?? ORIGIN);
  if (opts.xrw !== null) r.set('X-Requested-With', opts.xrw ?? 'n2f');
  if (opts.cookie) r.set('Cookie', opts.cookie);
  if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) r.set(k, v);
  if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
    r.set('Content-Type', 'application/json');
    if (body !== undefined) r.send(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return r;
}
export const post = (path: string, body: unknown, opts?: CallOpts) => call('post', path, body, opts);
export const get = (path: string, opts?: CallOpts) => call('get', path, undefined, opts);
export const put = (path: string, body: unknown, opts?: CallOpts) => call('put', path, body, opts);
export const del = (path: string, opts?: CallOpts) => call('delete', path, undefined, opts);
export const patch = (path: string, body: unknown, opts?: CallOpts) => call('patch', path, body, opts);

const setCookies = (res: request.Response): string[] =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);

/** "name=value" của cookie vừa được set (undefined nếu bị xoá / không có). */
export const cookieFrom = (res: request.Response, name: string): string | undefined => {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  if (!line) return undefined;
  const v = line.split(';')[0];
  return v === `${name}=` ? undefined : v;
};
export const rawSetCookie = (res: request.Response, name: string): string | undefined =>
  setCookies(res).find((c) => c.startsWith(`${name}=`));

export async function createUser(opts: {
  email: string;
  password?: string;
  role?: 'member' | 'staff' | 'admin';
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
}) {
  return prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: opts.password ? await hashPassword(opts.password) : null,
      firstName: opts.firstName ?? 'Minh',
      lastName: opts.lastName ?? 'Nguyễn Văn',
      role: opts.role ?? 'member',
      isActive: opts.isActive ?? true,
      terms_accepted_at: new Date(),
    },
  });
}

export const A = { email: 'minh@example.com', password: 'Nine2fine1' };
export const P = { email: 'lan@example.com' };
export const X = { email: 'x@example.com', password: 'Nine2fine1' };
export const N = { email: 'new@example.com' };

export function lastCode(email: string): string | undefined {
  for (let i = mails.length - 1; i >= 0; i--) {
    if (mails[i].to === email) {
      const m = /: (\d{8})/.exec(mails[i].text);
      if (m) return m[1];
    }
  }
  return undefined;
}

/** Gửi mã rồi đọc mã từ thư giả. */
export async function sendCode(email: string, purpose: 'login' | 'register' | 'reset-password', ip?: string) {
  const res = await post('/api/auth/codes', { email, purpose }, { ip });
  await flushMail();
  return { res, code: lastCode(email) };
}

export const loginPassword = (email: string, password: string, ip?: string) =>
  post('/api/auth/login/password', { email, password }, { ip });

export const wrongCode = (real: string | undefined) => (real === '00000000' ? '11111111' : '00000000');
/** variantId theo slug + màu + size của catalog seed. */
export async function vid(slug: string, color: string, size: string): Promise<string> {
  const v = await prisma.productVariant.findFirstOrThrow({ where: { colorName: color, size, product: { slug } } });
  return v.variant_id;
}

export async function setStock(variantId: string, qty: number): Promise<void> {
  await prisma.productVariant.update({ where: { variant_id: variantId }, data: { inventoryQty: qty } });
}

let voucherSeq = 0;
/** Voucher thử nghiệm (mặc định: giảm cố định 50.000, công khai, còn hạn). */
export async function makeVoucher(over: Partial<Parameters<typeof prisma.voucher.create>[0]['data']> & { code?: string } = {}) {
  const code = over.code ?? `TV${String(++voucherSeq).padStart(4, '0')}`;
  return prisma.voucher.create({
    data: { name: `Voucher ${code}`, kind: 'fixed', value: 50000, ...over, code } as Parameters<typeof prisma.voucher.create>[0]['data'],
  });
}

let memberSeq = 0;
/** Tạo thành viên + đăng nhập mật khẩu, trả cookie `n2f_sid`. */
export async function loginMember(email = `member${++memberSeq}@example.com`) {
  const user = await createUser({ email, password: A.password });
  const res = await loginPassword(email, A.password, freshIp());
  return { user, email, cookie: cookieFrom(res, 'n2f_sid')! };
}

export interface OrderOpts {
  voucherCodes?: string[];
  phone?: string;
  email?: string;
  name?: string;
  paymentMethod?: 'cod' | 'bank-transfer';
  cookie?: string;
  [k: string]: unknown;
}

let wardCache: string | undefined;
export async function firstWard(): Promise<string> {
  if (!wardCache) wardCache = (await prisma.ward.findFirstOrThrow({ where: { provinceCode: '01' }, orderBy: { code: 'asc' } })).code;
  return wardCache;
}

/** Body đặt hàng hợp lệ; `expected` lấy từ chính báo giá của máy chủ (như FE). Ghi đè bằng `over`. */
export async function orderBody(items: Array<{ variantId: string; quantity: number }>, o: OrderOpts = {}) {
  const { voucherCodes = [], phone = '0912345678', email = 'khach@example.com', name = 'Nguyễn Văn A', paymentMethod = 'cod', cookie, ...rest } = o;
  const q = await post('/api/checkout/quote', { items, voucherCodes, contact: { phone, email } }, { ip: freshIp(), cookie });
  if (q.status !== 200) throw new Error(`quote ${q.status}`);
  return {
    items,
    voucherCodes,
    contact: { name, phone, email },
    address: { provinceCode: '01', wardCode: await firstWard(), street: '12 Phố Huế' },
    note: '',
    paymentMethod,
    invoice: null,
    acceptedTerms: true,
    expected: {
      lines: (q.body.lines as Array<{ variantId: string; unitPrice: number }>).map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice })),
      pricing: q.body.pricing,
    },
    ...rest,
  } as Record<string, any>;
}

let keySeq = 0;
export const newKey = () => `test-key-${Date.now()}-${++keySeq}-abcdefghij`;

/** POST /api/orders (mỗi lần một IP và một khoá mới, trừ khi truyền vào). */
export const submitOrder = (body: unknown, opts: { key?: string; ip?: string; cookie?: string; headers?: Record<string, string> } = {}) =>
  post('/api/orders', body, {
    ip: opts.ip ?? freshIp(),
    cookie: opts.cookie,
    headers: { 'Idempotency-Key': opts.key ?? newKey(), ...(opts.headers ?? {}) },
  });

export async function stockOf(variantId: string): Promise<number> {
  return (await prisma.productVariant.findUniqueOrThrow({ where: { variant_id: variantId } })).inventoryQty;
}

/** Chuyển đơn COD đã tạo thành đơn chuyển khoản chờ thanh toán (QR chưa bật ở HTTP nên dựng bằng SQL). */
export async function makeAwaitingPayment(code: string, dueAt: Date): Promise<void> {
  await prisma.order.update({ where: { code }, data: { status: 'to_pay', paymentMethod: 'bank_transfer', paymentDueAt: dueAt } });
}

let staffSeq = 0;
/** Tạo staff / admin + đăng nhập `/admin/auth/login`, trả cookie `n2f_asid`. */
async function loginRole(role: 'staff' | 'admin', email = `${role}${++staffSeq}@nine2fine.test`, names: { firstName?: string; lastName?: string } = {}) {
  const user = await createUser({ email, password: A.password, role, ...names });
  const res = await post('/api/admin/auth/login', { email, password: A.password }, { ip: freshIp() });
  const cookie = cookieFrom(res, 'n2f_asid');
  if (!cookie) throw new Error(`admin login ${res.status}`);
  return { user, email, cookie };
}
export const loginStaff = (email?: string, names?: { firstName?: string; lastName?: string }) => loginRole('staff', email, names);
export const loginAdmin = (email?: string, names?: { firstName?: string; lastName?: string }) => loginRole('admin', email, names);

/** Gọi API admin với cookie; mặc định IP riêng mỗi lần. */
export const adminGet = (path: string, cookie?: string) => get(`/api/admin/orders${path}`, { cookie, ip: freshIp() });
export const adminPost = (path: string, body: unknown, cookie?: string, headers?: Record<string, string>) =>
  post(`/api/admin/orders${path}`, body, { cookie, ip: freshIp(), headers });

export interface MakeOrderOpts {
  status?: 'to_pay' | 'to_ship' | 'to_receive' | 'completed' | 'cancel_requested' | 'cancelled';
  paymentMethod?: 'cod' | 'bank_transfer';
  /** `needs_confirm_call` (mặc định true với COD). */
  needsCall?: boolean;
  createdAt?: Date;
  phone?: string;
  email?: string;
  name?: string;
  userId?: string | null;
  items?: Array<{ variantId: string; quantity: number }>;
  /** Cột bổ sung (Prisma), ví dụ confirmedAt, carrier... */
  data?: Record<string, unknown>;
}

let orderSeq = 0;
/** Dựng đơn trực tiếp bằng Prisma (không qua POST /orders): cho phép đặt status, needs_confirm_call, created_at. Kèm sự kiện `placed`. */
export async function makeOrder(o: MakeOrderOpts = {}): Promise<{ code: string; id: string }> {
  const status = o.status ?? 'to_ship';
  const method = o.paymentMethod ?? (status === 'to_pay' ? 'bank_transfer' : 'cod');
  const at = o.createdAt ?? new Date();
  const code = `N2F26110${String(++orderSeq).padStart(5, '0')}`.slice(0, 13);
  const lines = o.items ?? [{ variantId: await vid('off-duty-top', 'Trắng', 'S'), quantity: 1 }];
  const variants = await prisma.productVariant.findMany({ where: { variant_id: { in: lines.map((l) => l.variantId) } }, include: { product: true } });
  const price = (v: (typeof variants)[number]) => Number(v.product.price);
  const subtotal = lines.reduce((n, l) => n + price(variants.find((v) => v.variant_id === l.variantId)!) * l.quantity, 0);
  const order = await prisma.order.create({
    data: {
      code,
      status,
      userId: o.userId ?? null,
      paymentMethod: method,
      email: o.email ?? 'khach@example.com',
      recipientName: o.name ?? 'Nguyễn Văn A',
      recipientPhone: o.phone ?? '0912345678',
      provinceCode: '01',
      wardCode: await firstWard(),
      provinceName: 'Hà Nội',
      wardName: 'Ba Đình',
      street: '12 Phố Huế',
      subtotal,
      discount: 0,
      shippingFee: 0,
      shippingDiscount: 0,
      total: subtotal,
      estimatedFrom: new Date('2026-11-11'),
      estimatedTo: new Date('2026-11-13'),
      needsConfirmCall: o.needsCall ?? method === 'cod',
      termsAcceptedAt: at,
      itemsFingerprint: 'a'.repeat(64),
      createdAt: at,
      ...(status === 'to_pay' ? { paymentDueAt: new Date(at.getTime() + 1800_000) } : {}),
      ...(o.data ?? {}),
      items: {
        createMany: { data: lines.map((l, i) => {
          const v = variants.find((x) => x.variant_id === l.variantId)!;
          return {
            lineNo: i + 1, variantId: v.variant_id, productId: v.productId, productSlug: v.product.slug, name: v.product.name,
            colorName: v.colorName, size: v.size, sku: v.sku, mediaId: v.product.coverMediaId, unitPrice: Number(v.product.price), quantity: l.quantity,
          };
        }) },
      },
    },
  });
  await prisma.orderEvent.create({
    data: { orderId: order.order_id, at, fromStatus: null, toStatus: status === 'to_pay' ? 'to_pay' : 'to_ship', paymentStatus: 'pending', actor: 'customer', kind: 'placed' },
  });
  return { code, id: order.order_id };
}

/** Điểm lật S4-Q1: chạy `fn` với `toShipCancelMode` tạm thời (khôi phục kể cả khi lỗi). 'direct' = hành vi Slice 3. */
export async function withToShipCancelMode<T>(mode: 'direct' | 'request', fn: () => Promise<T>): Promise<T> {
  const a = ASSUMPTIONS as { toShipCancelMode: 'direct' | 'request' };
  const prev = a.toShipCancelMode;
  a.toShipCancelMode = mode;
  try {
    return await fn();
  } finally {
    a.toShipCancelMode = prev;
  }
}

export { prisma, flushMail };

/* ======================= Slice 6: admin kho & sản phẩm ======================= */

/** PNG tối thiểu (chữ ký + IHDR), đủ để đọc kích thước; không cần giải mã. */
export function makePng(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b[24] = 8;
  b[25] = 2;
  return b;
}

/** JPEG tối thiểu: SOI + SOF0 (độ cao rồi độ rộng). */
export function makeJpeg(w: number, h: number): Buffer {
  const b = Buffer.alloc(2 + 2 + 2 + 15);
  b[0] = 0xff; b[1] = 0xd8;
  b[2] = 0xff; b[3] = 0xc0;
  b.writeUInt16BE(17, 4);
  b[6] = 8;
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  b[11] = 3;
  return b;
}

/** WebP tối thiểu: `VP8X` (mặc định), `VP8 ` (lossy) hoặc `VP8L` (lossless). */
export function makeWebp(w: number, h: number, kind: 'VP8X' | 'VP8 ' | 'VP8L' = 'VP8X'): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'latin1');
  b.write(kind, 12, 'latin1');
  b.writeUInt32LE(10, 16);
  if (kind === 'VP8X') {
    b.writeUIntLE(w - 1, 24, 3);
    b.writeUIntLE(h - 1, 27, 3);
  } else if (kind === 'VP8 ') {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(b, 23);
    b.writeUInt16LE(w, 26);
    b.writeUInt16LE(h, 28);
  } else {
    b[20] = 0x2f;
    b.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 21);
  }
  return b;
}

/** POST byte thô tới /api/admin/uploads/product-images. */
export function uploadRaw(cookie: string | undefined, body: Buffer | string, contentType = 'application/octet-stream', ip: string = freshIp()) {
  const r = request(app).post('/api/admin/uploads/product-images');
  r.set('X-Forwarded-For', ip).set('Origin', ORIGIN).set('X-Requested-With', 'n2f').set('Content-Type', contentType);
  if (cookie) r.set('Cookie', cookie);
  return r.send(body);
}

export interface MakeProductVariant {
  sku: string;
  color?: string;
  hex?: string;
  size?: string;
  qty?: number;
}
export interface MakeProductOpts {
  slug?: string;
  name?: string;
  type?: string;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  price?: number;
  category?: string;
  publishedAt?: Date | null;
  gallery?: string[];
  variants?: MakeProductVariant[];
  updatedAt?: Date;
}

let productSeq = 0;
/** Sản phẩm thử trực tiếp bằng Prisma (không qua API): `search_text` tính đúng công thức. */
export async function makeProduct(o: MakeProductOpts = {}): Promise<{ id: string; slug: string; variants: Array<{ id: string; sku: string }> }> {
  const n = ++productSeq;
  const { foldVi } = await import('../src/lib/text');
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: o.category ?? 'tops' } });
  const status = o.status ?? 'DRAFT';
  const name = o.name ?? `Sản phẩm thử ${n}`;
  const type = o.type ?? 'Áo thun';
  const gallery = o.gallery ?? ['pexels-test-image'];
  const at = o.updatedAt ?? new Date();
  const p = await prisma.product.create({
    data: {
      categoryId: category.category_id,
      slug: o.slug ?? `san-pham-thu-${n}`,
      name,
      typeLabel: type,
      price: o.price ?? 250000,
      coverMediaId: gallery[0] ?? '',
      galleryMediaIds: gallery,
      moments: ['work'],
      genders: ['nam'],
      salesRank: 1000 + n,
      displayOrder: 1000 + n,
      searchText: foldVi(`${name} ${type}`),
      status,
      publishedAt: o.publishedAt === undefined ? (status === 'ACTIVE' ? at : null) : o.publishedAt,
      updatedAt: at,
      variants: {
        create: (o.variants ?? [{ sku: `TP-${n}-DEN-S` }]).map((v, i) => ({
          sku: v.sku,
          colorName: v.color ?? 'Đen',
          colorHex: v.hex ?? '#000000',
          size: v.size ?? 'S',
          inventoryQty: v.qty ?? 10,
          sortOrder: i,
        })),
      },
    },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });
  return { id: p.product_id, slug: p.slug, variants: p.variants.map((v) => ({ id: v.variant_id, sku: v.sku })) };
}

/** Gọi API admin sản phẩm. */
export const aGet = (path: string, cookie?: string) => get(`/api/admin${path}`, { cookie, ip: freshIp() });
export const aPost = (path: string, body: unknown, cookie?: string, headers?: Record<string, string>) => post(`/api/admin${path}`, body, { cookie, ip: freshIp(), headers });
export const aPut = (path: string, body: unknown, cookie?: string) => put(`/api/admin${path}`, body, { cookie, ip: freshIp() });
export const aDel = (path: string, cookie?: string) => del(`/api/admin${path}`, { cookie, ip: freshIp() });

/* ======================= Slice 7: admin khách hàng & nhân viên ======================= */

export const uGet = (path: string, cookie?: string) => get(`/api/admin${path}`, { cookie, ip: freshIp() });
export const uPost = (path: string, body: unknown, cookie?: string, headers?: Record<string, string>) =>
  post(`/api/admin${path}`, body, { cookie, ip: freshIp(), headers });
export const uPut = (path: string, body: unknown, cookie?: string, headers?: Record<string, string>) =>
  put(`/api/admin${path}`, body, { cookie, ip: freshIp(), headers });

/** Tạo khách (member) với đủ trường cho màn khách hàng. */
let customerSeq = 0;
export async function makeMember(
  o: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    isActive?: boolean;
    birthDate?: string;
    marketingOptIn?: boolean;
    password?: string;
    createdAt?: Date;
  } = {},
) {
  const n = ++customerSeq;
  return prisma.user.create({
    data: {
      email: (o.email ?? `khach${n}@example.com`).toLowerCase(),
      passwordHash: o.password ? await hashPassword(o.password) : null,
      firstName: o.firstName ?? `Khách${n}`,
      lastName: o.lastName ?? 'Nguyễn Văn',
      phone_number: o.phone === undefined ? null : o.phone,
      isActive: o.isActive ?? true,
      dateOfBirth: o.birthDate ? new Date(`${o.birthDate}T00:00:00.000Z`) : null,
      marketingOptIn: o.marketingOptIn ?? false,
      role: 'member',
      terms_accepted_at: new Date(),
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
  });
}

/** Tạo staff / admin chưa có mật khẩu (`password_hash` NULL) hoặc có mật khẩu. */
export async function makeStaff(o: { email?: string; role?: 'staff' | 'admin'; passwordHash?: null; isActive?: boolean; firstName?: string; lastName?: string } = {}) {
  const n = ++staffSeq;
  return prisma.user.create({
    data: {
      email: (o.email ?? `nv${n}@nine2fine.test`).toLowerCase(),
      passwordHash: o.passwordHash === null ? null : await hashPassword(A.password),
      firstName: o.firstName ?? `Nv${n}`,
      lastName: o.lastName ?? 'Trần',
      role: o.role ?? 'staff',
      isActive: o.isActive ?? true,
      terms_accepted_at: new Date(),
    },
  });
}

/** Đăng nhập thêm một phiên admin cho tài khoản đã có (cùng mật khẩu `A.password`). */
export async function loginAdminAgain(email: string): Promise<string> {
  const res = await post('/api/admin/auth/login', { email, password: A.password }, { ip: freshIp() });
  const cookie = cookieFrom(res, 'n2f_asid');
  if (!cookie) throw new Error(`admin login ${res.status}`);
  return cookie;
}

/** Đăng nhập storefront (mật khẩu `A.password`) cho khách đã có. */
export async function loginMemberAgain(email: string): Promise<string | undefined> {
  const res = await loginPassword(email, A.password, freshIp());
  return cookieFrom(res, 'n2f_sid');
}

const FORBIDDEN_IN_RESPONSE = ['password_hash', 'passwordHash', 'refresh_token_hash', 'tokenHash', 'ip_address', 'ipAddress', 'user_agent', 'userAgent', 'stack'];
/** AC-USR-21 / T-USR-06: thân phản hồi không chứa trường bí mật, stack, SQL, mã OTP 8 số nhận qua thư. */
export function assertNoSecrets(res: { text: string }): void {
  for (const k of FORBIDDEN_IN_RESPONSE) {
    if (res.text.includes(k)) throw new Error(`response contains forbidden token "${k}"`);
  }
  if (/(SELECT|INSERT|UPDATE)[^"]*FROM/i.test(res.text) || /prisma/i.test(res.text)) throw new Error('response leaks SQL / prisma detail');
  for (const m of mails) {
    const code = /: (\d{8})/.exec(m.text)?.[1];
    if (code && res.text.includes(code)) throw new Error('response contains an OTP code');
  }
}

export const countEvents = (where: Record<string, unknown> = {}) => prisma.accountEvent.count({ where });
export const activeAdmins = () => prisma.user.count({ where: { role: 'admin', isActive: true } });
