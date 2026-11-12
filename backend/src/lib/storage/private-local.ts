import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrivateImageStorage } from './private-types';
import { CONTENT_TYPE_BY_EXT, RETURN_PHOTO_KEY_RE } from './private-types';

/** Mặc định `backend/.media-private/` (ngoài git). Từ src/lib/storage hoặc dist/lib/storage đều lên 3 cấp về `backend/`. */
export const DEFAULT_PRIVATE_DIR = path.resolve(__dirname, '../../../.media-private');

/** Driver đĩa cục bộ (dev / test). `key` đã kiểm mẫu `rp-...` nên không có `..` hay dấu phân cách thư mục. */
export class LocalPrivateStorage implements PrivateImageStorage {
  readonly name = 'local' as const;
  constructor(private readonly dir: string = DEFAULT_PRIVATE_DIR) {}

  private fileOf(key: string): string {
    if (!RETURN_PHOTO_KEY_RE.test(key)) throw new Error('invalid-private-key');
    return path.join(this.dir, key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const file = this.fileOf(key);
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, data, { flag: 'wx' });
  }

  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!RETURN_PHOTO_KEY_RE.test(key)) return null;
    try {
      const data = await readFile(this.fileOf(key));
      return { data, contentType: CONTENT_TYPE_BY_EXT[key.split('.').pop()!] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
}
