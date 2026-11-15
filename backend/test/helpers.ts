import { rm } from 'node:fs/promises';
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
    'TRUNCATE TABLE "sessions", "auth_action_tokens", "auth_rate_limits", "login_attempts", "addresses", "carts", "cart_lines", "orders", "order_items", "order_events", "voucher_redemptions", "order_access_grants", "idempotency_keys", "account_events", "store_settings_events", "order_returns", "order_return_items", "return_photos" RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe('DELETE FROM "users"');
  // Slice 9: dọn kho ảnh riêng tư cục bộ của tiến trình test.
  await rm(process.env.RETURN_PHOTO_LOCAL_DIR!, { recursive: true, force: true });
  await resetStoreSettings();
  mails.length = 0;
  setMailTransport({
    async send(msg) {
      mails.push(msg);
    },
  });
  vi.useRealTimers();
}

/** Slice 8: đưa dòng `store_settings` id 1 (nếu có) về mặc định (thông tin cửa hàng + tham số) để test đổi cài đặt không rò sang test khác. */
export async function resetStoreSettings(): Promise<void> {
  assertLocalTestDb();
  const cols = [
    'legal_name', 'registration_number', 'registration_issuer', 'registration_date', 'address', 'hotline', 'email', 'privacy_email', 'hours',
    'notification_url', 'social_facebook', 'social_instagram', 'social_tiktok', 'social_youtube',
    'max_per_variant', 'max_items_per_order', 'max_cart_lines', 'cart_retention_days', 'shipping_fee', 'free_shipping_threshold', 'cod_max_total',
    'cod_refusal_limit', 'cod_refusal_months', 'cod_open_order_limit', 'bank_hold_minutes', 'delivery_days_min', 'delivery_days_max', 'cutoff_hour',
    'low_stock_default',
  ];
  await prisma.$executeRawUnsafe(`UPDATE "store_settings" SET ${cols.map((c) => `"${c}" = DEFAULT`).join(', ')} WHERE "id" = 1`);
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
      const m = /: (\d{6})\b/.exec(mails[i].text);
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

export const wrongCode = (real: string | undefined) => (real === '000000' ? '111111' : '000000');
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
    const code = /: (\d{6})\b/.exec(m.text)?.[1];
    if (code && res.text.includes(code)) throw new Error('response contains an OTP code');
  }
}

export const countEvents = (where: Record<string, unknown> = {}) => prisma.accountEvent.count({ where });
export const activeAdmins = () => prisma.user.count({ where: { role: 'admin', isActive: true } });

/* ======================= Slice 8: tổng quan, báo cáo, cài đặt, nhật ký ======================= */

import { addCalendarDays as addDaysISO, vnStartOfDay as vnStartISO } from '../src/lib/vn-time';

/** Thời điểm UTC của `HH:mm` (giờ VN) ngày `D + offset` (D = `YYYY-MM-DD` VN). */
export const vnAt = (day: string, offset: number, hhmm = '00:00', sec = 0): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(vnStartISO(addDaysISO(day, offset)).getTime() + ((h * 60 + m) * 60 + sec) * 1000);
};

export interface RevenueLine {
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineDiscount?: number;
}
export interface InsertRevenueOrder {
  deliveredAt: Date | null;
  lines: RevenueLine[];
  method?: 'cod' | 'bank_transfer';
  shippingFee?: number;
  shippingDiscount?: number;
  status?: 'completed' | 'to_receive';
  paymentStatus?: 'paid' | 'pending' | 'refunded' | 'failed' | 'partially_refunded';
  createdAt?: Date;
  userId?: string | null;
  /** Tên / màu / size / SKU chụp trên dòng đơn (mặc định lấy từ biến thể hiện tại). */
  snapshot?: { name?: string };
}

