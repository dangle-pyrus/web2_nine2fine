import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { UUID_RE } from '../../lib/validate';
import { getCategoryMaps } from '../catalog/catalog.cache';
import { toProductDto } from '../catalog/catalog.mapper';
import { loadRatings } from '../reviews/rating';
import { CollectionInput, parseCollection, slugFromName } from './collections.schemas';
import { throwIssues } from './home-content.schemas';
import type { ContentActor } from './home-content.service';

/** Bộ sưu tập (BR-CMS-07, Should, lát 10.8). */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

type Row = Prisma.CollectionGetPayload<{ include: { items: { orderBy: { position: 'asc' } } } }>;
const INCLUDE = { items: { orderBy: { position: 'asc' as const } } } as const;

const toAdminDto = (r: Row) => ({
  id: r.collection_id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  status: r.status as 'active' | 'draft',
  productIds: r.items.map((i) => i.productId),
  slugLocked: r.publishedAt !== null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  updatedBy: r.updatedByName !== '' ? { name: r.updatedByName } : null,
});
export type AdminCollectionDto = ReturnType<typeof toAdminDto>;

/* ---------------------------------------------------------------- công khai ---------------------------------------------------------------- */

export async function listPublicCollections() {
  const rows = await prisma.$queryRaw<Array<{ slug: string; name: string; description: string; n: number }>>(Prisma.sql`
    SELECT c."slug", c."name", c."description",
           (SELECT count(*)::int FROM "collection_products" cp JOIN "products" p ON p."product_id" = cp."product_id"
            WHERE cp."collection_id" = c."collection_id" AND p."status" = 'ACTIVE') AS n
    FROM "collections" c WHERE c."status" = 'active' ORDER BY c."published_at" DESC, c."slug" ASC`);
  return { items: rows.map((r) => ({ slug: r.slug, name: r.name, description: r.description, productCount: Number(r.n) })) };
}

export async function getPublicCollection(rawSlug: string, at: Date = clockNow()) {
  const slug = rawSlug.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 80 || !/^[a-z0-9-]+$/.test(slug)) throw Errors.notFound();
  const c = await prisma.collection.findFirst({ where: { slug, status: 'active' } });
  if (!c) throw Errors.notFound();
  const links = await prisma.collectionProduct.findMany({
    where: { collectionId: c.collection_id, product: { status: 'ACTIVE' } },
    orderBy: { position: 'asc' },
    include: { product: { include: { variants: { orderBy: { sortOrder: 'asc' } } } } },
  });
  const maps = await getCategoryMaps();
  const ratings = await loadRatings(prisma, links.map((l) => l.productId));
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    products: links.map((l) => toProductDto(l.product, maps.byId.get(l.product.categoryId) ?? '', { now: at, ratings })),
  };
}

/* ---------------------------------------------------------------- admin ---------------------------------------------------------------- */

export async function listAdminCollections() {
  const rows = await prisma.collection.findMany({ include: INCLUDE, orderBy: [{ updatedAt: 'desc' }, { collection_id: 'desc' }] });
  return { items: rows.map(toAdminDto) };
}

export async function getAdminCollection(id: string): Promise<AdminCollectionDto> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
  const row = await prisma.collection.findUnique({ where: { collection_id: id }, include: INCLUDE });
  if (!row) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
  return toAdminDto(row);
}

async function checkProducts(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await db.product.count({ where: { product_id: { in: ids } } });
  if (found !== ids.length) throwIssues([{ field: 'productIds', message: 'Có sản phẩm không tồn tại.' }]);
}

const isSlugClash = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && JSON.stringify(e.meta ?? {}).includes('slug');

