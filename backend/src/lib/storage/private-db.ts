import prisma from '../../config/prisma';
import type { PrivateImageStorage } from './private-types';
import { RETURN_PHOTO_KEY_RE } from './private-types';

/**
 * Kho RIÊNG TƯ trong PostgreSQL (bytea, bảng `return_photo_blobs`). Hợp với ảnh minh chứng: ít (<= 5 ảnh x 5 MB / yêu cầu),
 * phải kiểm quyền mỗi lần xem, và máy chủ triển khai không có ổ đĩa bền vững. Sao lưu cùng DB.
 */
export class DbPrivateStorage implements PrivateImageStorage {
  readonly name = 'db' as const;

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (!RETURN_PHOTO_KEY_RE.test(key)) throw new Error('invalid-private-key');
    // create (không upsert): trùng khoá -> lỗi, không ghi đè (như cờ `wx` của kho đĩa).
    await prisma.returnPhotoBlob.create({ data: { storageKey: key, contentType, data: new Uint8Array(data) } });
  }

  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!RETURN_PHOTO_KEY_RE.test(key)) return null;
    const row = await prisma.returnPhotoBlob.findUnique({ where: { storageKey: key }, select: { data: true, contentType: true } });
    return row ? { data: Buffer.from(row.data), contentType: row.contentType } : null;
  }
}