let revSeq = 0;
/** Chèn thẳng đơn `completed` + `paid` + `delivered_at` + dòng đơn (không qua checkout). `lineDiscount` tuỳ ý mỗi dòng. */
export async function insertRevenueOrder(o: InsertRevenueOrder): Promise<{ code: string; id: string }> {
  const code = `N2F2612${String(++revSeq).padStart(6, '0')}`;
  const variants = await prisma.productVariant.findMany({ where: { variant_id: { in: o.lines.map((l) => l.variantId) } }, include: { product: true } });
  const subtotal = o.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const discount = o.lines.reduce((n, l) => n + (l.lineDiscount ?? 0), 0);
  const ship = o.shippingFee ?? 0;
  const shipDisc = o.shippingDiscount ?? 0;
  const delivered = o.deliveredAt;
  const created = o.createdAt ?? new Date((delivered ?? new Date()).getTime() - 4 * 86_400_000);
  const method = o.method ?? 'cod';
  const order = await prisma.order.create({
    data: {
      code, status: o.status ?? 'completed', paymentStatus: o.paymentStatus ?? 'paid', userId: o.userId ?? null, paymentMethod: method,
      email: 'khach@example.com', recipientName: 'Nguyễn Văn A', recipientPhone: '0912345678', provinceCode: '01', wardCode: await firstWard(),
      provinceName: 'Hà Nội', wardName: 'Ba Đình', street: '12 Phố Huế', subtotal, discount, shippingFee: ship, shippingDiscount: shipDisc,
      total: subtotal - discount + ship - shipDisc, estimatedFrom: new Date('2026-11-11'), estimatedTo: new Date('2026-11-13'),
      termsAcceptedAt: created, itemsFingerprint: 'b'.repeat(64), createdAt: created, deliveredAt: delivered,
      ...(o.status === 'to_receive' ? { carrier: 'GHN', trackingNumber: `TRK${revSeq}0000`, activeTrackingNumber: `TRK${revSeq}0000`, handedOverAt: created } : {}),
      items: {
        createMany: {
          data: o.lines.map((l, i) => {
            const v = variants.find((x) => x.variant_id === l.variantId)!;
            return {
              lineNo: i + 1, variantId: v.variant_id, productId: v.productId, productSlug: v.product.slug, name: o.snapshot?.name ?? v.product.name,
              colorName: v.colorName, size: v.size, sku: v.sku, mediaId: v.product.coverMediaId || 'pexels-test-image', unitPrice: l.unitPrice,
              quantity: l.quantity, lineDiscount: l.lineDiscount ?? 0,
            };
          }),
        },
      },
    },
  });
  return { code, id: order.order_id };
}

export interface RevenueFixture {
  D: string;
  p1: { id: string; variantId: string };
  p2: { id: string; variantId: string };
  p3: { id: string; variantId: string };
  codes: Record<'O1' | 'O2' | 'O3' | 'O4' | 'O5' | 'O6' | 'O7' | 'O8' | 'O9', string>;
}

/**
 * Dữ liệu tham chiếu PRD Slice 8 mục 5 (D = ngày VN hôm nay). Đơn tính doanh thu: O1 (giao D 10:00, hàng 900.000 sau giảm 100.000, ship 30.000),
 * O2 (giao D-1 23:30, chuyển khoản, 1.000.000), O3 (giao D 00:00:00, 300.000, ship 30.000), O8 (giao D-8, 2.000.000).
 * Khác: O4 `to_ship` COD cần gọi (đặt D), O5 `cancelled` (đặt D), O6 `to_pay` (đặt D), O7 `to_receive` hạn D-1 (đặt D-3), O9 `completed` nhưng `refunded` (giao D).
 * P1, P2 danh mục "tops" (Áo), P3 "bottoms" (Quần).
 */
