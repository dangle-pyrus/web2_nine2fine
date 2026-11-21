import { createHash } from 'node:crypto';
import { ImageStorage, MEDIA_ID_RE } from './types';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Thư mục trên Cloudinary (public_id = `{folder}/up-<hex>`). */
  folder: string;
}

type FetchFn = typeof fetch;

/** `cloudinary://<api_key>:<api_secret>@<cloud_name>` (chuỗi Cloudinary cấp ở Dashboard) -> cấu hình; sai mẫu -> null. */
export function parseCloudinaryUrl(raw: string | undefined, folder: string): CloudinaryConfig | null {
  if (!raw) return null;
  const m = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([a-z0-9_-]+)\/?$/i.exec(raw.trim());
  if (!m) return null;
  return { apiKey: decodeURIComponent(m[1]), apiSecret: decodeURIComponent(m[2]), cloudName: m[3], folder: folder.replace(/^\/+|\/+$/g, '') };
}

/** Chữ ký Cloudinary: các tham số (trừ file, api_key) xếp theo tên, nối `k=v&...`, thêm api_secret, SHA-1 hex. */
export function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const s = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(s + apiSecret).digest('hex');
}

/**
 * Driver Cloudinary qua REST (không thêm thư viện): ảnh CÔNG KHAI (sản phẩm, banner trang chủ). Tải lên có chữ ký
 * (`overwrite=false`), phục vụ qua CDN `res.cloudinary.com` với `f_auto,q_auto` (tự chọn WebP/AVIF, nén hợp lý).
 * `/api/media/{id}` trả 302 về URL này nên id lưu trong DB và FE không đổi theo driver.
 * API secret chỉ dùng để ký: không gửi đi, không log, không nằm trong lỗi.
 */
export class CloudinaryImageStorage implements ImageStorage {
  readonly name = 'cloudinary' as const;
  constructor(
    private readonly cfg: CloudinaryConfig,
    private readonly fetchFn: FetchFn = (...a) => fetch(...a),
    private readonly now: () => number = () => Date.now(),
  ) {}

  private publicId(key: string): string {
    const base = key.replace(/\.[a-z]+$/, '');
    return this.cfg.folder ? `${this.cfg.folder}/${base}` : base;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (!MEDIA_ID_RE.test(key)) throw new Error('invalid-media-key');
    const params = { overwrite: 'false', public_id: this.publicId(key), timestamp: String(Math.floor(this.now() / 1000)) };
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append('api_key', this.cfg.apiKey);
    form.append('signature', cloudinarySignature(params, this.cfg.apiSecret));
    form.append('file', new Blob([new Uint8Array(data)], { type: contentType }), key);
    const res = await this.fetchFn(`https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/image/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`cloudinary-put-failed:${res.status}`);
  }

  publicUrl(key: string): string {
    const ext = key.split('.').pop();
    return `https://res.cloudinary.com/${this.cfg.cloudName}/image/upload/f_auto,q_auto/${this.publicId(key)}.${ext}`;
  }

  /** Không phục vụ byte qua máy chủ: GET /media chuyển hướng về CDN. */
  async read(): Promise<null> {
    return null;
  }
}
