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
  return (a, b) => key[sort](a, b) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

const findFull = (where: Prisma.ProductWhereInput) =>
  prisma.product.findMany({ where, include: { variants: { orderBy: { sortOrder: 'asc' } } } });

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
    ...(q.color ? { colorName: { equals: q.color, mode: 'insensitive' } } : {}),
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
  // `effectivePrice` trên cột nhẹ của các sản phẩm khớp bộ lọc còn lại, rồi cắt trang. Mọi trường hợp khác giữ sắp / phân trang ở DB.
  const viaTs = q.maxPrice !== undefined || q.sale || q.sort === 'price-asc' || q.sort === 'price-desc';

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
