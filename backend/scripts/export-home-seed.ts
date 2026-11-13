/**
 * Xuất nội dung trang chủ mặc định của FE thành backend/prisma/seed-data/home-content.json (+ media-ids.json).
 * Chạy: npx tsx scripts/export-home-seed.ts (chỉ import dữ liệu thuần, không kéo Angular). Chạy lại khi fixture FE đổi; review bằng diff JSON.
 * - home-content.json = { categories, moments, blocks } đúng cấu trúc `GET /content/home` trừ `count` / `href` của moments (tính khi đọc).
 * - media-ids.json = mọi id trong media manifest (cho kiểm `mediaId` ở `PUT /admin/content/home`, BR-CMS-02).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NINE2FINE_LANDING } from '../../frontend/src/mocks/nine2fine-landing';
import { HOME_CONTENT_FIXTURE } from '../../frontend/src/mocks/home-content';
import { MEDIA } from '../../frontend/src/media/media-manifest';

const MOMENT_ORDER = ['work', 'dinner', 'event', 'weekend'] as const;

const moments = MOMENT_ORDER.map((moment) => {
  const card = HOME_CONTENT_FIXTURE.moments.cards.find((c) => c.moment === moment);
  if (!card) throw new Error(`Thiếu thẻ Moment ${moment} trong fixture FE.`);
  return { moment, label: card.title, lines: card.lines, mediaId: card.mediaId };
});

const content = {
  categories: NINE2FINE_LANDING.categories.map((c) => ({ label: c.label, href: c.href, mediaId: c.mediaId })),
  moments,
  blocks: NINE2FINE_LANDING.blocks,
};

const dir = resolve(__dirname, '../prisma/seed-data');
writeFileSync(resolve(dir, 'home-content.json'), JSON.stringify(content, null, 2) + '\n', 'utf8');
const ids = Object.keys(MEDIA).sort();
writeFileSync(resolve(dir, 'media-ids.json'), JSON.stringify(ids, null, 2) + '\n', 'utf8');
console.log(`Đã ghi trang chủ mặc định: ${content.blocks.length} khối, ${content.categories.length} danh mục, ${moments.length} Moment; ${ids.length} id ảnh.`);
