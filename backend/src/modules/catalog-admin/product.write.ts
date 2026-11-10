import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { user_role } from '@prisma/client';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { buildSearchText } from '../../lib/search-text';
import { nextFreeSlug, slugify } from '../../lib/slug';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import type { ProductCreateInput, ProductUpdateInput } from './catalog-admin.schemas';
import { imagesOf, toDbStatus, AdminStatus } from './product.mapper';
import { loadAdminProduct } from './product.query';
import { buildImageColumns, FinalImage, normalizeVariants, NormVariant, publishMissing } from './product.rules';

/**
 * ĐƯỜNG GHI DUY NHẤT vào `products` / `product_variants` của admin (plan mục 5, 6; BR-INV-22).
 * Mọi ghi `name`, `type_label`, `search_text` nằm ở đây, qua `buildSearchText`, trong cùng giao dịch với tên / loại.
 * T-INV-33 quét tĩnh: ngoài file này (và seed) không được có `product.update(`, `product.updateMany(`...
 *
 * Thứ tự khoá (plan 6.1): products -> product_variants (tăng dần variant_id) -> chỉ INSERT nhật ký. Không đảo thứ tự.
 */

export interface Actor {
  id: string;
  role: Extract<user_role, 'staff' | 'admin'>;
  name: string;
}

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

/** Chỉ cho test (T-INV-33): chạy giữa ghi sản phẩm và ghi biến thể để chứng minh rollback trọn gói. */
export const writeHooks: { beforeVariants?: () => void } = {};

function isRetryable(e: unknown): boolean {
  const x = e as { code?: string; meta?: { code?: string }; message?: string } | null;
  return x?.code === 'P2034' || x?.meta?.code === '40P01' || x?.meta?.code === '40001' || /\b40P01\b/.test(String(x?.message ?? ''));
}

async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= max || !isRetryable(e)) throw e;
    }
  }
}

const isUnique = (e: unknown, col: string): boolean => {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const t = e.meta?.target;
  return Array.isArray(t) ? t.includes(col) : typeof t === 'string' && t.includes(col);
};
const isFkViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2014');

interface LockedProduct {
  product_id: string;
  slug: string;
  status: string;
  published_at: Date | null;
  updated_ms: number;
}

async function lockProduct(tx: Db, id: string): Promise<LockedProduct> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy sản phẩm.');
  const rows = await tx.$queryRaw<LockedProduct[]>(Prisma.sql`
    SELECT product_id, slug, status::text AS status, published_at,
           floor(extract(epoch FROM updated_at) * 1000)::float8 AS updated_ms
    FROM products WHERE product_id = ${id}::uuid FOR UPDATE`);
  if (rows.length === 0) throw Errors.notFound('Không tìm thấy sản phẩm.');
  return rows[0];
}

interface LockedVariant {
  variant_id: string;
  sku: string;
  color_name: string;
  size: string;
  sort_order: number;
}

async function lockVariants(tx: Db, productId: string): Promise<LockedVariant[]> {
  return tx.$queryRaw<LockedVariant[]>(Prisma.sql`
    SELECT variant_id, sku, color_name, size, sort_order FROM product_variants
    WHERE product_id = ${productId}::uuid ORDER BY variant_id FOR UPDATE`);
}

async function orderedVariantIds(tx: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<Array<{ variant_id: string }>>(
    Prisma.sql`SELECT DISTINCT variant_id FROM order_items WHERE variant_id = ANY(${ids}::uuid[])`,
  );
  return new Set(rows.map((r) => r.variant_id));
}

