import { getConfig } from '../../config/env';
import { Errors } from '../errors';
import { LocalImageStorage } from './local';
import { SupabaseImageStorage } from './supabase';
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

/** Driver theo `MEDIA_STORAGE`. `supabase` thiếu biến, hoặc production mà vẫn `local` -> `unavailable` (không ghi sai chỗ). */
export function getImageStorage(): ImageStorage {
  if (override) return override;
  if (cached) return cached;
  const { media, isProduction } = getConfig();
  if (media.storage === 'supabase') {
    if (!media.supabase) throw Errors.unavailable();
    cached = new SupabaseImageStorage(media.supabase);
  } else {
    if (isProduction) throw Errors.unavailable();
    cached = new LocalImageStorage(media.localDir);
  }
  return cached;
}

/** Cảnh báo lúc khởi động (server.ts). Trả thông điệp hoặc null. */
export function mediaStorageWarning(): string | null {
  const { media, isProduction } = getConfig();
  if (media.storage === 'supabase' && !media.supabase) return 'MEDIA_STORAGE=supabase nhưng thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: tải ảnh sẽ báo không khả dụng.';
  if (isProduction && media.storage === 'local') return 'NODE_ENV=production nhưng MEDIA_STORAGE=local: tải ảnh sẽ báo không khả dụng.';
  return null;
}
