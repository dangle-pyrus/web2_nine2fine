import { randomBytes } from 'node:crypto';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { sniffImage } from '../../lib/image-info';
import { logger } from '../../lib/logger';
import { getImageStorage } from '../../lib/storage';
import { MEDIA_ID_RE } from '../../lib/storage/types';

export interface UploadedImageDto {
  id: string;
  url: string;
  alt: '';
  color: '';
  width: number;
  height: number;
  size: number;
  contentType: string;
}

/** `/api/media/{id}` cho ảnh tải lên; null cho ảnh thư viện (FE tra media manifest, BR-INV-27). */
export const mediaUrlOf = (id: string): string | null => (MEDIA_ID_RE.test(id) ? `/api/media/${id}` : null);

/**
 * Tải 1 ảnh (BR-INV-24). Thứ tự lỗi: size -> format -> dimensions. Định dạng và tên theo NỘI DUNG, không theo
 * đuôi / Content-Type của client. Ghi tệp rồi INSERT; INSERT lỗi sau khi ghi tệp -> tệp mồ côi (chấp nhận, BR-INV-28).
 */
export async function uploadProductImage(body: unknown, userId: string): Promise<UploadedImageDto> {
  const cfg = CATALOG_ASSUMPTIONS.image;
  const buf = Buffer.isBuffer(body) ? body : null;
  if (buf && buf.length > cfg.maxBytes) throw Errors.invalidImage('size');
  if (!buf || buf.length === 0) throw Errors.invalidImage('format');
  const info = sniffImage(buf);
  if (!info) throw Errors.invalidImage('format');
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < cfg.minShort || long > cfg.maxLong) throw Errors.invalidImage('dimensions');

  const storage = getImageStorage();
  const id = `up-${randomBytes(16).toString('hex')}.${info.ext}`;
  try {
    await storage.put(id, buf, info.type);
  } catch {
    logger.error('media-put-failed', { driver: storage.name });
    throw Errors.unavailable();
  }
  try {
    await prisma.mediaAsset.create({
      data: { mediaId: id, storage: storage.name, contentType: info.type, byteSize: buf.length, width: info.width, height: info.height, createdById: userId },
    });
  } catch {
    logger.error('media-record-failed', { mediaId: id });
    throw Errors.unavailable();
  }
  return { id, url: `/api/media/${id}`, alt: '', color: '', width: info.width, height: info.height, size: buf.length, contentType: info.type };
}

export type ResolvedMedia = { kind: 'bytes'; data: Buffer; contentType: string } | { kind: 'redirect'; url: string };

/** GET /media/:id: chỉ ảnh đã tải lên (có dòng media_assets). Không có -> not-found. */
export async function resolveMedia(id: string): Promise<ResolvedMedia> {
  if (!MEDIA_ID_RE.test(id)) throw Errors.notFound();
  const row = await prisma.mediaAsset.findUnique({ where: { mediaId: id }, select: { mediaId: true, contentType: true } });
  if (!row) throw Errors.notFound();
  const storage = getImageStorage();
  if (storage.name === 'supabase') return { kind: 'redirect', url: storage.publicUrl(id) };
  const file = await storage.read(id);
  if (!file) throw Errors.notFound();
  return { kind: 'bytes', data: file.data, contentType: row.contentType };
}
