/**
 * Kho ảnh RIÊNG TƯ (Slice 9, plan mục 8). Khác `ImageStorage`: không có `publicUrl`; chỉ máy chủ đọc / ghi, byte đi ra
 * qua endpoint có kiểm quyền. Khoá `rp-<32 hex>.<ext>` KHÔNG khớp `MEDIA_ID_RE` nên `/api/media/*` không bao giờ phục vụ được.
 */
export interface PrivateImageStorage {
  readonly name: 'local' | 'db' | 'memory';
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}

export const RETURN_PHOTO_KEY_RE = /^rp-[0-9a-f]{32}\.(jpg|png|webp)$/;
export const CONTENT_TYPE_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

