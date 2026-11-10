import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_TYPE_BY_EXT, ImageStorage, MEDIA_ID_RE } from './types';

/** Mặc định `backend/.media/` (ngoài git). Từ src/lib/storage hoặc dist/lib/storage đều lên 3 cấp về `backend/`. */
export const DEFAULT_LOCAL_DIR = path.resolve(__dirname, '../../../.media');

/** Driver đĩa cục bộ (dev / test). `key` đã kiểm mẫu nên không có `..` hay dấu phân cách thư mục. */
export class LocalImageStorage implements ImageStorage {
  readonly name = 'local' as const;
  constructor(private readonly dir: string = DEFAULT_LOCAL_DIR) {}

  private fileOf(key: string): string {
    if (!MEDIA_ID_RE.test(key)) throw new Error('invalid-media-key');
    return path.join(this.dir, key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const file = this.fileOf(key);
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, data, { flag: 'wx' }); // wx: không ghi đè
  }

  publicUrl(key: string): string {
    return `/api/media/${key}`;
  }

  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!MEDIA_ID_RE.test(key)) return null;
    try {
      const data = await readFile(this.fileOf(key));
      return { data, contentType: CONTENT_TYPE_BY_EXT[key.split('.').pop()!] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
}
