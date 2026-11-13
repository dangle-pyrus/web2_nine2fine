import { randomBytes } from 'node:crypto';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import { sniffImage } from '../../lib/image-info';
import { stripImageMetadata } from '../../lib/image-strip';
import { logger } from '../../lib/logger';
import { getPrivateImageStorage } from '../../lib/storage/private';
import { UUID_RE } from '../../lib/validate';
import { type PhotoAudience, toPhotoDto, type ReturnPhotoDto } from './return.mapper';

/**
 * Ảnh minh chứng trả hàng (plan mục 8). Kho RIÊNG TƯ; byte chỉ ra qua `readReturnPhoto` sau khi kiểm quyền Ở MỖI LẦN.
 * Tên tệp gốc không được lưu. Không log byte / khoá lưu trữ.
 */

export type PhotoOwner = { kind: 'member'; userId: string } | { kind: 'guest'; orderId: string; grantHash: string };

/** Thứ tự lỗi: size -> format -> dimensions. `body` là Buffer từ `express.raw`. */
export async function uploadReturnPhoto(body: unknown, owner: PhotoOwner, audience: PhotoAudience): Promise<ReturnPhotoDto> {
  const cfg = RETURNS_ASSUMPTIONS.photo;
  const buf = Buffer.isBuffer(body) ? body : null;
  if (buf && buf.length > cfg.maxBytes) throw Errors.invalidImage('size');
  if (!buf || buf.length === 0) throw Errors.invalidImage('format');
  const info = sniffImage(buf);
  if (!info) throw Errors.invalidImage('format');
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < cfg.minShort || long > cfg.maxLong) throw Errors.invalidImage('dimensions');

  const clean = stripImageMetadata(buf, info.type);
  const out = sniffImage(clean) ? clean : buf;
  const storage = getPrivateImageStorage();
  const key = `rp-${randomBytes(16).toString('hex')}.${info.ext}`;
  try {
    await storage.put(key, out, info.type);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'unavailable') throw err;
    logger.error('return-photo-put-failed', { driver: storage.name });
    throw Errors.unavailable();
  }
  try {
    const row = await prisma.returnPhoto.create({
      data: {
        storageKey: key, storage: storage.name, contentType: info.type, byteSize: out.length, width: info.width, height: info.height,
        createdAt: clockNow(),
        ...(owner.kind === 'member' ? { uploaderUserId: owner.userId } : { orderId: owner.orderId, grantHash: owner.grantHash }),
      },
    });
    return toPhotoDto(row, audience);
  } catch {
    logger.error('return-photo-record-failed');
    throw Errors.unavailable();
  }
}

export type PhotoViewer = { kind: 'member'; userId: string } | { kind: 'admin' } | { kind: 'guest'; orderId: string };

/** Byte ảnh sau kiểm quyền. Mọi sai (id sai dạng, không có, không quyền, thiếu tệp) -> `404 not-found` không phân biệt. */
export async function readReturnPhoto(viewer: PhotoViewer, photoId: string): Promise<{ data: Buffer; contentType: string }> {
  if (!UUID_RE.test(photoId)) throw Errors.notFound();
  const row = await prisma.returnPhoto.findUnique({
    where: { photo_id: photoId },
    select: { storageKey: true, contentType: true, returnId: true, orderId: true, uploaderUserId: true, orderReturn: { select: { orderId: true, order: { select: { userId: true } } } } },
  });
  if (!row) throw Errors.notFound();
  let allowed = false;
  if (viewer.kind === 'member') {
    allowed = row.returnId === null ? row.uploaderUserId === viewer.userId : row.orderReturn?.order.userId === viewer.userId;
  } else if (viewer.kind === 'admin') {
    allowed = row.returnId !== null; // ảnh chưa gắn yêu cầu không xem được qua admin
  } else {
    allowed = row.returnId === null ? row.orderId === viewer.orderId : row.orderReturn?.orderId === viewer.orderId;
  }
  if (!allowed) throw Errors.notFound();
  const file = await getPrivateImageStorage().read(row.storageKey);
  if (!file) throw Errors.notFound();
  return { data: file.data, contentType: row.contentType };
}
