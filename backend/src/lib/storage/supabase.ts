import { ImageStorage, MEDIA_ID_RE } from './types';

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

type FetchFn = typeof fetch;

/**
 * Driver Supabase Storage qua REST (không thêm thư viện). Bucket công khai (`product-images`).
 * CHƯA kiểm với Supabase thật (chờ S6-Q1 / lát 6.8); test dùng `fetch` giả.
 * Service role key là bí mật: chỉ đi vào header `Authorization`, không log, không trả cho FE, không nằm trong lỗi.
 */
export class SupabaseImageStorage implements ImageStorage {
  readonly name = 'supabase' as const;
  constructor(
    private readonly cfg: SupabaseStorageConfig,
    private readonly fetchFn: FetchFn = (...a) => fetch(...a),
  ) {}

  private base(): string {
    return this.cfg.url.replace(/\/$/, '');
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (!MEDIA_ID_RE.test(key)) throw new Error('invalid-media-key');
    const res = await this.fetchFn(`${this.base()}/storage/v1/object/${this.cfg.bucket}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.serviceRoleKey}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`supabase-storage-put-failed:${res.status}`);
  }

  publicUrl(key: string): string {
    return `${this.base()}/storage/v1/object/public/${this.cfg.bucket}/${key}`;
  }

  async read(): Promise<null> {
    return null;
  }
}