/** Ảnh hợp lệ (plan 6.5): đã tải lên (media_assets) hoặc id thư viện đã dùng ở sản phẩm nào đó (kể cả chính sản phẩm này, kiểm trước khi ghi đè). */
async function validImageIds(tx: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT media_id AS id FROM media_assets WHERE media_id = ANY(${ids}::text[])
    UNION
    SELECT cover_media_id AS id FROM products WHERE cover_media_id = ANY(${ids}::text[])
    UNION
    SELECT g AS id FROM products, unnest(gallery_media_ids) AS g WHERE gallery_media_ids && ${ids}::text[] AND g = ANY(${ids}::text[])`);
  return new Set(rows.map((r) => r.id));
}

async function resolveImages(
  tx: Db,
  images: Array<{ id: string; alt?: string; color?: string }>,
  colorNames: string[],
): Promise<FinalImage[]> {
  if (images.length > CATALOG_ASSUMPTIONS.image.maxPerProduct) throw Errors.validation('Tối đa 12 ảnh.', 'images');
  const seen = new Set<string>();
  for (const im of images) {
    if (seen.has(im.id)) throw Errors.validation('Ảnh bị lặp trong danh sách.', 'images');
    seen.add(im.id);
  }
  const byLower = new Map(colorNames.map((n) => [n.toLowerCase(), n]));
  const out: FinalImage[] = images.map((im) => {
    const raw = im.color ?? '';
    let color = '';
    if (raw !== '') {
      const canon = byLower.get(raw.toLowerCase());
      if (canon === undefined) throw Errors.validation('Màu của ảnh phải là một màu của sản phẩm.', 'images');
      color = canon;
    }
    return { id: im.id, alt: im.alt ?? '', color };
  });
  const ok = await validImageIds(tx, out.map((i) => i.id));
  if (out.some((i) => !ok.has(i.id))) throw Errors.validation('Có ảnh không hợp lệ hoặc chưa được tải lên.', 'images');
  return out;
}

async function categoryBySlug(tx: Db, slug: string) {
  const c = await tx.category.findUnique({ where: { slug } });
  if (!c) throw Errors.validation('Danh mục không tồn tại.', 'category');
  return c;
}

/** Tên / hex màu: chuỗi cuối cho từng màu (đã kiểm nhất quán ở normalizeVariants). */
async function skuConflictField(skus: string[], excludeProductId: string | null): Promise<string> {
  const rows = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, ...(excludeProductId ? { productId: { not: excludeProductId } } : {}) },
    select: { sku: true },
  });
  const taken = new Set(rows.map((r) => r.sku));
  const i = skus.findIndex((s) => taken.has(s));
  return i >= 0 ? `variants[${i}].sku` : 'variants';
}

async function insertAdjustment(tx: Db, variantId: string, qty: number, actor: Actor, at: Date): Promise<void> {
  await tx.inventoryAdjustment.create({
    data: {
      variantId,
      at,
      delta: qty,
      availableAfter: qty,
      reason: 'received',
      note: 'Tồn ban đầu',
      actorUserId: actor.id,
      actorName: actor.name.slice(0, 100),
      actorRole: actor.role,
    },
  });
}

/* ------------------------------------------------------------------ tạo ------------------------------------------------------------------ */

export async function createProduct(actor: Actor, input: ProductCreateInput) {
  const explicitSlug = input.slug !== undefined && input.slug !== '';
  for (let attempt = 1; ; attempt++) {
    try {
      return await withRetry(() => prisma.$transaction((tx) => createTx(tx, actor, input, explicitSlug), TX));
    } catch (e) {
      if (isUnique(e, 'slug')) {
        if (explicitSlug) throw Errors.duplicate('slug', 'Đường dẫn này đã có sản phẩm khác dùng.');
        if (attempt < 5) continue; // hai admin cùng sinh slug: thử lại để lấy hậu tố kế tiếp
      }
      if (isUnique(e, 'sku')) throw Errors.duplicate(await skuConflictField(input.variants.map((v) => v.sku), null), 'SKU này đã được dùng.');
      throw e;
    }
  }
}

async function createTx(tx: Db, actor: Actor, input: ProductCreateInput, explicitSlug: boolean) {
  const category = await categoryBySlug(tx, input.category);
  const variants = normalizeVariants(input.variants);
  const dupSku = await tx.productVariant.findMany({ where: { sku: { in: variants.map((v) => v.sku) } }, select: { sku: true } });
  const taken = new Set(dupSku.map((d) => d.sku));
  const dupIdx = variants.findIndex((v) => taken.has(v.sku));
  if (dupIdx >= 0) throw Errors.duplicate(`variants[${dupIdx}].sku`, 'SKU này đã được dùng.');
  if (variants.some((v) => v.id !== undefined)) {
    const i = variants.findIndex((v) => v.id !== undefined);
    throw Errors.validation('Sản phẩm mới không có biến thể sẵn.', `variants[${i}].id`);
  }

  let slug: string;
  if (explicitSlug) {
    if (await tx.product.findUnique({ where: { slug: input.slug! }, select: { product_id: true } })) {
      throw Errors.duplicate('slug', 'Đường dẫn này đã có sản phẩm khác dùng.');
    }
    slug = input.slug!;
  } else {
    slug = await nextFreeSlug(tx, slugify(input.name));
  }

  const images = await resolveImages(tx, input.images ?? [], [...new Set(variants.map((v) => v.colorName))]);
  const status: AdminStatus = input.status ?? 'draft';
  if (status === 'active') {
    const missing = publishMissing({ name: input.name, type: input.type, hasCategory: true, price: input.price, imageCount: images.length, variantCount: variants.length });
    if (missing.length > 0) throw Errors.publishIncomplete(missing);
  }

  const at = now();
  const [rank] = await tx.$queryRaw<Array<{ d: number; s: number }>>(
    Prisma.sql`SELECT COALESCE(MAX(display_order), 0) + 1 AS d, COALESCE(MAX(sales_rank), 0) + 1 AS s FROM products`,
  );
  const cols = buildImageColumns(images);
  const created = await tx.product.create({
    data: {
      categoryId: category.category_id,
      slug,
      name: input.name,
      typeLabel: input.type,
      searchText: buildSearchText(input.name, input.type),
      price: input.price,
      compareAtPrice: input.compareAtPrice ?? null,
      badge: null,
      description: input.description ?? '',
      material: input.material ?? '',
      care: input.care ?? [],
      fitSummary: input.fitSummary ?? '',
      fitModel: '',
      looks: [],
      coverMediaId: cols.coverMediaId,
      galleryMediaIds: cols.galleryMediaIds,
      colorMedia: cols.colorMedia,
      imageMeta: cols.imageMeta,
      // DB giữ CHECK >= 1 (Slice 2): không gửi thì mặc định mọi giới tính / mọi dịp (plan lệch, xem handoff).
      genders: input.genders ?? ['nam', 'nu'],
      moments: input.moments ?? ['work', 'dinner', 'event', 'weekend'],
      displayOrder: Number(rank.d),
      salesRank: Number(rank.s),
      status: toDbStatus(status),
      publishedAt: status === 'active' ? at : null,
      updatedAt: at,
      updatedById: actor.id,
    },
  });
  for (const [i, v] of variants.entries()) {
    const row = await tx.productVariant.create({
      data: { productId: created.product_id, sku: v.sku, size: v.size, colorName: v.colorName, colorHex: v.colorHex, inventoryQty: v.inventory, sortOrder: i, createdAt: at, updatedAt: at },
    });
    if (v.inventory > 0) await insertAdjustment(tx, row.variant_id, v.inventory, actor, at);
  }
  return loadAdminProduct(tx, created.product_id);
}

/* ------------------------------------------------------------------ sửa ------------------------------------------------------------------ */

export async function updateProduct(actor: Actor, id: string, input: ProductUpdateInput) {
  try {
    return await withRetry(() => prisma.$transaction((tx) => updateTx(tx, actor, id, input), TX));
  } catch (e) {
    if (isUnique(e, 'slug')) throw Errors.duplicate('slug', 'Đường dẫn này đã có sản phẩm khác dùng.');
    if (isUnique(e, 'sku')) throw Errors.duplicate(await skuConflictField(input.variants.map((v) => v.sku), id), 'SKU này đã được dùng.');
    if (isFkViolation(e)) {
      const first = await prisma.productVariant.findFirst({ where: { productId: id, orderItems: { some: {} } }, orderBy: { sortOrder: 'asc' }, select: { sku: true } });
      throw Errors.variantInUse(first?.sku ?? '');
    }
    throw e;
  }
}

async function updateTx(tx: Db, actor: Actor, id: string, input: ProductUpdateInput) {
  const locked = await lockProduct(tx, id);
  if (locked.updated_ms !== Math.floor(new Date(input.updatedAt).getTime())) throw Errors.versionConflict();
  const cur = await tx.product.findUniqueOrThrow({ where: { product_id: id } });
  const curVariants = await lockVariants(tx, id);
  const hasOrders = await orderedVariantIds(tx, curVariants.map((v) => v.variant_id));

  const category = await categoryBySlug(tx, input.category);

  // Slug: chỉ khi gửi và khác hiện tại.
  let slug = cur.slug;
  if (input.slug !== undefined && input.slug !== '' && input.slug !== cur.slug) {
    if (CATALOG_ASSUMPTIONS.lockSlugAfterPublish && cur.publishedAt !== null) {
      throw Errors.validation('Không đổi đường dẫn của sản phẩm đã từng hiển thị.', 'slug');
    }
    if (await tx.product.findFirst({ where: { slug: input.slug, product_id: { not: id } }, select: { product_id: true } })) {
      throw Errors.duplicate('slug', 'Đường dẫn này đã có sản phẩm khác dùng.');
    }
    slug = input.slug;
  }

  const variants = normalizeVariants(input.variants);
  const byId = new Map(curVariants.map((v) => [v.variant_id, v]));
  variants.forEach((v, i) => {
    if (v.id === undefined) return;
    const c = byId.get(v.id);
    if (!c) throw Errors.validation('Biến thể không thuộc sản phẩm này.', `variants[${i}].id`);
    const ordered = hasOrders.has(v.id);
    if (ordered && c.sku !== v.sku) throw Errors.validation('SKU đã có đơn, không đổi được.', `variants[${i}].sku`);
    if (ordered && c.size !== v.size) throw Errors.validation('Size đã có đơn, không đổi được.', `variants[${i}].size`);
  });
  // SKU mới / đổi: không trùng biến thể của sản phẩm khác.
  const wanted = variants.map((v, i) => ({ v, i })).filter(({ v }) => v.id === undefined || byId.get(v.id)!.sku !== v.sku);
  if (wanted.length > 0) {
    const clash = await tx.productVariant.findMany({ where: { sku: { in: wanted.map((w) => w.v.sku) }, productId: { not: id } }, select: { sku: true } });
    const taken = new Set(clash.map((c) => c.sku));
    const hit = wanted.find((w) => taken.has(w.v.sku));
    if (hit) throw Errors.duplicate(`variants[${hit.i}].sku`, 'SKU này đã được dùng.');
  }
  // Bỏ biến thể: có đơn -> variant-in-use (SKU của biến thể đầu theo sort_order).
  const keep = new Set(variants.filter((v) => v.id !== undefined).map((v) => v.id!));
  const removed = curVariants.filter((v) => !keep.has(v.variant_id));
  const blocked = removed.filter((v) => hasOrders.has(v.variant_id)).sort((a, b) => a.sort_order - b.sort_order)[0];
  if (blocked) throw Errors.variantInUse(blocked.sku);

  // Đổi tên màu (cho ảnh gắn màu khi không gửi lại `images`).
  const rename = new Map<string, string>();
  for (const v of variants) if (v.id !== undefined) {
    const c = byId.get(v.id)!;
    if (c.color_name !== v.colorName) rename.set(c.color_name, v.colorName);
  }
  const colorNames = [...new Set(variants.map((v) => v.colorName))];
  const images = input.images !== undefined
    ? await resolveImages(tx, input.images, colorNames)
    : imagesOf(cur).map((im) => {
        const renamed = rename.get(im.color) ?? im.color;
        return { id: im.id, alt: im.alt, color: colorNames.includes(renamed) ? renamed : '' };
      });

  const target: AdminStatus = input.status ?? (cur.status === 'ACTIVE' ? 'active' : cur.status === 'ARCHIVED' ? 'hidden' : 'draft');
  if (target === 'active') {
    const missing = publishMissing({ name: input.name, type: input.type, hasCategory: true, price: input.price, imageCount: images.length, variantCount: variants.length });
    if (missing.length > 0) throw Errors.publishIncomplete(missing);
  }

  const at = now();
  const cols = buildImageColumns(images);
  await tx.product.update({
    where: { product_id: id },
    data: {
      name: input.name,
      typeLabel: input.type,
      searchText: buildSearchText(input.name, input.type),
      price: input.price,
      compareAtPrice: input.compareAtPrice === undefined ? cur.compareAtPrice : input.compareAtPrice,
      description: input.description ?? cur.description,
      material: input.material ?? cur.material,
      care: input.care ?? cur.care,
      fitSummary: input.fitSummary ?? cur.fitSummary,
      genders: input.genders ?? cur.genders,
      moments: input.moments ?? cur.moments,
      categoryId: category.category_id,
      slug,
      status: toDbStatus(target),
      coverMediaId: cols.coverMediaId,
      galleryMediaIds: cols.galleryMediaIds,
      colorMedia: cols.colorMedia,
      imageMeta: cols.imageMeta,
      publishedAt: cur.publishedAt ?? (target === 'active' ? at : null),
      updatedAt: at,
      updatedById: actor.id,
    },
  });

  writeHooks.beforeVariants?.();
  await applyVariants(tx, id, actor, variants, byId, removed, at);
  return loadAdminProduct(tx, id);
}

async function applyVariants(
  tx: Db,
  productId: string,
  actor: Actor,
  variants: NormVariant[],
  byId: Map<string, LockedVariant>,
  removed: LockedVariant[],
  at: Date,
): Promise<void> {
  // 1) Xoá biến thể bị bỏ (chưa có đơn): cascade giỏ + nhật ký.
  if (removed.length > 0) {
    await tx.productVariant.deleteMany({ where: { variant_id: { in: removed.map((r) => r.variant_id) } } });
  }
  // 2) Biến thể đổi khoá duy nhất (sku / màu / size): đặt tạm trước để hoán đổi không vướng unique giữa chừng.
  const existing = variants.map((v, i) => ({ v, i })).filter((x): x is { v: NormVariant & { id: string }; i: number } => x.v.id !== undefined);
  const keyChanged = existing.filter(({ v }) => {
    const c = byId.get(v.id)!;
    return c.sku !== v.sku || c.color_name !== v.colorName || c.size !== v.size;
  });
  for (const { v } of keyChanged) {
    const tmp = randomUUID().replace(/-/g, '');
    await tx.productVariant.update({ where: { variant_id: v.id }, data: { sku: `TMP-${tmp}`, colorName: `__tmp_${tmp}` } });
  }
  // 3) Giá trị cuối (KHÔNG đụng tồn của biến thể đã có, BR-INV-20).
  for (const { v, i } of existing) {
    await tx.productVariant.update({
      where: { variant_id: v.id },
      data: { sku: v.sku, colorName: v.colorName, colorHex: v.colorHex, size: v.size, sortOrder: i, updatedAt: at },
    });
  }
  // 4) Biến thể mới + dòng nhật ký tồn ban đầu.
  for (const [i, v] of variants.entries()) {
    if (v.id !== undefined) continue;
    const row = await tx.productVariant.create({
      data: { productId, sku: v.sku, size: v.size, colorName: v.colorName, colorHex: v.colorHex, inventoryQty: v.inventory, sortOrder: i, createdAt: at, updatedAt: at },
    });
    if (v.inventory > 0) await insertAdjustment(tx, row.variant_id, v.inventory, actor, at);
  }
}

/* ------------------------------------------------------- đổi trạng thái hàng loạt ------------------------------------------------------- */

export async function setStatusBulk(actor: Actor, ids: string[], status: AdminStatus): Promise<{ updated: number }> {
  if (ids.some((i) => !UUID_RE.test(i))) throw Errors.notFound('Không tìm thấy sản phẩm.');
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ product_id: string; name: string; type_label: string; price: Prisma.Decimal; images: number; variants: number }>>(Prisma.sql`
        SELECT p.product_id, p.name, p.type_label, p.price,
               cardinality(p.gallery_media_ids)::int AS images,
               (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.product_id)::int AS variants
        FROM products p WHERE p.product_id = ANY(${ids}::uuid[]) ORDER BY p.product_id FOR UPDATE`);
      if (rows.length !== ids.length) throw Errors.notFound('Không tìm thấy sản phẩm.');
      if (status === 'active') {
        const byId = new Map(rows.map((r) => [r.product_id, r]));
        for (const id of ids) {
          const r = byId.get(id)!;
          const missing = publishMissing({ name: r.name, type: r.type_label, hasCategory: true, price: Number(r.price), imageCount: Number(r.images), variantCount: Number(r.variants) });
          if (missing.length > 0) throw Errors.publishIncomplete(missing, id);
        }
      }
      const at = now();
      const db = toDbStatus(status);
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "products" SET "status" = ${db}::product_status,
          "published_at" = COALESCE("published_at", ${status === 'active' ? ts(at) : Prisma.sql`NULL::timestamp`}),
          "updated_at" = ${ts(at)}, "updated_by" = ${actor.id}::uuid
        WHERE "product_id" = ANY(${ids}::uuid[]) AND "status" <> ${db}::product_status`);
      return { updated: Number(updated) };
    }, TX),
  );
}

/* ------------------------------------------------------------------ xoá ------------------------------------------------------------------ */

export async function deleteProduct(id: string): Promise<void> {
  try {
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const p = await lockProduct(tx, id);
        const variants = await lockVariants(tx, id);
        const ordered = await orderedVariantIds(tx, variants.map((v) => v.variant_id));
        if (p.published_at !== null || ordered.size > 0) throw Errors.productInUse();
        await tx.product.delete({ where: { product_id: id } });
      }, TX),
    );
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (isFkViolation(e)) throw Errors.productInUse(); // order_items RESTRICT: đai cuối
    throw e;
  }
}