export async function makeRevenueFixtures(D = '2026-11-12'): Promise<RevenueFixture> {
  const mk = async (name: string, category: string, sku: string) => {
    const p = await makeProduct({ name, category, status: 'ACTIVE', price: 500_000, variants: [{ sku, qty: 50 }] });
    return { id: p.id, variantId: p.variants[0].id };
  };
  const p1 = await mk('Áo P1', 'tops', 'P8-P1-S');
  const p2 = await mk('Áo P2', 'tops', 'P8-P2-S');
  const p3 = await mk('Quần P3', 'bottoms', 'P8-P3-S');
  const O1 = await insertRevenueOrder({
    deliveredAt: vnAt(D, 0, '10:00'), shippingFee: 30_000,
    lines: [{ variantId: p1.variantId, quantity: 1, unitPrice: 500_000, lineDiscount: 50_000 }, { variantId: p2.variantId, quantity: 1, unitPrice: 500_000, lineDiscount: 50_000 }],
  });
  const O2 = await insertRevenueOrder({ deliveredAt: vnAt(D, -1, '23:30'), method: 'bank_transfer', lines: [{ variantId: p2.variantId, quantity: 2, unitPrice: 500_000 }] });
  const O3 = await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '00:00'), shippingFee: 30_000, lines: [{ variantId: p3.variantId, quantity: 1, unitPrice: 300_000 }] });
  const O8 = await insertRevenueOrder({ deliveredAt: vnAt(D, -8, '12:00'), lines: [{ variantId: p1.variantId, quantity: 4, unitPrice: 500_000 }] });
  const O9 = await insertRevenueOrder({ deliveredAt: vnAt(D, 0, '09:00'), paymentStatus: 'refunded', lines: [{ variantId: p1.variantId, quantity: 1, unitPrice: 500_000 }] });
  const items = [{ variantId: p1.variantId, quantity: 1 }];
  const O4 = await makeOrder({ status: 'to_ship', needsCall: true, createdAt: vnAt(D, 0, '09:00'), items });
  const O5 = await makeOrder({ status: 'cancelled', createdAt: vnAt(D, 0, '09:30'), items, data: { cancelledAt: vnAt(D, 0, '10:30'), cancelledBy: 'customer' } });
  const O6 = await makeOrder({ status: 'to_pay', paymentMethod: 'bank_transfer', createdAt: vnAt(D, 0, '09:45'), items, data: { paymentDueAt: vnAt(D, 0, '23:00') } });
  const O7 = await makeOrder({
    status: 'to_receive', createdAt: vnAt(D, -3, '09:00'), items,
    data: { carrier: 'GHN', trackingNumber: 'TRK70001', activeTrackingNumber: 'TRK70001', handedOverAt: vnAt(D, -2, '09:00'), estimatedTo: new Date(`${addDaysISO(D, -1)}T00:00:00.000Z`) },
  });
  return { D, p1, p2, p3, codes: { O1: O1.code, O2: O2.code, O3: O3.code, O4: O4.code, O5: O5.code, O6: O6.code, O7: O7.code, O8: O8.code, O9: O9.code } };
}

/** Gọi API admin Slice 8 (không tiền tố /api/admin: truyền đường dẫn đầy đủ sau /api/admin). */
export const iGet = (path: string, cookie?: string) => get(`/api/admin${path}`, { cookie, ip: freshIp() });
export const iPut = (path: string, body: unknown, cookie?: string) => put(`/api/admin${path}`, body, { cookie, ip: freshIp() });

/* ======================= Slice 9: trả hàng ======================= */

import { computeReturnAmount } from '../src/modules/returns/return-amount';
import { encryptAccountNumber, last4Of } from '../src/modules/returns/account-secret';
import { faultOf, type ReturnReason, type ReturnState } from '../src/modules/returns/return-rules';
import { randomUUID } from 'node:crypto';

export interface InsertReturnOpts {
  orderId: string;
  state?: ReturnState;
  reason?: ReturnReason;
  /** Mặc định: mọi dòng đơn, đủ số lượng. `accepted` mặc định = quantity khi state đã `received` / `refunded`. */
  lines?: Array<{ variantId: string; quantity: number; accepted?: number; disposition?: 'restock' | 'writeoff' }>;
  requestedAt?: Date;
  requestedBy?: string | null;
  detail?: string;
  /** Tài khoản nhận hoàn (đơn COD). Số đầy đủ chỉ được lưu khi state còn `requested` / `approved` / `received`. */
  account?: { bank: string; number: string; name: string };
  actorId?: string | null;
  rejectNote?: string;
  refundReference?: string;
}

const FINAL_STATES: readonly ReturnState[] = ['received', 'refunded'];

