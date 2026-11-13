import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { defaultHomeData, HomeData, seedMediaIds } from './home-content.default';
import { collectMediaIds, FieldIssue, parseHomeContent, throwIssues } from './home-content.schemas';

export interface ContentActor {
  id: string;
  name: string;
}

interface HomeRow {
  data: HomeData;
  isDefault: boolean;
  updatedAt: Date | null;
  updatedByName: string;
}

async function readRow(db: Db): Promise<HomeRow | null> {
  const row = await db.homeContent.findUnique({ where: { contentId: 1 } });
  if (!row) return null;
  return { data: row.data as unknown as HomeData, isDefault: row.isDefault, updatedAt: row.updatedAt, updatedByName: row.updatedByName };
}

const rowOrDefault = (row: HomeRow | null): HomeRow =>
  row ?? { data: defaultHomeData(), isDefault: true, updatedAt: null, updatedByName: '' };

/* ------------------------------------------------------------ công khai ------------------------------------------------------------ */

/** Số sản phẩm `ACTIVE` theo Moment, MỘT truy vấn (`unnest` + GROUP BY). */
async function momentCounts(db: Db): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<Array<{ moment: string; n: number }>>(Prisma.sql`
    SELECT m::text AS moment, count(*)::int AS n FROM "products" p, unnest(p."moments") AS m WHERE p."status" = 'ACTIVE' GROUP BY m`);
  return new Map(rows.map((r) => [r.moment, Number(r.n)]));
}

/** GET /content/home (BR-CMS-01, BR-MOM-02): chỉ khối `enabled`; thẻ Moment `count` tính khi đọc, `count = 0` bị bỏ. */
export async function getPublicHome() {
  const [row, counts] = await Promise.all([readRow(prisma), momentCounts(prisma)]);
  const { data } = rowOrDefault(row);
  return {
    categories: data.categories,
    moments: data.moments
      .map((m) => ({ ...m, href: `/shop?moment=${m.moment}`, count: counts.get(m.moment) ?? 0 }))
      .filter((m) => m.count > 0),
    blocks: data.blocks
      .filter((b) => b.enabled !== false)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ enabled: _e, ...rest }) => rest),
  };
}

/* ------------------------------------------------------------ admin ------------------------------------------------------------ */

type Warning = { path: string; message: string };

