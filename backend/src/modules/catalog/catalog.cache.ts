import prisma from '../../config/prisma';
import { now } from '../../lib/clock';

const TTL_MS = 300_000;

interface CategoryMaps {
  bySlug: Map<string, string>;
  byId: Map<string, string>;
  loadedAt: number;
}

let cache: CategoryMaps | null = null;

async function load(): Promise<CategoryMaps> {
  const rows = await prisma.category.findMany({ select: { category_id: true, slug: true } });
  cache = {
    bySlug: new Map(rows.map((r) => [r.slug, r.category_id])),
    byId: new Map(rows.map((r) => [r.category_id, r.slug])),
    loadedAt: now().getTime(),
  };
  return cache;
}

export async function getCategoryMaps(forceReload = false): Promise<CategoryMaps> {
  const t = now().getTime();
  if (!forceReload && cache && t - cache.loadedAt < TTL_MS && t >= cache.loadedAt) return cache;
  return load();
}

/** Dùng trong test sau khi dựng lại dữ liệu danh mục. */
export function clearCategoryCache(): void {
  cache = null;
}
