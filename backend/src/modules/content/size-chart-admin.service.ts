import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { ts } from '../../lib/sql';
import { getCategoryMaps } from '../catalog/catalog.cache';
import { parseSizeChart, SizeChartData, throwIssues } from './home-content.schemas';
import type { ContentActor } from './home-content.service';

type ChartRow = { data: unknown; updatedAt: Date; updatedByName: string } | null;

const EMPTY: SizeChartData = { body: [], garment: [], bodyColumns: [], garmentColumns: [] };

function toAdminChart(category: { slug: string; name: string }, productCount: number, row: ChartRow) {
  const d = (row?.data ?? EMPTY) as SizeChartData;
  const customised = !!row && row.updatedByName !== '';
  return {
    category: category.slug,
    label: category.name,
    productCount,
    customised,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedBy: customised ? { name: row!.updatedByName } : null,
    chart: { body: d.body, garment: d.garment, bodyColumns: d.bodyColumns, garmentColumns: d.garmentColumns },
  };
}
export type AdminSizeChartDto = ReturnType<typeof toAdminChart>;

/** GET /admin/size-charts: một phần tử mỗi danh mục theo `sortOrder` (BR-CMS-03). */
export async function listAdminSizeCharts() {
  const [cats, rows, counts] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] }),
    prisma.sizeChart.findMany(),
    prisma.$queryRaw<Array<{ category_id: string; n: number }>>(Prisma.sql`SELECT "category_id", count(*)::int AS n FROM "products" GROUP BY "category_id"`),
  ]);
  const byCat = new Map(rows.map((r) => [r.categoryId, r]));
  const n = new Map(counts.map((c) => [c.category_id, Number(c.n)]));
  return { items: cats.map((c) => toAdminChart(c, n.get(c.category_id) ?? 0, byCat.get(c.category_id) ?? null)) };
}

/** PUT /admin/size-charts/{category}. Thứ tự: 404 danh mục -> 422 (mọi lỗi) -> 409 (kèm `current`) -> ghi. */
export async function saveSizeChart(actor: ContentActor, categorySlug: string, rawBody: unknown, now: Date): Promise<AdminSizeChartDto> {
  const slug = categorySlug.trim().toLowerCase();
  const categoryId = (await getCategoryMaps()).bySlug.get(slug);
  if (!categoryId) throw Errors.notFound();
  const parsed = parseSizeChart(rawBody);
  if (!parsed.ok) throwIssues(parsed.issues);
  const cat = await prisma.category.findUniqueOrThrow({ where: { category_id: categoryId } });

  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ ms: number }>>(Prisma.sql`
        SELECT floor(extract(epoch FROM "updated_at") * 1000)::float8 AS ms FROM "size_charts" WHERE "category_id" = ${categoryId}::uuid FOR UPDATE`);
      const count = async () => Number((await tx.product.count({ where: { categoryId } })) ?? 0);
      const reread = async (): Promise<ChartRow> => tx.sizeChart.findUnique({ where: { categoryId } });
      const conflict = async () => Errors.versionConflictWith(toAdminChart(cat, await count(), await reread()));
      const data = JSON.stringify(parsed.value);
      if (locked.length === 0) {
        if (parsed.updatedAt !== null) throw await conflict();
        const n = await tx.$executeRaw(Prisma.sql`
          INSERT INTO "size_charts" ("category_id", "data", "updated_at", "updated_by", "updated_by_name")
          VALUES (${categoryId}::uuid, ${data}::jsonb, ${ts(now)}, ${actor.id}::uuid, ${actor.name}) ON CONFLICT ("category_id") DO NOTHING`);
        if (Number(n) === 0) throw await conflict();
      } else {
        const oldMs = Number(locked[0].ms);
        if (parsed.updatedAt === null || Math.floor(new Date(parsed.updatedAt).getTime()) !== Math.floor(oldMs)) throw await conflict();
        const at = new Date(Math.max(now.getTime(), Math.floor(oldMs) + 1));
        await tx.$executeRaw(Prisma.sql`
          UPDATE "size_charts" SET "data" = ${data}::jsonb, "updated_at" = ${ts(at)}, "updated_by" = ${actor.id}::uuid, "updated_by_name" = ${actor.name}
          WHERE "category_id" = ${categoryId}::uuid`);
      }
      return toAdminChart(cat, await count(), await reread());
    },
    { timeout: 10_000, maxWait: 5_000 },
  );
}
