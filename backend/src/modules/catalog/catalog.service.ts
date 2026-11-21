import { COLOR_FAMILIES, COLOR_FAMILY_HEX, colorFamilyOf, parseColorFamily } from '../../lib/color-family';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { effectivePrice, isSaleRunning, moneyOrNull } from '../pricing/effective-price';
import { loadRatings } from '../reviews/rating';
import { getCategoryMaps } from './catalog.cache';
import { toProductDto, toSizeChartDto } from './catalog.mapper';
import type { ListQuery, ProductPageDto, ProductDto, SortKey } from './catalog.types';

const GENDERS = ['nam', 'nu'] as const;
const MOMENTS = ['work', 'dinner', 'event', 'weekend'] as const;

const ORDER: Record<SortKey, Prisma.ProductOrderByWithRelationInput[]> = {
  featured: [{ displayOrder: 'asc' }],
  newest: [{ createdAt: 'desc' }],
  'price-asc': [{ price: 'asc' }],
  'price-desc': [{ price: 'desc' }],
  bestselling: [{ salesRank: 'asc' }],
};

/** Prisma không tự thoát ký tự đại diện của LIKE: `\`, `%`, `_` phải là ký tự thường. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const emptyPage = (q: ListQuery): ProductPageDto => ({ items: [], total: 0, page: q.page, limit: q.limit });

interface SortRow {
  product_id: string;
  slug: string;
  displayOrder: number;
  createdAt: Date;
  salesRank: number;
  price: number;
  compareAtPrice: number | null;
  salePrice: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  /** PLP-09: còn ít nhất một biến thể có tồn. */
  inStock: boolean;
}

