/**
 * DỮ LIỆU DEMO CHO ADMIN (2026-11-15) – chỉ dùng trên DB dev cục bộ.
 *
 *   npx tsx scripts/seed-demo-analytics.ts            # gỡ bản demo cũ (nếu có) rồi seed lại
 *   npx tsx scripts/seed-demo-analytics.ts --remove   # chỉ gỡ sạch dữ liệu demo
 *
 * Sinh ~90 ngày hoạt động: khách (thành viên + vãng lai), ~450 đơn đủ trạng thái và mốc thời gian, voucher và lượt dùng,
 * trả hàng, đánh giá, wishlist, giỏ bỏ dở, lịch sử điều chỉnh tồn kho. Dùng sản phẩm / biến thể đang có, đúng giá.
 * Tất định (cùng một hạt giống) nên chạy lại cho cùng bộ số (lệch theo ngày chạy).
 *
 * Đánh dấu để gỡ: email `@demo.nine2fine.local`, mã đơn `N2F99xxxxxxxx`, voucher `DEMO*`, ghi chú tồn kho `[demo-seed]`.
 * Không đụng tài khoản admin / nhân viên / khách thật và đơn thật. Tồn kho: khi gỡ, cộng / trừ ngược đúng phần demo đã đổi.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { encryptAccountNumber, last4Of } from '../src/modules/returns/account-secret';

const DEMO_BANKS = ['Vietcombank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'BIDV', 'VietinBank', 'TPBank'];
/** "Nguyễn Văn An" -> "NGUYEN VAN AN" (tên chủ tài khoản ngân hàng viết hoa không dấu). */
const toAccountName = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().slice(0, 50);

const prisma = new PrismaClient();
const DOMAIN = 'demo.nine2fine.local';
const CODE_PREFIX = 'N2F99';
const NOTE = '[demo-seed]';
const DAYS = 90;
/**
 * Ảnh chụp tồn kho trước / sau khi seed (ngoài repo). Khi gỡ: tồn = trước + (hiện tại - sau), nên giữ đúng mọi thay đổi
 * thật xảy ra sau khi seed. Không có file thì gỡ theo sổ (đơn demo, hàng trả, điều chỉnh demo).
 */
