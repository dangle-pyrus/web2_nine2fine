import { getConfig } from '../../config/env';
import { Errors } from '../errors';
import { LocalPrivateStorage } from './private-local';
import { SupabasePrivateStorage } from './private-supabase';
import type { PrivateImageStorage } from './private-types';

export type { PrivateImageStorage } from './private-types';
export { CONTENT_TYPE_BY_EXT, RETURN_PHOTO_KEY_RE } from './private-types';

let override: PrivateImageStorage | undefined;
let cached: PrivateImageStorage | undefined;

/** Chỉ cho test: ép driver (undefined = quay về theo env). */
export function setPrivateImageStorage(s: PrivateImageStorage | undefined): void {
  override = s;
  cached = undefined;
}

/** Driver theo `MEDIA_STORAGE`. Production + `local`, hoặc `supabase` thiếu biến -> `unavailable` (không ghi sai chỗ). */
export function getPrivateImageStorage(): PrivateImageStorage {
  if (override) return override;
  if (cached) return cached;
  const { media, isProduction, returns } = getConfig();
  if (media.storage === 'supabase') {
    if (!media.supabase) throw Errors.unavailable();
    cached = new SupabasePrivateStorage({
      url: media.supabase.url,
      serviceRoleKey: media.supabase.serviceRoleKey,
      bucket: returns.photoBucket,
      publicBucket: returns.publicBucket,
    });
  } else {
    if (isProduction) throw Errors.unavailable();
    cached = new LocalPrivateStorage(returns.photoLocalDir);
  }
  return cached;
}

/** Cảnh báo lúc khởi động (server.ts). */
export function returnStorageWarning(): string | null {
  const { media, isProduction, returns } = getConfig();
  if (media.storage === 'supabase' && !media.supabase) return 'MEDIA_STORAGE=supabase nhưng thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: tải ảnh trả hàng sẽ báo không khả dụng.';
  if (isProduction && media.storage === 'local') return 'NODE_ENV=production nhưng MEDIA_STORAGE=local: tải ảnh trả hàng sẽ báo không khả dụng.';
  if (media.storage === 'supabase' && returns.photoBucket === returns.publicBucket) return 'SUPABASE_RETURN_BUCKET trùng bucket công khai: ảnh trả hàng bị khoá (không khả dụng).';
  return null;
}

/** Cảnh báo thiếu khoá mã hoá số tài khoản (production). */
export function returnAccountKeyWarning(): string | null {
  const { isProduction, returns } = getConfig();
  return isProduction && !returns.accountKey ? 'Thiếu RETURN_ACCOUNT_KEY (32 byte base64): tạo yêu cầu trả hàng COD sẽ báo không khả dụng.' : null;
}
