import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

dotenv.config();

/**
 * Seed idempotent nội dung trang chủ mặc định (BR-CMS-01, D7): chèn dòng duy nhất `home_content` (content_id = 1) từ
 * `prisma/seed-data/home-content.json` CHỈ khi chưa có dòng nào (`skipDuplicates`); KHÔNG BAO GIỜ đè bản admin đã sửa.
 * Chạy: `npm run seed:home`. Không bắt buộc: thiếu dòng thì `GET /content/home` dùng chính bản mặc định này trong mã.
 * (Script sinh JSON từ fixture FE `export-home-seed.ts` đã chuyển ra archive 2026-11-21; JSON giờ sửa tay.)
 */
export async function seedHomeContent(prisma: PrismaClient): Promise<{ inserted: boolean }> {
  const data = JSON.parse(readFileSync(resolve(__dirname, 'seed-data/home-content.json'), 'utf8')) as object;
  const r = await prisma.homeContent.createMany({
    data: [{ contentId: 1, data, isDefault: true, updatedByName: '' }],
    skipDuplicates: true,
  });
  return { inserted: r.count === 1 };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { inserted } = await seedHomeContent(prisma);
    console.log(inserted ? 'Đã tạo nội dung trang chủ mặc định.' : 'Đã có nội dung trang chủ: giữ nguyên (không đè).');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error('Seed trang chủ thất bại:', e instanceof Error ? e.name : 'lỗi không rõ');
    process.exit(1);
  });
}
