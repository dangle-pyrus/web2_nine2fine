/** Lớp lưu trữ ảnh tải lên (plan mục 9, S6-Q1). Thêm nơi lưu mới = thêm một file implement giao diện này. */
export interface ImageStorage {
  readonly name: 'local' | 'cloudinary';
  /** `key` = media_id (đã kiểm mẫu). Không ghi đè (tên ngẫu nhiên). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** URL công khai: tuyệt đối (cloudinary) hoặc `/api/media/{key}` (local). */
  publicUrl(key: string): string;
  /** Chỉ driver `local` cần (GET /media phục vụ byte). Driver khác trả null. */
  read(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}

/** Mẫu id ảnh tải lên: `up-<32 hex>.<jpg|png|webp>` (<= 40 ký tự). */
export const MEDIA_ID_RE = /^up-[0-9a-f]{32}\.(jpg|png|webp)$/;
export const CONTENT_TYPE_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