const SNAPSHOT = process.env.DEMO_SEED_SNAPSHOT ?? path.join(homedir(), 'nine2fine-backups', 'demo-seed-inventory.json');
type Snapshot = { before: Record<string, number>; after: Record<string, number> };
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---------- RNG tất định ----------
let seed = 20261115;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
function weighted<T>(items: readonly T[], weight: (x: T) => number): T {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let r = rand() * total;
  for (const x of items) {
    r -= weight(x);
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}
const chance = (p: number) => rand() < p;

/** Ngày VN (YYYY-MM-DD) của một thời điểm UTC. */
const vnDay = (d: Date) => new Date(d.getTime() + 7 * HOUR).toISOString().slice(0, 10);
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// ---------- Tên, nội dung ----------
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MID_F = ['Thị', 'Ngọc', 'Thanh', 'Minh', 'Thu', 'Phương', 'Khánh', 'Bảo'];
const MID_M = ['Văn', 'Minh', 'Quốc', 'Đức', 'Gia', 'Hoàng', 'Thành', 'Anh'];
const FIRST_F = ['Linh', 'Trang', 'Hà', 'Mai', 'Anh', 'Ngân', 'Vy', 'Thảo', 'Hương', 'My', 'Chi', 'Quỳnh', 'Hân', 'Nhi', 'Uyên', 'Tâm'];
const FIRST_M = ['Huy', 'Nam', 'Khoa', 'Long', 'Tuấn', 'Phúc', 'Duy', 'Bảo', 'Quân', 'Hiếu', 'Đạt', 'Trung'];
const STREETS = ['Nguyễn Trãi', 'Lê Lợi', 'Hai Bà Trưng', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Trần Hưng Đạo', 'Lý Thường Kiệt', 'Phan Xích Long', 'Võ Văn Tần', 'Nguyễn Thị Minh Khai'];
const CARRIERS = [
  ['GHN', 'GHN'],
  ['GHTK', 'GHTK'],
  ['J&T Express', 'JT'],
] as const;
const CUSTOMER_CANCEL = [
  'Tôi không còn nhu cầu mua nữa',
  'Tôi muốn đổi size, màu hoặc sản phẩm khác',
  'Tôi muốn đổi địa chỉ hoặc thông tin nhận hàng',
  'Tôi tìm được nơi bán giá tốt hơn',
];
const REVIEW_TEXT: Record<number, { title: string; body: string }[]> = {
  5: [
    { title: 'Rất ưng ý', body: 'Chất vải mát, form đứng dáng, mặc đi làm cả ngày vẫn thoải mái. Sẽ mua thêm màu khác.' },
    { title: 'Đẹp hơn hình', body: 'Màu ngoài đời đẹp hơn ảnh, đường may chắc chắn, đóng gói cẩn thận. Giao hàng nhanh.' },
    { title: 'Đáng tiền', body: 'Giá hợp lý so với chất lượng, mặc lên rất sang. Đồng nghiệp hỏi mua ở đâu luôn.' },
  ],
  4: [
    { title: 'Ổn, sẽ ủng hộ tiếp', body: 'Sản phẩm đẹp, vải dày dặn. Trừ một sao vì giao hơi lâu so với dự kiến một chút.' },
    { title: 'Khá hài lòng', body: 'Form đẹp, màu đúng mô tả. Hơi nhăn sau khi giặt nhưng ủi lại là ổn ngay.' },
  ],
  3: [{ title: 'Tạm được', body: 'Chất liệu ổn nhưng size hơi lệch so với bảng size, nên chọn lớn hơn một size.' }],
  2: [{ title: 'Chưa như mong đợi', body: 'Màu thực tế nhạt hơn ảnh khá nhiều, đường may ở tay áo chưa được chắc lắm.' }],
  1: [{ title: 'Không hài lòng', body: 'Sản phẩm bị lỗi chỉ ở cổ áo, phải gửi trả lại. Mong shop kiểm tra hàng kỹ hơn.' }],
};
const REPLIES = [
  'Cảm ơn bạn đã tin chọn nine2fine! Hẹn gặp lại bạn ở những bộ sưu tập tiếp theo nhé.',
  'nine2fine cảm ơn góp ý của bạn, shop sẽ cải thiện khâu kiểm tra và giao hàng.',
  'Shop rất tiếc về trải nghiệm này, bộ phận CSKH sẽ liên hệ để hỗ trợ đổi trả cho bạn.',
];

// ---------- Gỡ dữ liệu demo ----------
async function remove(): Promise<void> {
  const snapshot: Snapshot | null = existsSync(SNAPSHOT) ? (JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) as Snapshot) : null;
  await prisma.$transaction(
    async (tx) => {
      if (snapshot) {
        const rows = await tx.$queryRaw<Array<{ variant_id: string; inventory_qty: number }>>`SELECT variant_id, inventory_qty FROM product_variants`;
        for (const r of rows) {
          if (!(r.variant_id in snapshot.before)) continue;
          const qty = Math.max(0, snapshot.before[r.variant_id] + (r.inventory_qty - (snapshot.after[r.variant_id] ?? r.inventory_qty)));
          await tx.$executeRaw`UPDATE product_variants SET inventory_qty = ${qty} WHERE variant_id = ${r.variant_id}::uuid`;
        }
      } else {
      // 1) Trả lại tồn kho mà đơn demo đã trừ: đơn chưa huỷ, hoặc huỷ mà chưa hoàn kho; trừ phần hàng trả đã nhập lại.
      await tx.$executeRaw`
        UPDATE product_variants v SET inventory_qty = v.inventory_qty + d.qty
        FROM (
          SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
          FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
          WHERE o.code LIKE ${CODE_PREFIX + '%'} AND (o.status <> 'cancelled' OR o.stock_restored_at IS NULL)
            AND NOT (o.status = 'cancelled' AND o.returned_from_transit = false)
          GROUP BY oi.variant_id
        ) d WHERE v.variant_id = d.variant_id`;
      await tx.$executeRaw`
        UPDATE product_variants v SET inventory_qty = GREATEST(0, v.inventory_qty - d.qty)
        FROM (
          SELECT oi.variant_id, SUM(ri.accepted_quantity)::int AS qty
          FROM order_return_items ri JOIN order_items oi ON oi.order_item_id = ri.order_item_id
          JOIN orders o ON o.order_id = oi.order_id
          WHERE o.code LIKE ${CODE_PREFIX + '%'} AND ri.disposition = 'restock'
          GROUP BY oi.variant_id
        ) d WHERE v.variant_id = d.variant_id`;
      // 2) Hoàn tác các điều chỉnh tồn kho demo.
      await tx.$executeRaw`
        UPDATE product_variants v SET inventory_qty = GREATEST(0, v.inventory_qty - d.delta)
        FROM (SELECT variant_id, SUM(delta)::int AS delta FROM inventory_adjustments WHERE note LIKE ${NOTE + '%'} GROUP BY variant_id) d
        WHERE v.variant_id = d.variant_id`;
      }
      await tx.$executeRaw`DELETE FROM inventory_adjustments WHERE note LIKE ${NOTE + '%'}`;
      // 3) Lượt dùng voucher của đơn demo (giảm used_count của voucher thật), voucher demo.
      await tx.$executeRaw`
        UPDATE vouchers vo SET used_count = GREATEST(0, vo.used_count - d.n)
        FROM (
          SELECT r.voucher_id, COUNT(*)::int AS n FROM voucher_redemptions r JOIN orders o ON o.order_id = r.order_id
          WHERE o.code LIKE ${CODE_PREFIX + '%'} AND r.released_at IS NULL GROUP BY r.voucher_id
        ) d WHERE vo.voucher_id = d.voucher_id`;
      await tx.$executeRaw`DELETE FROM voucher_redemptions r USING orders o WHERE o.order_id = r.order_id AND o.code LIKE ${CODE_PREFIX + '%'}`;
      // 4) Đánh giá, wishlist, giỏ của khách demo; đơn demo (cascade: dòng đơn, sự kiện, trả hàng); khách demo.
      await tx.$executeRaw`DELETE FROM product_reviews WHERE order_id IN (SELECT order_id FROM orders WHERE code LIKE ${CODE_PREFIX + '%'})
        OR user_id IN (SELECT user_id FROM users WHERE email LIKE ${'%@' + DOMAIN})`;
      await tx.$executeRaw`DELETE FROM orders WHERE code LIKE ${CODE_PREFIX + '%'}`;
      await tx.$executeRaw`DELETE FROM vouchers WHERE code LIKE 'DEMO%' AND NOT EXISTS (SELECT 1 FROM voucher_redemptions r WHERE r.voucher_id = vouchers.voucher_id)`;
      await tx.$executeRaw`DELETE FROM wishlist_items WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE ${'%@' + DOMAIN})`;
      await tx.$executeRaw`DELETE FROM carts WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE ${'%@' + DOMAIN})`;
      await tx.$executeRaw`DELETE FROM addresses WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE ${'%@' + DOMAIN})`;
      await tx.$executeRaw`DELETE FROM users WHERE email LIKE ${'%@' + DOMAIN}`;
    },
    { timeout: 120_000 },
  );
  if (snapshot) rmSync(SNAPSHOT);
}

// ---------- Seed ----------
interface Variant {
  id: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  color: string;
  size: string;
  price: number;
  media: string;
  categoryId: string;
  stock: number;
  popularity: number;
}

async function seedDemo(): Promise<Record<string, number>> {
  const now = new Date();
  const today = vnDay(now);
  const staff = await prisma.user.findMany({ where: { role: { in: ['staff', 'admin'] }, isActive: true } });
  if (!staff.length) throw new Error('Cần ít nhất một tài khoản nhân viên / quản trị để ghi người thao tác.');
  const admin = staff.find((u) => u.role === 'admin') ?? staff[0];
  const actorOf = () => {
    const u = pick(staff);
    return { id: u.user_id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role };
  };

  const products = await prisma.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true } });
  if (!products.length) throw new Error('Chưa có sản phẩm đang bán.');
  const POP: Record<string, number> = {
    'off-duty-top': 3.2, 'weekend-shirt': 2.6, 'nine-to-fine-shirt': 2.4, 'the-straight-trousers': 2.0,
    'the-midi-skirt': 1.6, 'after-hours-dress': 1.3, 'city-vest': 0.9, 'the-everyday-blazer': 0.8,
  };
  const SIZE_POP: Record<string, number> = { S: 1.1, M: 1.6, L: 1.1, XL: 0.5 };
  const variants: Variant[] = products.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.variant_id, productId: p.product_id, slug: p.slug, name: p.name, sku: v.sku, color: v.colorName, size: v.size,
      price: Number(p.price), media: p.coverMediaId, categoryId: p.categoryId, stock: v.inventoryQty,
      popularity: (POP[p.slug] ?? 1) * (SIZE_POP[v.size] ?? 1) * (v.sortOrder % 2 ? 0.8 : 1.1),
    })),
  );
  const before = Object.fromEntries(variants.map((v) => [v.id, v.stock]));

  const provinces = await prisma.$queryRaw<Array<{ code: string; name: string; ward: string; wname: string }>>`
    SELECT p.province_code AS code, p.name,
      (SELECT w.ward_code FROM wards w WHERE w.province_code = p.province_code ORDER BY w.ward_code LIMIT 1) AS ward,
      (SELECT w.name FROM wards w WHERE w.province_code = p.province_code ORDER BY w.ward_code LIMIT 1) AS wname
    FROM provinces p`;
  const provWeight = (p: { name: string }) =>
    /Hồ Chí Minh/.test(p.name) ? 34 : /Hà Nội/.test(p.name) ? 24 : /Đà Nẵng/.test(p.name) ? 7 : /Hải Phòng|Cần Thơ/.test(p.name) ? 4 : /Khánh Hòa|Đồng Nai|Lâm Đồng|Huế/.test(p.name) ? 2.5 : 1;
  const usable = provinces.filter((p) => p.ward);

  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  // --- Nhập hàng đầu kỳ (lịch sử tồn kho) ---
  const adjustments: Prisma.InventoryAdjustmentCreateManyInput[] = [];
  const restockAt = new Date(now.getTime() - (DAYS + 1) * DAY + 9 * HOUR);
  for (const v of variants) {
    const add = Math.round(8 + v.popularity * 7);
    v.stock += add;
    const a = actorOf();
    adjustments.push({ variantId: v.id, at: restockAt, delta: add, availableAfter: v.stock, reason: 'received', note: `${NOTE} Nhập hàng đầu mùa`, actorUserId: a.id, actorName: a.name, actorRole: a.role });
  }
  const midRestock = new Date(now.getTime() - 40 * DAY + 10 * HOUR);
  let midDone = false;

  // --- Khách ---
  const customers: { id: string; email: string; name: string; phone: string; gender: string; createdAt: Date; weight: number; province: (typeof usable)[number]; street: string }[] = [];
  const phoneOf = (i: number) => `0${pick(['3', '7', '8', '9'])}${String(10_000_000 + i * 7919).slice(-8)}`;
  for (let i = 0; i < 95; i++) {
    const female = chance(0.72);
    const last = pick(LAST);
    const mid = pick(female ? MID_F : MID_M);
    const first = pick(female ? FIRST_F : FIRST_M);
    const createdAt = new Date(now.getTime() - int(0, 200) * DAY - int(0, 23) * HOUR);
    const email = `khach${String(i + 1).padStart(3, '0')}@${DOMAIN}`;
    const optIn = chance(0.45);
    const u = await prisma.user.create({
      data: {
        email, firstName: first, lastName: `${last} ${mid}`, gender: female ? 'female' : 'male', role: 'member',
        phone_number: phoneOf(i), dateOfBirth: dateOnly(`${int(1984, 2004)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`),
        marketingOptIn: optIn, marketingOptInAt: optIn ? createdAt : null, terms_accepted_at: createdAt, createdAt, updatedAt: createdAt,
      },
    });
    customers.push({
      id: u.user_id, email, name: `${last} ${mid} ${first}`, phone: u.phone_number!, gender: u.gender!, createdAt,
      weight: weightedLoyalty(), province: weighted(usable, provWeight), street: `${int(2, 280)} ${pick(STREETS)}`,
    });
  }
  bump('khách thành viên', customers.length);
  function weightedLoyalty() {
    const r = rand();
    return r < 0.15 ? 5 : r < 0.4 ? 2.2 : 1;
  }

  // --- Voucher demo ---
  const vWelcome = await prisma.voucher.findUnique({ where: { code: 'N2FWELCOME15' } });
  const vFreeShip = await prisma.voucher.findUnique({ where: { code: 'N2FFREESHIP' } });
  const vFixed = await prisma.voucher.create({
    data: { code: 'DEMOSALE50K', name: 'Giảm 50.000 ₫ đơn từ 600.000 ₫ (demo)', kind: 'fixed', value: 50_000, minSubtotal: 600_000, perUserLimit: 3, startsAt: new Date(now.getTime() - 60 * DAY), endsAt: new Date(now.getTime() + 30 * DAY) },
  });
  const vPct = await prisma.voucher.create({
    data: { code: 'DEMOMIDSEASON10', name: 'Giữa mùa giảm 10% tối đa 120.000 ₫ (demo)', kind: 'percent', value: 10, maxDiscount: 120_000, minSubtotal: 400_000, perUserLimit: 2, startsAt: new Date(now.getTime() - 35 * DAY), endsAt: new Date(now.getTime() + 10 * DAY) },
  });
  bump('voucher demo', 2);

  // --- Đơn ---
  let seq = 0;
  const createdOrders: { id: string; code: string; status: string; userId: string | null; email: string; phone: string; deliveredAt: Date | null; lines: { id: string; variant: Variant; qty: number; amount: number }[]; method: string }[] = [];
  const voucherUses = new Map<string, number>();
  const HOUR_W = [0.3, 0.15, 0.1, 0.05, 0.05, 0.1, 0.3, 0.6, 0.9, 1.1, 1.2, 1.5, 1.7, 1.4, 1.0, 0.9, 1.0, 1.1, 1.3, 1.8, 2.3, 2.5, 2.0, 1.0];
  const hours = HOUR_W.map((w, h) => ({ h, w }));

  for (let ago = DAYS - 1; ago >= 0; ago--) {
    const dayIso = addDaysIso(today, -ago);
    const dow = new Date(`${dayIso}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 0.75 + (DAYS - ago) / DAYS * 0.55;
    let n = Math.round((3.3 + rand() * 2.6) * trend * (weekend ? 1.35 : 1));
    if (!midDone && ago <= 40) {
      midDone = true;
      for (const v of variants.filter((x) => x.popularity > 2)) {
        const add = 15;
        v.stock += add;
        const a = actorOf();
        adjustments.push({ variantId: v.id, at: midRestock, delta: add, availableAfter: v.stock, reason: 'received', note: `${NOTE} Nhập thêm mẫu bán chạy`, actorUserId: a.id, actorName: a.name, actorRole: a.role });
      }
    }
    for (let k = 0; k < n; k++) {
      const h = weighted(hours, (x) => x.w).h;
      // giờ VN -> UTC
      let createdAt = new Date(Date.parse(`${dayIso}T00:00:00Z`) - 7 * HOUR + h * HOUR + int(0, 59) * MIN + int(0, 59) * 1000);
      if (createdAt > now) {
        if (ago === 0) createdAt = new Date(now.getTime() - int(5, 240) * MIN);
        else continue;
      }
      const known = customers.filter((c) => c.createdAt <= createdAt);
      const cust = known.length && chance(0.66) ? weighted(known, (c) => c.weight) : undefined;
      const guestFemale = chance(0.7);
      const guestName = `${pick(LAST)} ${pick(guestFemale ? MID_F : MID_M)} ${pick(guestFemale ? FIRST_F : FIRST_M)}`;
      const gi = int(1, 160);
      const email = cust?.email ?? `vanglai${String(gi).padStart(3, '0')}@${DOMAIN}`;
      const name = cust?.name ?? guestName;
      const phone = cust?.phone ?? phoneOf(500 + gi);
      const prov = cust?.province ?? weighted(usable, provWeight);
      const street = cust?.street ?? `${int(2, 280)} ${pick(STREETS)}`;

      // dòng hàng
      const nLines = weighted([1, 2, 3], (x) => (x === 1 ? 6 : x === 2 ? 3 : 1));
      const lines: { variant: Variant; qty: number }[] = [];
      for (let l = 0; l < nLines; l++) {
        const candidates = variants.filter((v) => v.stock > 0 && !lines.some((x) => x.variant.id === v.id));
        if (!candidates.length) break;
        const v = weighted(candidates, (x) => x.popularity);
        const qty = Math.min(v.stock, chance(0.12) ? 2 : 1);
        lines.push({ variant: v, qty });
      }
      if (!lines.length) continue;
      const subtotal = lines.reduce((s, l) => s + l.variant.price * l.qty, 0);

      // trạng thái theo tuổi đơn
      const method: 'cod' | 'bank_transfer' = chance(0.68) ? 'cod' : 'bank_transfer';
      const r = rand();
      type St = 'completed' | 'to_receive' | 'to_ship' | 'to_pay' | 'cancel_requested' | 'cancelled';
      let status: St;
      if (ago >= 7) status = r < 0.86 ? 'completed' : 'cancelled';
      else if (ago >= 4) status = r < 0.55 ? 'completed' : r < 0.86 ? 'to_receive' : r < 0.94 ? 'cancelled' : 'to_ship';
      else if (ago >= 1) status = r < 0.12 ? 'completed' : r < 0.5 ? 'to_receive' : r < 0.86 ? 'to_ship' : r < 0.93 ? 'cancelled' : 'cancel_requested';
      else status = r < 0.62 ? 'to_ship' : r < 0.82 ? (method === 'bank_transfer' ? 'to_pay' : 'to_ship') : r < 0.9 ? 'cancel_requested' : 'cancelled';
      if (status === 'to_pay' && method !== 'bank_transfer') status = 'to_ship';

      // voucher
      let voucher: typeof vFixed | null = null;
      const vr = rand();
      if (vr < 0.07 && vWelcome) voucher = vWelcome;
      else if (vr < 0.13 && subtotal >= 600_000) voucher = vFixed;
      else if (vr < 0.19 && subtotal >= 400_000 && ago <= 35) voucher = vPct;
      let discount = 0;
      if (voucher?.kind === 'percent') discount = Math.min(Math.round((subtotal * (voucher.value ?? 0)) / 100 / 1000) * 1000, voucher.maxDiscount ?? Infinity);
      if (voucher?.kind === 'fixed') discount = voucher.value ?? 0;
      discount = Math.min(discount, subtotal);
      const shippingFee = 30_000;
      let freeShip = subtotal - discount >= 1_000_000;
      let shipVoucher = false;
      if (!freeShip && vFreeShip && subtotal >= 300_000 && chance(0.12)) {
        freeShip = true;
        shipVoucher = true;
      }
      const shippingDiscount = freeShip ? shippingFee : 0;
      const total = subtotal - discount + shippingFee - shippingDiscount;
      // chia giảm giá xuống từng dòng (doanh thu tính theo dòng)
      let left = discount;
      const lineDiscounts = lines.map((l, i) => {
        if (i === lines.length - 1) return left;
        const share = Math.floor((discount * l.variant.price * l.qty) / subtotal);
        left -= share;
        return share;
      });

      // mốc thời gian
      const estFrom = addDaysIso(vnDay(createdAt), 2);
      const estTo = addDaysIso(vnDay(createdAt), 4);
      const needsCall = method === 'cod' && chance(0.55);
      const confirmedAt = new Date(createdAt.getTime() + int(8, needsCall ? 300 : 90) * MIN);
      const handedOverAt = new Date(confirmedAt.getTime() + int(3, 28) * HOUR);
      const late = chance(0.13);
      const deliveredAt = new Date(handedOverAt.getTime() + (late ? int(4, 6) : int(1, 3)) * DAY + int(0, 10) * HOUR);
      const carrier = pick(CARRIERS);
      const code = `${CODE_PREFIX}${String(++seq).padStart(8, '0')}`;
      const tracking = `${carrier[1]}${code.slice(3)}`;

      const data: Prisma.OrderUncheckedCreateInput = {
        code, userId: cust?.id ?? null, status: 'to_ship', paymentStatus: 'pending', paymentMethod: method, email, recipientName: name, recipientPhone: phone,
        provinceCode: prov.code, wardCode: prov.ward, provinceName: prov.name, wardName: prov.wname, street,
        subtotal, discount, shippingFee, shippingDiscount, total,
        discountVoucherCode: voucher?.code ?? null, shippingVoucherCode: shipVoucher ? vFreeShip!.code : null,
        estimatedFrom: dateOnly(estFrom), estimatedTo: dateOnly(estTo), needsConfirmCall: needsCall,
        termsAcceptedAt: createdAt, itemsFingerprint: 'd'.repeat(64), createdAt, confirmationEmailSentAt: createdAt,
      };
      const events: Prisma.OrderEventCreateManyOrderInput[] = [
        { at: createdAt, toStatus: method === 'bank_transfer' ? 'to_pay' : 'to_ship', paymentStatus: 'pending', actor: 'customer', kind: 'placed' },
      ];
      const shop = actorOf();
      const shopEv = (at: Date, from: string, to: string, pay: string, kind: string, extra: Partial<Prisma.OrderEventCreateManyOrderInput> = {}) =>
        events.push({ at, fromStatus: from as never, toStatus: to as never, paymentStatus: pay as never, actor: 'shop', kind: kind as never, actorUserId: shop.id, actorName: shop.name, actorRole: shop.role, ...extra });
      const paidBank = new Date(createdAt.getTime() + int(3, 40) * MIN);
      let deducted = true;

      if (status === 'to_pay') {
        Object.assign(data, { status: 'to_pay', paymentDueAt: new Date(now.getTime() + int(30, 150) * MIN) });
      } else if (status === 'cancelled') {
        let kind = weighted(['customer', 'unreachable', 'declined', 'expired', 'refused', 'refusedPending'] as const, (x) =>
          ({ customer: 4, unreachable: 2, declined: 1.5, expired: method === 'bank_transfer' ? 2 : 0, refused: method === 'cod' ? 1.6 : 0, refusedPending: method === 'cod' && ago <= 6 ? 0.8 : 0 })[x]);
        if ((kind === 'refused' || kind === 'refusedPending') && handedOverAt.getTime() > now.getTime() - DAY) kind = 'unreachable';
        if (kind === 'unreachable' || kind === 'declined') {
          if (method !== 'cod') kind = 'customer';
        }
        const cancelledAt = new Date(Math.min(now.getTime() - 5 * MIN, createdAt.getTime() + int(20, 600) * MIN));
        Object.assign(data, { status: 'cancelled', cancelledAt, paymentStatus: method === 'bank_transfer' && kind !== 'expired' ? 'refunded' : 'pending' });
        if (kind === 'customer') Object.assign(data, { cancelledBy: 'customer', cancelReason: pick(CUSTOMER_CANCEL) });
        else if (kind === 'expired') Object.assign(data, { cancelledBy: 'system', cancelReason: 'Quá hạn thanh toán chuyển khoản', paymentStatus: 'failed' });
        else if (kind === 'unreachable') Object.assign(data, { cancelledBy: 'shop', cancelReasonCode: 'unreachable', cancelReason: 'Gọi 3 lần không liên lạc được' });
        else if (kind === 'declined') Object.assign(data, { cancelledBy: 'shop', cancelReasonCode: 'declined_on_call', cancelReason: 'Khách từ chối khi gọi xác nhận' });
        else {
          // khách từ chối nhận COD: đã bàn giao, hàng hoàn về kho
          const refusedAt = new Date(handedOverAt.getTime() + int(2, 4) * DAY);
          Object.assign(data, {
            cancelledBy: 'shop', cancelReasonCode: 'refused', cancelReason: 'Khách từ chối nhận hàng', cancelledAt: refusedAt, deliveryRefusedAt: refusedAt,
            confirmedAt, confirmedBy: shop.id, carrier: carrier[0], trackingNumber: tracking, handedOverAt, handedOverBy: shop.id, returnedFromTransit: true,
          });
          if (kind === 'refused' && refusedAt.getTime() + DAY < now.getTime()) {
            Object.assign(data, { returnHandledAt: new Date(refusedAt.getTime() + DAY), returnHandledBy: shop.id, returnDecision: 'restocked', stockRestoredAt: new Date(refusedAt.getTime() + DAY) });
          }
          if (refusedAt > now) Object.assign(data, { cancelledAt: new Date(now.getTime() - 2 * HOUR), deliveryRefusedAt: new Date(now.getTime() - 2 * HOUR) });
        }
        if (data.cancelledBy !== 'shop' || data.cancelReasonCode !== 'refused') {
          deducted = false;
          data.stockRestoredAt = data.cancelledAt as Date;
        } else if (data.returnDecision === 'restocked') deducted = false;
        events.push({ at: data.cancelledAt as Date, toStatus: 'cancelled', paymentStatus: data.paymentStatus as never, actor: (data.cancelledBy as never) ?? 'shop', kind: 'cancelled', reasonCode: (data.cancelReasonCode as string) ?? null, detail: (data.cancelReason as string) ?? null });
        bump('đơn huỷ');
      } else {
        if (method === 'bank_transfer') {
          Object.assign(data, { paymentStatus: 'paid', paidAt: paidBank });
          events.push({ at: paidBank, fromStatus: 'to_pay', toStatus: 'to_ship', paymentStatus: 'paid', actor: 'system', kind: 'payment_received' });
        }
        const confirmedDone = !(status === 'to_ship' && needsCall && ago === 0 && chance(0.7)) && confirmedAt < now;
        if (confirmedDone) {
          Object.assign(data, { confirmedAt, confirmedBy: shop.id });
          shopEv(confirmedAt, 'to_ship', 'to_ship', data.paymentStatus as string, 'confirmed');
        }
        if (status === 'cancel_requested') {
          Object.assign(data, { status: 'cancel_requested', cancelRequestedAt: new Date(createdAt.getTime() + int(30, 300) * MIN), cancelRequestReason: pick(CUSTOMER_CANCEL) });
          if ((data.cancelRequestedAt as Date) > now) data.cancelRequestedAt = new Date(now.getTime() - 10 * MIN);
          events.push({ at: data.cancelRequestedAt as Date, fromStatus: 'to_ship', toStatus: 'cancel_requested', paymentStatus: data.paymentStatus as never, actor: 'customer', kind: 'cancel_requested', detail: data.cancelRequestReason as string });
        }
        if ((status === 'to_receive' || status === 'completed') && handedOverAt < now) {
          Object.assign(data, { status: 'to_receive', carrier: carrier[0], trackingNumber: tracking, activeTrackingNumber: tracking, handedOverAt, handedOverBy: shop.id });
          shopEv(handedOverAt, 'to_ship', 'to_receive', data.paymentStatus as string, 'shipped', { detail: `${carrier[0]} ${tracking}` });
          // đơn "đang giao" trễ hẹn: vài đơn cố ý quá ngày dự kiến
          if (status === 'completed' && deliveredAt < now) {
            Object.assign(data, { status: 'completed', deliveredAt, deliveredBy: shop.id, activeTrackingNumber: null, paymentStatus: 'paid', paidAt: data.paidAt ?? deliveredAt });
            shopEv(deliveredAt, 'to_receive', 'completed', 'paid', 'delivered');
            bump('đơn hoàn tất');
          }
        }
        if (data.status === 'to_ship' && chance(0.08) && confirmedDone) {
          Object.assign(data, { cancelRequestedAt: new Date(confirmedAt.getTime() + 20 * MIN), cancelRequestReason: pick(CUSTOMER_CANCEL), cancelRequestOutcome: 'rejected', cancelRequestDecidedAt: new Date(confirmedAt.getTime() + 60 * MIN), cancelRequestDecidedBy: shop.id, cancelRequestRejectReason: 'Đơn đã đóng gói, không thể huỷ' });
        }
      }

      const order = await prisma.order.create({
        data: {
          ...data,
          items: {
            create: lines.map((l, i) => ({
              lineNo: i + 1, variantId: l.variant.id, productId: l.variant.productId, productSlug: l.variant.slug, name: l.variant.name,
              colorName: l.variant.color, size: l.variant.size, sku: l.variant.sku, mediaId: l.variant.media, unitPrice: l.variant.price,
              quantity: l.qty, lineDiscount: lineDiscounts[i],
            })),
          },
          events: { createMany: { data: events } },
        },
        include: { items: true },
      });
      if (deducted) for (const l of lines) l.variant.stock -= l.qty;
      const released = data.status === 'cancelled';
      for (const v of [voucher, shipVoucher ? vFreeShip : null]) {
        if (!v) continue;
        await prisma.voucherRedemption.create({
          data: { voucherId: v.voucher_id, orderId: order.order_id, userId: cust?.id ?? null, phone, email, createdAt, releasedAt: released ? (data.cancelledAt as Date) : null },
        });
        if (!released) voucherUses.set(v.voucher_id, (voucherUses.get(v.voucher_id) ?? 0) + 1);
        bump('lượt dùng voucher');
      }
      createdOrders.push({
        id: order.order_id, code, status: order.status, userId: cust?.id ?? null, email, phone, deliveredAt: order.deliveredAt, method,
        lines: order.items.map((it, i) => ({ id: it.order_item_id, variant: lines[i].variant, qty: it.quantity, amount: it.unitPrice * it.quantity - it.lineDiscount })),
      });
      bump('đơn');
    }
  }
  for (const [id, n] of voucherUses) await prisma.voucher.update({ where: { voucher_id: id }, data: { usedCount: { increment: n } } });

  // --- Trả hàng ---
  const REASONS = [
    ['not-fit', 'customer', 5], ['changed-mind', 'customer', 2], ['wrong-size', 'shop', 1.5], ['defective', 'shop', 2], ['wrong-color', 'shop', 0.8], ['wrong-item', 'shop', 0.5],
  ] as const;
  const eligible = createdOrders.filter((o) => o.status === 'completed' && o.deliveredAt && now.getTime() - o.deliveredAt.getTime() < 45 * DAY && now.getTime() - o.deliveredAt.getTime() > DAY);
  const returnOrders = eligible.filter(() => chance(0.1)).slice(0, 32);
  for (const o of returnOrders) {
    const [reason, fault] = weighted(REASONS, (x) => x[2]);
    const line = pick(o.lines);
    const goods = Math.round(line.amount / line.qty);
    const fee = fault === 'customer' ? 30_000 : 0;
    const amount = Math.max(0, goods - fee);
    const requestedAt = new Date(o.deliveredAt!.getTime() + int(6, 70) * HOUR);
    const age = now.getTime() - requestedAt.getTime();
    const state = age < 2 * DAY ? 'requested' : weighted(['refunded', 'received', 'approved', 'requested', 'rejected'] as const, (x) => ({ refunded: 5, received: 1.5, approved: 1.5, requested: 1, rejected: 0.8 })[x]);
    const a = actorOf();
    const approvedAt = new Date(requestedAt.getTime() + int(2, 20) * HOUR);
    const receivedAt = new Date(approvedAt.getTime() + int(2, 4) * DAY);
    const refundedAt = new Date(receivedAt.getTime() + int(3, 30) * HOUR);
    const steps = {
      approved: ['approved', 'received', 'refunded'].includes(state),
      received: ['received', 'refunded'].includes(state) && receivedAt < now,
      refunded: state === 'refunded' && refundedAt < now,
    };
    const finalState = state === 'refunded' && !steps.refunded ? (steps.received ? 'received' : 'approved') : state === 'received' && !steps.received ? 'approved' : state;
    const amountFinal = finalState === 'received' || finalState === 'refunded';
    const ret = await prisma.orderReturn.create({
      data: {
        orderId: o.id, activeOrderId: o.id, state: finalState, reason, fault, detail: reason === 'defective' ? 'Đường may ở vai bị bung chỉ.' : reason === 'not-fit' ? 'Mặc hơi rộng so với dáng người.' : '',
        conditionAck: true, requestedVia: o.userId ? 'member' : 'guest', requestedBy: o.userId, requestedAt,
        ...(finalState !== 'requested' && finalState !== 'rejected' ? { approvedAt, approvedBy: a.id, carrier: 'GHN', trackingNumber: `GHNR${o.code.slice(5)}` } : {}),
        ...(finalState === 'rejected' ? { rejectedAt: approvedAt, rejectedBy: a.id, rejectNote: 'Sản phẩm đã qua sử dụng, không đủ điều kiện đổi trả.' } : {}),
        ...(amountFinal ? { receivedAt, receivedBy: a.id } : {}),
        ...(finalState === 'refunded' ? { refundedAt, refundedBy: admin.user_id, refundReference: `CK${o.code.slice(5)}` } : {}),
        goodsAmount: goods, shippingRefund: 0, returnShippingFee: fee, amount, amountFinal,
        items: { create: [{ orderItemId: line.id, quantity: 1, goodsAmount: goods, ...(amountFinal ? { acceptedQuantity: 1, disposition: 'restock' } : {}) }] },
      },
    });
    // Đơn COD: khách khai tài khoản nhận hoàn (như form thật) để màn Trả hàng có ngân hàng / số TK / chủ TK.
    // Số đầy đủ được mã hoá bằng RETURN_ACCOUNT_KEY; đã hoàn tiền / từ chối thì không có bản mã, chỉ giữ 4 số cuối (như luồng thật).
    if (o.method === 'cod') {
      const holder = (await prisma.order.findUniqueOrThrow({ where: { order_id: o.id }, select: { recipientName: true } })).recipientName;
      // Math.random (không dùng `rand`) để không làm lệch chuỗi ngẫu nhiên cố định của phần dữ liệu phía sau.
      const digit = () => Math.floor(Math.random() * 10);
      const bank = DEMO_BANKS[Math.floor(Math.random() * DEMO_BANKS.length)];
      const number = `${1 + Math.floor(Math.random() * 9)}${Array.from({ length: 9 + Math.floor(Math.random() * 4) }, digit).join('')}`;
      let accountNumberEnc: string | null = null;
      // chk_returns_account: bản mã chỉ tồn tại khi yêu cầu còn mở (requested / approved / received).
      if (finalState === 'requested' || finalState === 'approved' || finalState === 'received') {
        try {
          accountNumberEnc = encryptAccountNumber(number, ret.return_id);
        } catch {
          // Thiếu RETURN_ACCOUNT_KEY / cấu hình: chỉ lưu bản che.
        }
      }
      await prisma.orderReturn.update({
        where: { return_id: ret.return_id },
        data: { bankName: bank, accountLast4: last4Of(number), accountName: toAccountName(holder), accountNumberEnc },
      });
    }
    if (amountFinal) line.variant.stock += 1;
    if (finalState === 'refunded') await prisma.order.update({ where: { order_id: o.id }, data: { paymentStatus: 'partially_refunded' } });
    await prisma.orderEvent.create({ data: { orderId: o.id, at: requestedAt, fromStatus: 'completed', toStatus: 'completed', paymentStatus: 'paid', actor: 'customer', kind: 'return_requested', returnId: ret.return_id } });
    bump('yêu cầu trả hàng');
  }

  // --- Đánh giá ---
  const reviewed = new Set<string>();
  const reviewable = createdOrders.filter((o) => o.status === 'completed' && o.userId && o.deliveredAt && now.getTime() - o.deliveredAt.getTime() > 2 * DAY);
  for (const o of reviewable) {
    if (!chance(0.32)) continue;
    const line = pick(o.lines);
    const key = `${o.userId}|${line.variant.productId}`;
    if (reviewed.has(key)) continue;
    reviewed.add(key);
    const rating = weighted([5, 4, 3, 2, 1], (x) => ({ 5: 46, 4: 30, 3: 12, 2: 7, 1: 5 })[x]!);
    const text = pick(REVIEW_TEXT[rating]);
    const cust = customers.find((c) => c.id === o.userId)!;
    const createdAt = new Date(Math.min(now.getTime() - HOUR, o.deliveredAt!.getTime() + int(1, 6) * DAY));
    const fit = rating <= 3 ? pick([-1, 1, 0]) : weighted([0, -1, 1], (x) => (x === 0 ? 7 : 1.5));
    const reply = chance(0.55) ? (rating >= 4 ? REPLIES[0] : rating === 3 ? REPLIES[1] : REPLIES[2]) : null;
    const hidden = rating <= 2 && chance(0.15);
    const parts = cust.name.split(' ');
    await prisma.productReview.create({
      data: {
        productId: line.variant.productId, userId: o.userId, orderId: o.id, authorDisplay: `${parts[parts.length - 1]} ${parts[0][0]}.`,
        rating, fit, sizeBought: line.variant.size, height: chance(0.6) ? `${int(150, 172)} cm` : '', title: text.title, body: text.body,
        status: hidden ? 'hidden' : 'visible', createdAt, updatedAt: createdAt,
        ...(hidden ? { hiddenAt: new Date(createdAt.getTime() + 5 * HOUR), hiddenBy: admin.user_id, hiddenByName: `${admin.firstName} ${admin.lastName}`, hiddenReason: 'Nội dung trùng lặp, không liên quan sản phẩm' } : {}),
        ...(reply ? { replyBody: reply, replyAt: new Date(createdAt.getTime() + int(2, 30) * HOUR), replyBy: admin.user_id, replyByName: 'nine2fine' } : {}),
      },
    });
    bump('đánh giá');
  }

  // --- Wishlist, giỏ bỏ dở ---
  for (const c of customers) {
    const nw = int(0, 3);
    const chosen = new Set<string>();
    for (let i = 0; i < nw; i++) chosen.add(pick(products).product_id);
    for (const pid of chosen) {
      await prisma.wishlistItem.create({ data: { userId: c.id, productId: pid, addedAt: new Date(now.getTime() - int(0, 60) * DAY) } });
      bump('wishlist');
    }
  }
  for (const c of customers.filter(() => chance(0.16))) {
    const cart = await prisma.cart.create({ data: { userId: c.id } });
    const v = weighted(variants.filter((x) => x.stock > 0), (x) => x.popularity);
    await prisma.cartLine.create({ data: { cartId: cart.cart_id, variantId: v.id, quantity: 1, createdAt: new Date(now.getTime() - int(1, 12) * DAY) } });
    bump('giỏ bỏ dở');
  }

  // --- Cuối kỳ: kiểm kê, hàng lỗi, vài SKU sắp hết / hết hàng ---
  const countAt = new Date(now.getTime() - 20 * HOUR);
  const sorted = [...variants].sort((a, b) => a.popularity - b.popularity);
  const outs = sorted.slice(0, 4);
  const lows = sorted.slice(4, 10);
  const damaged = variants.filter(() => chance(0.08));
  for (const v of damaged) {
    if (v.stock < 2) continue;
    v.stock -= 1;
    const a = actorOf();
    adjustments.push({ variantId: v.id, at: new Date(now.getTime() - int(3, 30) * DAY), delta: -1, availableAfter: v.stock, reason: 'damaged', note: `${NOTE} Lỗi vải khi kiểm hàng`, actorUserId: a.id, actorName: a.name, actorRole: a.role });
  }
  for (const v of [...outs, ...lows]) {
    const target = outs.includes(v) ? 0 : int(1, 4);
    const delta = target - v.stock;
    if (delta === 0) continue;
    v.stock = target;
    const a = actorOf();
    adjustments.push({ variantId: v.id, at: countAt, delta, availableAfter: v.stock, reason: 'count', note: `${NOTE} Kiểm kê cuối tuần`, actorUserId: a.id, actorName: a.name, actorRole: a.role });
  }
  await prisma.inventoryAdjustment.createMany({ data: adjustments });
  bump('điều chỉnh tồn kho', adjustments.length);

  // Ghi tồn cuối (đã trừ đơn đã bán / đang giữ, cộng hàng trả nhập lại, đúng chiều với lúc gỡ).
  for (const v of variants) {
    if (v.stock < 0) throw new Error(`Tồn âm ở ${v.sku}`);
    await prisma.productVariant.update({ where: { variant_id: v.id }, data: { inventoryQty: v.stock } });
  }
  mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify({ before, after: Object.fromEntries(variants.map((v) => [v.id, v.stock])) } satisfies Snapshot));
  return counts;
}

async function main() {
  const removeOnly = process.argv.includes('--remove');
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('Chỉ chạy trên DB cục bộ (DATABASE_URL phải là localhost).');
  console.log('Gỡ dữ liệu demo cũ (nếu có)…');
  await remove();
  if (removeOnly) {
    console.log('Đã gỡ sạch dữ liệu demo.');
    return;
  }
  console.log('Đang seed dữ liệu demo 90 ngày…');
  try {
    const counts = await seedDemo();
    console.log('Xong:', counts);
  } catch (error) {
    console.error('Seed lỗi, đang gỡ phần đã ghi…');
    await remove();
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