/** Chèn THẲNG yêu cầu trả hàng theo trạng thái (không qua API): số tiền theo `computeReturnAmount`, `amount_final` khi đã `received`. */
export async function insertReturn(o: InsertReturnOpts): Promise<{ id: string; amount: number }> {
  const state = o.state ?? 'requested';
  const reason = o.reason ?? 'wrong-size';
  const fault = faultOf(reason);
  const order = await prisma.order.findUniqueOrThrow({ where: { order_id: o.orderId }, include: { items: true } });
  const chosen: NonNullable<InsertReturnOpts['lines']> = o.lines ?? order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  const byVariant = new Map(order.items.map((i) => [i.variantId, i]));
  const final = FINAL_STATES.includes(state);
  const qty = new Map<string, number>();
  for (const l of chosen) {
    const item = byVariant.get(l.variantId)!;
    qty.set(item.order_item_id, final ? (l.accepted ?? l.quantity) : l.quantity);
  }
  const amt = computeReturnAmount({
    orderLines: order.items.map((i) => ({ orderItemId: i.order_item_id, unitPrice: i.unitPrice, quantity: i.quantity, lineDiscount: i.lineDiscount })),
    qtyByItem: qty, fault, shippingFee: order.shippingFee, shippingDiscount: order.shippingDiscount,
  });
  const at = o.requestedAt ?? new Date();
  const later = (min: number) => new Date(at.getTime() + min * 60_000);
  const id = randomUUID();
  const keepsSecret = state === 'requested' || state === 'approved' || state === 'received';
  const stepAt = state === 'requested' || state === 'cancelled' ? {} : { approvedAt: later(10), approvedBy: o.actorId ?? null };
  await prisma.orderReturn.create({
    data: {
      return_id: id, orderId: o.orderId, activeOrderId: state === 'cancelled' ? null : o.orderId, state, reason, fault, detail: o.detail ?? 'Mô tả lỗi của sản phẩm',
      conditionAck: fault === 'customer', requestedVia: 'member', requestedBy: o.requestedBy ?? order.userId, requestedAt: at,
      ...(state === 'rejected'
        ? { approvedAt: null, approvedBy: null, rejectedAt: later(20), rejectedBy: o.actorId ?? null, rejectNote: o.rejectNote ?? 'Sản phẩm đã qua sử dụng' }
        : stepAt),
      ...(final ? { receivedAt: later(60), receivedBy: o.actorId ?? null, receiveNote: null } : {}),
      ...(state === 'refunded' ? { refundedAt: later(120), refundedBy: o.actorId ?? null, refundReference: o.refundReference ?? 'CK-TEST-0001' } : {}),
      ...(state === 'cancelled' ? { cancelledAt: later(5) } : {}),
      goodsAmount: amt.goodsAmount, shippingRefund: amt.shippingRefund, returnShippingFee: amt.returnShippingFee, amount: amt.amount, amountFinal: final,
      ...(o.account
        ? {
            bankName: o.account.bank, accountLast4: last4Of(o.account.number), accountName: o.account.name,
            accountNumberEnc: keepsSecret ? encryptAccountNumber(o.account.number, id) : null,
          }
        : {}),
      items: {
        create: chosen.map((l) => {
          const item = byVariant.get(l.variantId)!;
          const acc = final ? (l.accepted ?? l.quantity) : null;
          return {
            orderItemId: item.order_item_id, quantity: l.quantity, acceptedQuantity: acc,
            disposition: acc && acc > 0 ? (l.disposition ?? 'restock') : null, goodsAmount: amt.lines.get(item.order_item_id) ?? 0,
          };
        }),
      },
    },
  });
  return { id, amount: amt.amount };
}

/** Ảnh trả hàng tối thiểu hợp lệ (JPEG 400x400) để tải lên. */
export const makeReturnPhoto = (w = 400, h = 400): Buffer => makeJpeg(w, h);

export interface ReturnFixture {
  D: string;
  M: Awaited<ReturnType<typeof loginMember>>;
  N: Awaited<ReturnType<typeof loginMember>>;
  v1: string;
  v2: string;
  v3: string;
  R: Record<'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8', { code: string; id: string }>;
}

/**
 * Dữ liệu tham chiếu PRD Slice 9 (D = ngày VN hôm nay): V1 (áo, tồn 7), V2 (quần, tồn 4), V3 (tồn 10); thành viên M, N.
 * R1 (M) L1 = V1 500.000 x 2 giảm 100.000, L2 = V2 300.000 x 1, giao D-5 10:00 (total 1.200.000); R2 (M) áo 400.000 ship 30.000, giao D-30 08:00;
 * R3 như R2 giao D-31 10:00; R4 (M) `to_receive`; R5 (M) V3 400.000 x 3 giảm 200.000, giao D-2; R6 (M) 25.000 ship 30.000, giao D-1;
 * R7 (khách vãng lai) như R2 giao D-3; R8 (M) như R2 chuyển khoản, giao D-3.
 */