const PRODUCT_HREF = /^\/product\/([a-z0-9-]+)(?:[/?#].*)?$/;
const COLLECTION_HREF = /^\/collections\/([a-z0-9-]+)(?:[/?#].*)?$/;

/** Cảnh báo KHÔNG chặn (BR-CMS-06): `href` trỏ sản phẩm không còn `ACTIVE` / bộ sưu tập không `active`. */
async function warningsOf(db: Db, data: HomeData): Promise<Warning[]> {
  const refs: Array<{ path: string; href: string }> = [];
  const add = (path: string, href: unknown): void => {
    if (typeof href === 'string') refs.push({ path, href });
  };
  data.categories.forEach((c, i) => add(`categories[${i}].href`, (c as { href?: unknown }).href));
  data.blocks.forEach((b, i) => {
    add(`blocks[${i}].href`, b.href);
    add(`blocks[${i}].member.href`, (b.member as { href?: unknown } | undefined)?.href);
    (Array.isArray(b.cards) ? (b.cards as Array<{ href?: unknown }>) : []).forEach((c, j) => add(`blocks[${i}].cards[${j}].href`, c.href));
  });
  const productSlugs = [...new Set(refs.map((r) => PRODUCT_HREF.exec(r.href)?.[1]).filter((s): s is string => !!s))];
  const collectionSlugs = [...new Set(refs.map((r) => COLLECTION_HREF.exec(r.href)?.[1]).filter((s): s is string => !!s))];
  const [activeProducts, activeCollections] = await Promise.all([
    productSlugs.length ? db.product.findMany({ where: { slug: { in: productSlugs }, status: 'ACTIVE' }, select: { slug: true } }) : [],
    collectionSlugs.length ? db.collection.findMany({ where: { slug: { in: collectionSlugs }, status: 'active' }, select: { slug: true } }) : [],
  ]);
  const okP = new Set(activeProducts.map((p) => p.slug));
  const okC = new Set(activeCollections.map((c) => c.slug));
  const out: Warning[] = [];
  for (const r of refs) {
    const p = PRODUCT_HREF.exec(r.href)?.[1];
    if (p && !okP.has(p)) out.push({ path: r.path, message: 'Liên kết trỏ tới sản phẩm không còn hiển thị.' });
    const c = COLLECTION_HREF.exec(r.href)?.[1];
    if (c && !okC.has(c)) out.push({ path: r.path, message: 'Liên kết trỏ tới bộ sưu tập không còn hiển thị.' });
  }
  return out;
}

async function toAdminDto(db: Db, row: HomeRow) {
  return {
    categories: row.data.categories,
    moments: row.data.moments,
    blocks: row.data.blocks,
    isDefault: row.isDefault,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row.updatedByName !== '' ? { name: row.updatedByName } : null,
    warnings: await warningsOf(db, row.data),
  };
}
export type AdminHomeDto = Awaited<ReturnType<typeof toAdminDto>>;

export async function getAdminHome(): Promise<AdminHomeDto> {
  return toAdminDto(prisma, rowOrDefault(await readRow(prisma)));
}

/** Một id `up-...` phải có ở `media_assets`; id còn lại phải thuộc ảnh seed. Một truy vấn cho mọi id `up-`. */
async function unknownMedia(db: Db, items: Array<{ field: string; id: string }>): Promise<FieldIssue[]> {
  const uploaded = [...new Set(items.filter((i) => i.id.startsWith('up-')).map((i) => i.id))];
  const found = new Set(
    uploaded.length
      ? (await db.$queryRaw<Array<{ media_id: string }>>(Prisma.sql`SELECT "media_id" FROM "media_assets" WHERE "media_id" = ANY(${uploaded}::text[])`)).map((r) => r.media_id)
      : [],
  );
  const seed = seedMediaIds();
  return items
    .filter((i) => (i.id.startsWith('up-') ? !found.has(i.id) : !seed.has(i.id)))
    .map((i) => ({ field: i.field, message: 'Ảnh không có trong thư viện.' }));
}

/** Kiểm đầy đủ thân (cấu trúc + ảnh) -> giá trị chuẩn hoá, hoặc ném 422 với MỌI lỗi một lần. */
async function validateHome(raw: unknown) {
  const parsed = parseHomeContent(raw);
  const media = await unknownMedia(prisma, collectMediaIds(raw));
  if (!parsed.ok) throwIssues([...parsed.issues, ...media]);
  if (media.length > 0) throwIssues(media);
  return parsed.value;
}

/** `updated_at` tăng ngặt (mẫu `settings.service.ts`). */
const nextAt = (now: Date, old: Date | null): Date => new Date(Math.max(now.getTime(), old ? old.getTime() + 1 : 0));

const sameVersion = (token: string | null, row: Date | null): boolean =>
  token === null ? row === null : row !== null && Math.floor(new Date(token).getTime()) === Math.floor(row.getTime());

/** Ghi bản `data` với khoá `updatedAt`: 409 + `error.current` khi lệch. Dùng chung cho PUT và reset. */
async function writeHome(actor: ContentActor, data: HomeData, isDefault: boolean, token: string | null, now: Date): Promise<AdminHomeDto> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ ms: number }>>(Prisma.sql`
        SELECT floor(extract(epoch FROM "updated_at") * 1000)::float8 AS ms FROM "home_content" WHERE "content_id" = 1 FOR UPDATE`);
      const cur = await readRow(tx);
      const conflict = async () => Errors.versionConflictWith(await toAdminDto(tx, rowOrDefault(await readRow(tx))));
      if (!cur) {
        if (token !== null) throw await conflict();
        const at = nextAt(now, null);
        const n = await tx.$executeRaw(Prisma.sql`
          INSERT INTO "home_content" ("content_id", "data", "is_default", "updated_at", "updated_by", "updated_by_name")
          VALUES (1, ${JSON.stringify(data)}::jsonb, ${isDefault}, ${ts(at)}, ${actor.id}::uuid, ${actor.name})
          ON CONFLICT ("content_id") DO NOTHING`);
        if (Number(n) === 0) throw await conflict();
      } else {
        if (locked.length === 0 || !sameVersion(token, new Date(Number(locked[0].ms)))) throw await conflict();
        const at = nextAt(now, cur.updatedAt);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "home_content" SET "data" = ${JSON.stringify(data)}::jsonb, "is_default" = ${isDefault}, "updated_at" = ${ts(at)},
                 "updated_by" = ${actor.id}::uuid, "updated_by_name" = ${actor.name} WHERE "content_id" = 1`);
      }
      return toAdminDto(tx, rowOrDefault(await readRow(tx)));
    },
    { timeout: 10_000, maxWait: 5_000 },
  );
}

/** PUT /admin/content/home (BR-CMS-02). `content.edit` đã kiểm ở router TRƯỚC khi đọc thân. */
export async function saveHome(actor: ContentActor, rawBody: unknown, now: Date): Promise<AdminHomeDto> {
  const v = await validateHome(rawBody);
  const data: HomeData = {
    categories: v.categories,
    moments: v.moments as HomeData['moments'],
    blocks: v.blocks.map((b) => ({ ...b, enabled: b.enabled !== false })) as HomeData['blocks'],
  };
  return writeHome(actor, data, false, v.updatedAt, now);
}

/** POST /admin/content/home/reset (Should, BR-CMS-06): ghi đè bằng bản mặc định, `isDefault = true`. */
export async function resetHome(actor: ContentActor, rawBody: unknown, now: Date): Promise<AdminHomeDto> {
  const body = rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : null;
  const token = body?.updatedAt;
  if (!body || (token !== null && (typeof token !== 'string' || Number.isNaN(Date.parse(token))))) {
    throwIssues([{ field: 'updatedAt', message: 'updatedAt không hợp lệ.' }]);
  }
  return writeHome(actor, defaultHomeData(), true, token as string | null, now);
}