/** Sắp xếp / lọc bằng giá hiệu lực ở TS (plan mục 3): MỘT hàm `effectivePrice`, không biểu thức SQL thứ hai. Hoà bằng `slug` tăng. */
function compareRows(sort: SortKey, now: Date): (a: SortRow, b: SortRow) => number {
  const eff = (r: SortRow) => effectivePrice(r, now).price;
  const key: Record<SortKey, (a: SortRow, b: SortRow) => number> = {
    featured: (a, b) => a.displayOrder - b.displayOrder,
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    'price-asc': (a, b) => eff(a) - eff(b),
    'price-desc': (a, b) => eff(b) - eff(a),
    bestselling: (a, b) => a.salesRank - b.salesRank,
  };
  // PLP-09: sản phẩm hết hàng ở mọi biến thể luôn xếp cuối, bất kể cách sắp xếp.
  return (a, b) => Number(b.inStock) - Number(a.inStock) || key[sort](a, b) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

const findFull = (where: Prisma.ProductWhereInput) =>
  prisma.product.findMany({ where, include: { variants: { orderBy: { sortOrder: 'asc' } } } });

/**
 * Lọc màu: tên NHÓM màu (Đen, Xanh dương, ...) -> mọi tên màu biến thể thuộc nhóm (lib/color-family);
 * tên khác -> khớp đúng tên màu như trước (không phân biệt hoa thường).
 */
async function colorCond(color: string): Promise<Prisma.ProductVariantWhereInput> {
  const family = parseColorFamily(color);
  if (!family) return { colorName: { equals: color, mode: 'insensitive' } };
  const names = await prisma.productVariant.findMany({ distinct: ['colorName'], select: { colorName: true } });
  return { colorName: { in: names.map((n) => n.colorName).filter((n) => colorFamilyOf(n) === family) } };
}

export async function listProducts(q: ListQuery, at: Date = clockNow()): Promise<ProductPageDto> {
  const gender = q.gender ? GENDERS.find((g) => g === q.gender) : undefined;
  const moment = q.moment ? MOMENTS.find((m) => m === q.moment) : undefined;
  if ((q.gender && !gender) || (q.moment && !moment)) return emptyPage(q);
  if (q.ids && q.ids.length === 0) return emptyPage(q);

  let categoryId: string | undefined;
  if (q.category) {
    categoryId = (await getCategoryMaps()).bySlug.get(q.category);
    if (!categoryId) return emptyPage(q);
  }

  const variantCond: Prisma.ProductVariantWhereInput = {
    ...(q.size ? { size: q.size } : {}),
    ...(q.color ? await colorCond(q.color) : {}),
    ...(q.available ? { inventoryQty: { gt: 0 } } : {}),
  };

  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    ...(categoryId ? { categoryId } : {}),
    ...(gender ? { genders: { has: gender } } : {}),
    ...(moment ? { moments: { has: moment } } : {}),
    ...(q.ids ? { product_id: { in: q.ids } } : {}),
    ...(q.tokens.length > 0 ? { AND: q.tokens.map((t) => ({ searchText: { contains: escapeLike(t) } })) } : {}),
    ...(Object.keys(variantCond).length > 0 ? { variants: { some: variantCond } } : {}),
  };

  // Lọc `maxPrice` / `sale=true` và sắp theo giá cần GIÁ HIỆU LỰC (đợt giảm có giờ bắt đầu / kết thúc): làm ở TS bằng đúng hàm
  // `effectivePrice` trên cột nhẹ của các sản phẩm khớp bộ lọc còn lại, rồi cắt trang.
  // PLP-09 (2026-11-14): hàng hết mọi biến thể luôn xếp cuối, nên mọi cách sắp đều đi đường TS (trừ khi đã lọc "Còn hàng":
  // khi đó mọi sản phẩm đều còn hàng và DB sắp / phân trang như cũ). Danh mục nhỏ (vài trăm sản phẩm) nên chi phí thấp.
  const viaTs = q.maxPrice !== undefined || q.sale || q.sort === 'price-asc' || q.sort === 'price-desc' || !q.available;

  let total: number;
  let rows: Awaited<ReturnType<typeof findFull>>;
  if (viaTs) {
    const slim = await prisma.product.findMany({
      where,
      select: {
        product_id: true,
        slug: true,
        displayOrder: true,
        createdAt: true,
        salesRank: true,
        price: true,
        compareAtPrice: true,
        salePrice: true,
        saleStartsAt: true,
        saleEndsAt: true,
        // Đếm trong cùng câu SQL (không thêm truy vấn quan hệ, T-CAT-52).
        _count: { select: { variants: { where: { inventoryQty: { gt: 0 } } } } },
      },
    });
    const cands: SortRow[] = slim.map((r) => ({
      product_id: r.product_id,
      slug: r.slug,
      displayOrder: r.displayOrder,
      createdAt: r.createdAt,
      salesRank: r.salesRank,
      price: Number(r.price),
      compareAtPrice: moneyOrNull(r.compareAtPrice),
      salePrice: moneyOrNull(r.salePrice),
      saleStartsAt: r.saleStartsAt,
      saleEndsAt: r.saleEndsAt,
      inStock: r._count.variants > 0,
    }));
    const matched = cands
      .filter((r) => (q.maxPrice === undefined || effectivePrice(r, at).price <= q.maxPrice) && (!q.sale || isSaleRunning(r, at)))
      .sort(compareRows(q.sort, at));
    total = matched.length;
    const pageIds = matched.slice((q.page - 1) * q.limit, q.page * q.limit).map((r) => r.product_id);
    const full = pageIds.length > 0 ? await findFull({ product_id: { in: pageIds } }) : [];
    const byId = new Map(full.map((r) => [r.product_id, r]));
    rows = pageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  } else {
    const [count, found] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [...ORDER[q.sort], { slug: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { variants: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);
    total = count;
    rows = found;
  }

  let maps = await getCategoryMaps();
  if (rows.some((r) => !maps.byId.has(r.categoryId))) maps = await getCategoryMaps(true);
  const ratings = await loadRatings(prisma, rows.map((r) => r.product_id));
  return {
    items: rows.map((r) => toProductDto(r, maps.byId.get(r.categoryId) ?? '', { now: at, ratings })),
    total,
    page: q.page,
    limit: q.limit,
  };
}

export async function getProductBySlug(slug: string, at: Date = clockNow()): Promise<ProductDto> {
  const row = await prisma.product.findFirst({
    where: { slug, status: 'ACTIVE' },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) throw Errors.notFound();
  let maps = await getCategoryMaps();
  if (!maps.byId.has(row.categoryId)) maps = await getCategoryMaps(true);
  const ratings = await loadRatings(prisma, [row.product_id]);
  return toProductDto(row, maps.byId.get(row.categoryId) ?? '', { now: at, ratings });
}

export async function getSizeChart(categorySlug: string): Promise<unknown> {
  const id = (await getCategoryMaps()).bySlug.get(categorySlug);
  if (!id) throw Errors.notFound();
  const row = await prisma.sizeChart.findUnique({ where: { categoryId: id } });
  if (!row) throw Errors.notFound();
  return toSizeChartDto(row);
}

export interface CatalogFacetsDto {
  /** Giá niêm yết thấp / cao nhất của sản phẩm đang bán (đồng); 0 khi chưa có sản phẩm. */
  priceMin: number;
  priceMax: number;
  /** Nhóm màu có ít nhất một biến thể của sản phẩm đang bán, theo thứ tự cố định. */
  colors: { name: string; hex: string }[];
  /** Size có ở sản phẩm đang bán, theo thứ tự may mặc. */
  sizes: string[];
}

let facetsCache: { at: number; value: CatalogFacetsDto } | undefined;
const FACETS_TTL_MS = 60_000;

/** Chỉ cho test: bỏ cache facets. */
export function clearFacetsCache(): void {
  facetsCache = undefined;
}

/** 2026-11-21: bộ lọc storefront theo dữ liệu thật (khoảng giá min–max, nhóm màu, size đang có). */
export async function getCatalogFacets(): Promise<CatalogFacetsDto> {
  if (facetsCache && Date.now() - facetsCache.at < FACETS_TTL_MS) return facetsCache.value;
  const [agg, variants] = await Promise.all([
    prisma.product.aggregate({ where: { status: 'ACTIVE' }, _min: { price: true }, _max: { price: true } }),
    prisma.productVariant.findMany({ where: { product: { status: 'ACTIVE' } }, distinct: ['colorName', 'size'], select: { colorName: true, size: true } }),
  ]);
  const families = new Set(variants.map((v) => colorFamilyOf(v.colorName)).filter((f) => f !== null));
  const sizes = new Set(variants.map((v) => v.size));
  const value: CatalogFacetsDto = {
    priceMin: agg._min.price ? Number(agg._min.price) : 0,
    priceMax: agg._max.price ? Number(agg._max.price) : 0,
    colors: COLOR_FAMILIES.filter((f) => families.has(f)).map((name) => ({ name, hex: COLOR_FAMILY_HEX[name] })),
    sizes: CATALOG_ASSUMPTIONS.variant.sizes.filter((s) => sizes.has(s)),
  };
  facetsCache = { at: Date.now(), value };
  return value;
}
