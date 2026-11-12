import { Errors } from '../errors';
import { logger } from '../logger';
import type { PrivateImageStorage } from './private-types';
import { RETURN_PHOTO_KEY_RE } from './private-types';

export interface SupabasePrivateConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  /** Bucket công khai của ảnh sản phẩm: trùng thì khoá. */
  publicBucket: string;
}

type FetchFn = typeof fetch;

/**
 * Driver Supabase Storage RIÊNG TƯ qua REST (không thêm thư viện). Ghi `POST /object/{bucket}/{key}`, đọc
 * `GET /object/authenticated/{bucket}/{key}` (KHÔNG BAO GIỜ endpoint `public`), đều bằng service role key.
 * Chốt chặn fail-closed: lần dùng đầu mỗi tiến trình gọi `GET /bucket/{bucket}`; `public` khác `false` hoặc trùng bucket công khai
 * -> mọi thao tác `unavailable`. Lỗi mạng khi kiểm -> `unavailable` nhưng chưa ghi nhớ (thử lại lần sau).
 * Service role key chỉ đi vào header `Authorization`: không log, không nằm trong lỗi.
 */
export class SupabasePrivateStorage implements PrivateImageStorage {
  readonly name = 'supabase' as const;
  private verdict: 'safe' | 'unsafe' | undefined;

  constructor(
    private readonly cfg: SupabasePrivateConfig,
    private readonly fetchFn: FetchFn = (...a) => fetch(...a),
  ) {}

  private base(): string {
    return this.cfg.url.replace(/\/$/, '');
  }
  private auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.cfg.serviceRoleKey}` };
  }

  private async guard(): Promise<void> {
    if (this.verdict === 'safe') return;
    if (this.verdict === 'unsafe') throw Errors.unavailable();
    if (this.cfg.bucket === this.cfg.publicBucket) {
      this.verdict = 'unsafe';
      logger.warn('return-bucket-is-public-bucket');
      throw Errors.unavailable();
    }
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base()}/storage/v1/bucket/${encodeURIComponent(this.cfg.bucket)}`, { method: 'GET', headers: this.auth() });
    } catch {
      throw Errors.unavailable();
    }
    if (!res.ok) throw Errors.unavailable();
    const info = (await res.json().catch(() => null)) as { public?: unknown } | null;
    if (!info || info.public !== false) {
      // `public` thiếu / true: không chứng minh được bucket riêng tư -> khoá (fail closed).
      this.verdict = 'unsafe';
      logger.warn('return-bucket-not-private');
      throw Errors.unavailable();
    }
    this.verdict = 'safe';
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (!RETURN_PHOTO_KEY_RE.test(key)) throw new Error('invalid-private-key');
    await this.guard();
    const res = await this.fetchFn(`${this.base()}/storage/v1/object/${this.cfg.bucket}/${key}`, {
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': contentType, 'x-upsert': 'false' },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`supabase-private-put-failed:${res.status}`);
  }

  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!RETURN_PHOTO_KEY_RE.test(key)) return null;
    await this.guard();
    const res = await this.fetchFn(`${this.base()}/storage/v1/object/authenticated/${this.cfg.bucket}/${key}`, { method: 'GET', headers: this.auth() });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`supabase-private-read-failed:${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    return { data, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }
}
