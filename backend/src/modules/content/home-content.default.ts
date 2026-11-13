import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bản MẶC ĐỊNH của trang chủ (BR-CMS-01) và danh sách id ảnh seed hợp lệ (BR-CMS-02). Cùng nguồn với `npm run seed:home`:
 * `prisma/seed-data/*.json` (đường dẫn tính từ `src/modules/content` hoặc `dist/modules/content`, đều cách thư mục backend 3 cấp).
 * Nạp một lần, trả bản sao sâu để không ai sửa nhầm bản gốc.
 */
export interface HomeData {
  categories: unknown[];
  moments: Array<{ moment: string; label: string; lines: string[]; mediaId: string }>;
  blocks: Array<Record<string, unknown>>;
}

const SEED_DIR = resolve(__dirname, '../../../prisma/seed-data');
let defaultCache: HomeData | null = null;
let mediaCache: Set<string> | null = null;

export function defaultHomeData(): HomeData {
  if (!defaultCache) defaultCache = JSON.parse(readFileSync(resolve(SEED_DIR, 'home-content.json'), 'utf8')) as HomeData;
  return structuredClone(defaultCache);
}

export function seedMediaIds(): ReadonlySet<string> {
  if (!mediaCache) mediaCache = new Set(JSON.parse(readFileSync(resolve(SEED_DIR, 'media-ids.json'), 'utf8')) as string[]);
  return mediaCache;
}
