import { getConfig } from '../../config/env';
import { Errors } from '../errors';
import { CloudinaryImageStorage } from './cloudinary';
import { LocalImageStorage } from './local';
import type { ImageStorage } from './types';

export type { ImageStorage } from './types';
export { MEDIA_ID_RE } from './types';

let override: ImageStorage | undefined;
let cached: ImageStorage | undefined;

/** Chỉ cho test: ép driver (undefined = quay về theo env). */
export function setImageStorage(s: ImageStorage | undefined): void {
  override = s;
  cached = undefined;
}

/**
 * Driver theo `MEDIA_STORAGE`. `cloudinary` thiếu biến, hoặc production mà vẫn `local` -> `unavailable`
 * (không ghi vào đĩa tạm của máy chủ triển khai rồi mất sau lần deploy sau).
 */
export function getImageStorage(): ImageStorage {
  if (override) return override;
  if (cached) return cached;
  const { media, isProduction } = getConfig();
  if (media.storage === 'cloudinary') {
    if (!media.cloudinary) throw Errors.unavailable();
    cached = new CloudinaryImageStorage(media.cloudinary);
  } else {
    if (isProduction) throw Errors.unavailable();
    cached = new LocalImageStorage(media.localDir);
  }
  return cached;
}

/** Cảnh báo lúc khởi động (server.ts). Trả thông điệp hoặc null. */
export function mediaStorageWarning(): string | null {
  const { media, isProduction } = getConfig();
  if (media.storage === 'cloudinary' && !media.cloudinary) return 'MEDIA_STORAGE=cloudinary nhưng thiếu / sai CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>): tải ảnh sẽ báo không khả dụng.';
  if (isProduction && media.storage === 'local') return 'NODE_ENV=production nhưng MEDIA_STORAGE=local: tải ảnh sẽ báo không khả dụng.';
  return null;
}