export async function makeReturnFixtures(D = '2026-11-12'): Promise<ReturnFixture> {
  const mk = async (name: string, sku: string, qty: number) => (await makeProduct({ name, category: 'tops', status: 'ACTIVE', price: 400_000, variants: [{ sku, qty }] })).variants[0].id;
  const v1 = await mk('Áo V1', 'RET-V1', 7);
  const v2 = await mk('Quần V2', 'RET-V2', 4);
  const v3 = await mk('Áo V3', 'RET-V3', 10);
  const M = await loginMember(`m-ret${++memberSeq}@example.com`);
  const N = await loginMember(`n-ret${++memberSeq}@example.com`);
  const R1 = await insertRevenueOrder({
    deliveredAt: vnAt(D, -5, '10:00'), userId: M.user.user_id,
    lines: [{ variantId: v1, quantity: 2, unitPrice: 500_000, lineDiscount: 100_000 }, { variantId: v2, quantity: 1, unitPrice: 300_000 }],
  });
  const one = (deliveredAt: Date | null, o: Partial<InsertRevenueOrder> = {}) =>
    insertRevenueOrder({ deliveredAt, userId: M.user.user_id, shippingFee: 30_000, lines: [{ variantId: v1, quantity: 1, unitPrice: 400_000 }], ...o });
  const R2 = await one(vnAt(D, -30, '08:00'));
  const R3 = await one(vnAt(D, -31, '10:00'));
  const R4 = await one(null, { status: 'to_receive', paymentStatus: 'pending' });
  const R5 = await insertRevenueOrder({ deliveredAt: vnAt(D, -2, '10:00'), userId: M.user.user_id, lines: [{ variantId: v3, quantity: 3, unitPrice: 400_000, lineDiscount: 200_000 }] });
  const R6 = await insertRevenueOrder({ deliveredAt: vnAt(D, -1, '10:00'), userId: M.user.user_id, shippingFee: 30_000, lines: [{ variantId: v2, quantity: 1, unitPrice: 25_000 }] });
  const R7 = await one(vnAt(D, -3, '10:00'), { userId: null });
  const R8 = await one(vnAt(D, -3, '11:00'), { method: 'bank_transfer' });
  return { D, M, N, v1, v2, v3, R: { R1, R2, R3, R4, R5, R6, R7, R8 } };
}

/** `POST /account/orders/{code}/return` bằng cookie thành viên; khoá mặc định mới mỗi lần. */
export const createReturnReq = (cookie: string | undefined, code: string, body: unknown, key: string | null = newKey(), ip: string = freshIp()) =>
  post(`/api/account/orders/${code}/return`, body, { cookie, ip, headers: key === null ? {} : { 'Idempotency-Key': key } });

/** `POST /account/return-photos` (byte thô). */
export function uploadMyPhoto(cookie: string | undefined, body: Buffer | string, contentType = 'application/octet-stream', ip: string = freshIp()) {
  const r = request(app).post('/api/account/return-photos');
  r.set('X-Forwarded-For', ip).set('Origin', ORIGIN).set('X-Requested-With', 'n2f').set('Content-Type', contentType);
  if (cookie) r.set('Cookie', cookie);
  return r.send(body);
}

/** Tải một ảnh hợp lệ và trả id. */
export async function uploadOkPhoto(cookie: string, w = 400, h = 400): Promise<string> {
  const r = await uploadMyPhoto(cookie, makeReturnPhoto(w, h), 'image/jpeg');
  if (r.status !== 201) throw new Error(`upload photo ${r.status}`);
  return r.body.id as string;
}

/** Số tài khoản mẫu: không được xuất hiện ở bất kỳ nơi nào ngoài kênh admin `received` (assertNoSecrets). */
export const SEED_ACCOUNT = { bank: 'Vietcombank', accountNumber: '1234567890', accountName: 'NGUYEN VAN A' };

/** Phản hồi (ngoài admin `received` của admin) không chứa bản mã, tên cột bản mã hay số tài khoản mẫu. */
export function assertNoAccountSecrets(res: { text: string }): void {
  assertNoSecrets(res);
  for (const k of ['account_number_enc', 'accountNumberEnc', SEED_ACCOUNT.accountNumber]) {
    if (res.text.includes(k)) throw new Error(`response contains forbidden token "${k}"`);
  }
}