async function freeSlug(db: Db, base: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = `${base.slice(0, 50 - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!(await db.collection.findUnique({ where: { slug: candidate }, select: { collection_id: true } }))) return candidate;
  }
  throw new Error('slug-exhausted');
}

const replaceItems = async (tx: Db, collectionId: string, ids: string[]): Promise<void> => {
  await tx.collectionProduct.deleteMany({ where: { collectionId } });
  if (ids.length > 0) await tx.collectionProduct.createMany({ data: ids.map((productId, position) => ({ collectionId, productId, position })) });
};

function parseOrThrow(raw: unknown, withVersion: boolean): CollectionInput {
  const p = parseCollection(raw, withVersion);
  if (!p.ok) throwIssues(p.issues);
  return p.value;
}

export async function createCollection(actor: ContentActor, raw: unknown, at: Date): Promise<AdminCollectionDto> {
  const input = parseOrThrow(raw, false);
  try {
    return await prisma.$transaction(async (tx) => {
      await checkProducts(tx, input.productIds);
      const slug = input.slug ?? (await freeSlug(tx, slugFromName(input.name)));
      if (input.slug && (await tx.collection.findUnique({ where: { slug }, select: { collection_id: true } }))) throw Errors.duplicate('slug', 'Đường dẫn này đã có bộ sưu tập khác dùng.');
      const row = await tx.collection.create({
        data: {
          slug, name: input.name, description: input.description, status: input.status,
          publishedAt: input.status === 'active' ? at : null, createdAt: at, updatedAt: at, updatedById: actor.id, updatedByName: actor.name,
        },
      });
      await replaceItems(tx, row.collection_id, input.productIds);
      return toAdminDto(await tx.collection.findUniqueOrThrow({ where: { collection_id: row.collection_id }, include: INCLUDE }));
    }, TX);
  } catch (e) {
    if (isSlugClash(e)) throw Errors.duplicate('slug', 'Đường dẫn này đã có bộ sưu tập khác dùng.');
    throw e;
  }
}

export async function updateCollection(actor: ContentActor, id: string, raw: unknown, at: Date): Promise<AdminCollectionDto> {
  const input = parseOrThrow(raw, true);
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ ms: number }>>(Prisma.sql`
        SELECT floor(extract(epoch FROM "updated_at") * 1000)::float8 AS ms FROM "collections" WHERE "collection_id" = ${id}::uuid FOR UPDATE`);
      if (locked.length === 0) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
      const cur = await tx.collection.findUniqueOrThrow({ where: { collection_id: id }, include: INCLUDE });
      if (Math.floor(new Date(input.updatedAt as string).getTime()) !== Math.floor(Number(locked[0].ms))) {
        throw Errors.versionConflictWith(toAdminDto(cur));
      }
      if (input.slug !== undefined && input.slug !== cur.slug) {
        if (cur.publishedAt !== null) throwIssues([{ field: 'slug', message: 'Không đổi đường dẫn của bộ sưu tập đã từng hiển thị.' }]);
        if (await tx.collection.findFirst({ where: { slug: input.slug, collection_id: { not: id } }, select: { collection_id: true } })) {
          throw Errors.duplicate('slug', 'Đường dẫn này đã có bộ sưu tập khác dùng.');
        }
      }
      await checkProducts(tx, input.productIds);
      await tx.collection.update({
        where: { collection_id: id },
        data: {
          slug: input.slug ?? cur.slug,
          name: input.name,
          description: input.description,
          status: input.status,
          publishedAt: cur.publishedAt ?? (input.status === 'active' ? at : null),
          updatedAt: new Date(Math.max(at.getTime(), Math.floor(Number(locked[0].ms)) + 1)),
          updatedById: actor.id,
          updatedByName: actor.name,
        },
      });
      await replaceItems(tx, id, input.productIds);
      return toAdminDto(await tx.collection.findUniqueOrThrow({ where: { collection_id: id }, include: INCLUDE }));
    }, TX);
  } catch (e) {
    if (isSlugClash(e)) throw Errors.duplicate('slug', 'Đường dẫn này đã có bộ sưu tập khác dùng.');
    throw e;
  }
}

export async function deleteCollection(id: string): Promise<void> {
  if (!UUID_RE.test(id)) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
  const r = await prisma.collection.deleteMany({ where: { collection_id: id } }); // collection_products xoá theo CASCADE; sản phẩm giữ nguyên
  if (r.count === 0) throw Errors.notFound('Không tìm thấy bộ sưu tập.');
}
