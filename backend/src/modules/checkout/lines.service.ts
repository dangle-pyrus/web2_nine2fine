import { Prisma } from '@prisma/client';
import type { Db } from '../../lib/sql';
import type { Settings } from '../store/settings.service';

/** Đọc + làm tươi dòng (plan mục 4.1), dùng cho giỏ, báo giá, đặt hàng. */

export type Availability = 'available' | 'low-stock' | 'out-of-stock' | 'discontinued';

export interface VariantRow {
  variant_id: string;
  sku: string;
  size: string;
  color_name: string;
  inventory_qty: number;
  product_id: string;
  slug: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  cover_media_id: string;
  color_media: Record<string, string> | null;
  category_id: string;
  status: string;
}

/** Dạng trong contract (`RefreshedLine`). */
export interface RefreshedLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  mediaId: string;
  color: string;
  size: string;
  unitPrice: number;
  compareAtPrice?: number;
  requestedQuantity: number;
  maxQuantity: number;
  effectiveQuantity: number;
  availability: Availability;
  inventory: number;
  limitedBy?: 'stock' | 'per-variant-limit';
}

/** Dòng làm tươi kèm thông tin nội bộ cho luật voucher và đơn (không ra API). */
export interface LineCtx extends RefreshedLine {
  categoryId: string;
  sku: string;
  onSale: boolean;
}

export interface RequestedLine {
  variantId: string;
  quantity: number;
}

/** Một truy vấn cho mọi variantId. `forShare` khoá chia sẻ `products` (đặt hàng: giá không đổi tới commit). */
export async function loadVariantRows(db: Db, ids: readonly string[], forShare = false): Promise<Map<string, VariantRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.$queryRaw<VariantRow[]>(Prisma.sql`
    SELECT v."variant_id", v."sku", v."size", v."color_name", v."inventory_qty",
           p."product_id", p."slug", p."name", p."price"::int AS "price", p."compare_at_price"::int AS "compare_at_price",
           p."cover_media_id", p."color_media", p."category_id", p."status"::text AS "status"
    FROM "product_variants" v JOIN "products" p ON p."product_id" = v."product_id"
    WHERE v."variant_id" = ANY(${ids as string[]}::uuid[])
    ORDER BY v."variant_id"
    ${forShare ? Prisma.sql`FOR SHARE OF p` : Prisma.empty}`);
  return new Map(rows.map((r) => [r.variant_id, r]));
}

export const availabilityOf = (inventory: number): Availability =>
  inventory <= 0 ? 'out-of-stock' : inventory <= 5 ? 'low-stock' : 'available';

/** Làm tươi một dòng yêu cầu theo dòng DB (hoặc `undefined` nếu biến thể không tồn tại). */
export function refreshLine(req: RequestedLine, row: VariantRow | undefined, settings: Pick<Settings, 'maxPerVariant'>): LineCtx {
  if (!row || row.status !== 'ACTIVE') {
    return {
      variantId: req.variantId,
      productId: '',
      slug: '',
      name: '',
      mediaId: '',
      color: '',
      size: '',
      unitPrice: 0,
      requestedQuantity: req.quantity,
      maxQuantity: 0,
      effectiveQuantity: 0,
      availability: 'discontinued',
      inventory: 0,
      limitedBy: 'stock',
      categoryId: '',
      sku: '',
      onSale: false,
    };
  }
  const inventory = Math.max(0, row.inventory_qty);
  const maxQuantity = Math.min(settings.maxPerVariant, inventory);
  const effectiveQuantity = Math.min(req.quantity, maxQuantity);
  const line: LineCtx = {
    variantId: req.variantId,
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    mediaId: row.color_media?.[row.color_name] ?? row.cover_media_id,
    color: row.color_name,
    size: row.size,
    unitPrice: row.price,
    requestedQuantity: req.quantity,
    maxQuantity,
    effectiveQuantity,
    availability: availabilityOf(inventory),
    inventory,
    categoryId: row.category_id,
    sku: row.sku,
    onSale: row.compare_at_price !== null && row.compare_at_price > row.price,
  };
  if (row.compare_at_price !== null) line.compareAtPrice = row.compare_at_price;
  if (effectiveQuantity < req.quantity) {
    line.limitedBy = inventory < Math.min(req.quantity, settings.maxPerVariant) ? 'stock' : 'per-variant-limit';
  }
  return line;
}

export function refreshLines(
  requested: readonly RequestedLine[],
  rows: ReadonlyMap<string, VariantRow>,
  settings: Pick<Settings, 'maxPerVariant'>,
): LineCtx[] {
  return requested.map((r) => refreshLine(r, rows.get(r.variantId), settings));
}

/** Bỏ trường nội bộ trước khi trả ra API. */
export function toRefreshedDto(l: LineCtx): RefreshedLine {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { categoryId: _c, sku: _s, onSale: _o, ...dto } = l;
  return dto;
}
