import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
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

export async function listProducts(q: ListQuery): Promise<ProductPageDto> {
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
    ...(q.maxPrice !== undefined ? { price: { lte: q.maxPrice } } : {}),
    ...(q.ids ? { product_id: { in: q.ids } } : {}),
    ...(q.tokens.length > 0 ? { AND: q.tokens.map((t) => ({ searchText: { contains: escapeLike(t) } })) } : {}),
    ...(Object.keys(variantCond).length > 0 ? { variants: { some: variantCond } } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [...ORDER[q.sort], { slug: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  let maps = await getCategoryMaps();
  if (rows.some((r) => !maps.byId.has(r.categoryId))) maps = await getCategoryMaps(true);
  return {
    items: rows.map((r) => toProductDto(r, maps.byId.get(r.categoryId) ?? '')),
    total,
    page: q.page,
    limit: q.limit,
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDto> {
  const row = await prisma.product.findFirst({
    where: { slug, status: 'ACTIVE' },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) throw Errors.notFound();
  let maps = await getCategoryMaps();
  if (!maps.byId.has(row.categoryId)) maps = await getCategoryMaps(true);
  return toProductDto(row, maps.byId.get(row.categoryId) ?? '');
}

export async function getSizeChart(categorySlug: string): Promise<unknown> {
  const id = (await getCategoryMaps()).bySlug.get(categorySlug);
  if (!id) throw Errors.notFound();
  const row = await prisma.sizeChart.findUnique({ where: { categoryId: id } });
  if (!row) throw Errors.notFound();
  return toSizeChartDto(row);
}
