import { getConfig } from '../../config/env';
import { Errors } from '../errors';
import { DbPrivateStorage } from './private-db';
import { LocalPrivateStorage } from './private-local';
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

/**
 * Theo `RETURN_PHOTO_STORAGE`: `db` (mặc định, PostgreSQL, dùng được cả production) hoặc `local` (đĩa; production -> `unavailable`).
 */
export function getPrivateImageStorage(): PrivateImageStorage {
  if (override) return override;
  if (cached) return cached;
  const { isProduction, returns } = getConfig();
  if (returns.photoStorage === 'db') {
    cached = new DbPrivateStorage();
  } else {
    if (isProduction) throw Errors.unavailable();
    cached = new LocalPrivateStorage(returns.photoLocalDir);
  }
  return cached;
}

/** Cảnh báo lúc khởi động (server.ts). */
export function returnStorageWarning(): string | null {
  const { isProduction, returns } = getConfig();
  if (isProduction && returns.photoStorage === 'local') return 'NODE_ENV=production nhưng RETURN_PHOTO_STORAGE=local: tải ảnh trả hàng sẽ báo không khả dụng (dùng db).';
  return null;
}

/** Cảnh báo thiếu khoá mã hoá số tài khoản (production). */
export function returnAccountKeyWarning(): string | null {
  const { isProduction, returns } = getConfig();
  return isProduction && !returns.accountKey ? 'Thiếu RETURN_ACCOUNT_KEY (32 byte base64): tạo yêu cầu trả hàng COD sẽ báo không khả dụng.' : null;
}
