/**
 * Chuyển ảnh cũ đang nằm trên ĐĨA máy mình sang nơi lưu dùng chung (2026-11-21):
 *  - ảnh công khai `media_assets` có `storage = 'local'` (thư mục `backend/.media/`) -> Cloudinary;
 *  - ảnh trả hàng `return_photos` có `storage = 'local'` (thư mục `backend/.media-private/`) -> bảng `return_photo_blobs` (PostgreSQL).
 * id ảnh không đổi nên sản phẩm / trang chủ / đơn hàng không phải sửa. Chạy lại an toàn: dòng đã chuyển thì bỏ qua.
 *
 *   npx tsx scripts/media-migrate.ts --dry-run   # chỉ liệt kê
 *   npx tsx scripts/media-migrate.ts             # chuyển thật (cần CLOUDINARY_URL nếu còn ảnh công khai trên đĩa)
 */
import 'dotenv/config';
import prisma from '../src/config/prisma';
import { getConfig } from '../src/config/env';
import { CloudinaryImageStorage } from '../src/lib/storage/cloudinary';
import { LocalImageStorage } from '../src/lib/storage/local';
import { DbPrivateStorage } from '../src/lib/storage/private-db';
import { LocalPrivateStorage } from '../src/lib/storage/private-local';

const dryRun = process.argv.includes('--dry-run');

async function migratePublic(): Promise<void> {
  const rows = await prisma.mediaAsset.findMany({ where: { storage: 'local' }, select: { mediaId: true, contentType: true } });
  console.log(`Ảnh công khai trên đĩa: ${rows.length}`);
  if (!rows.length || dryRun) return rows.forEach((r) => console.log(`  - ${r.mediaId}`));
  const { media } = getConfig();
  if (!media.cloudinary) throw new Error('Thiếu / sai CLOUDINARY_URL trong backend/.env: không chuyển được ảnh công khai.');
  const local = new LocalImageStorage(media.localDir);
  const cloud = new CloudinaryImageStorage(media.cloudinary);
  let ok = 0;
  for (const r of rows) {
    const file = await local.read(r.mediaId);
    if (!file) {
      console.warn(`  ! ${r.mediaId}: không thấy tệp trên đĩa (máy khác tải lên?), bỏ qua`);
      continue;
    }
    try {
      await cloud.put(r.mediaId, file.data, r.contentType);
    } catch (e) {
      // overwrite=false: ảnh đã có trên Cloudinary (lần chạy trước) vẫn trả 200, nên tới đây là lỗi thật -> bỏ qua ảnh này.
      console.warn(`  ! ${r.mediaId}: ${(e as Error).message}`);
      continue;
    }
    await prisma.mediaAsset.update({ where: { mediaId: r.mediaId }, data: { storage: 'cloudinary' } });
    ok++;
    console.log(`  ✓ ${r.mediaId} -> ${cloud.publicUrl(r.mediaId)}`);
  }
  console.log(`Đã chuyển ${ok}/${rows.length} ảnh công khai.`);
}

async function migratePrivate(): Promise<void> {
  const rows = await prisma.returnPhoto.findMany({ where: { storage: 'local' }, select: { storageKey: true, contentType: true } });
  console.log(`Ảnh trả hàng trên đĩa: ${rows.length}`);
  if (!rows.length || dryRun) return rows.forEach((r) => console.log(`  - ${r.storageKey}`));
  const local = new LocalPrivateStorage(getConfig().returns.photoLocalDir);
  const db = new DbPrivateStorage();
  let ok = 0;
  for (const r of rows) {
    if (!(await db.read(r.storageKey))) {
      const file = await local.read(r.storageKey);
      if (!file) {
        console.warn(`  ! ${r.storageKey}: không thấy tệp trên đĩa, bỏ qua`);
        continue;
      }
      await db.put(r.storageKey, file.data, r.contentType);
    }
    await prisma.returnPhoto.update({ where: { storageKey: r.storageKey }, data: { storage: 'db' } });
    ok++;
    console.log(`  ✓ ${r.storageKey}`);
  }
  console.log(`Đã chuyển ${ok}/${rows.length} ảnh trả hàng.`);
}

(async () => {
  if (dryRun) console.log('(--dry-run: chỉ liệt kê, không ghi gì)');
  await migratePublic();
  await migratePrivate();
})()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
