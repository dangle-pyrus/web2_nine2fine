import { z } from 'zod';
import { Errors } from '../../lib/errors';
import { parseSearchTokens } from '../../lib/text';
import type { ListQuery, SortKey } from './catalog.types';

const SORTS: SortKey[] = ['featured', 'newest', 'price-asc', 'price-desc', 'bestselling'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Express 5 (query parser đơn giản): tham số lặp thành mảng -> không phải string -> lỗi ở đúng tên tham số.
const optString = z.string().optional();
const rawSchema = z.object({
  gender: optString,
  category: optString,
  moment: optString,
  size: optString,
  color: optString,
  maxPrice: optString,
  available: optString,
  q: optString,
  sort: optString,
  page: optString,
  limit: optString,
  ids: optString,
});

const empty = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

function intIn(name: string, v: string | undefined, min: number, max: number, def: number): number {
  if (v === undefined) return def;
  if (!/^\d{1,9}$/.test(v)) throw Errors.validation(`Tham số ${name} không hợp lệ.`, name);
  const n = Number(v);
  if (n < min || n > max) throw Errors.validation(`Tham số ${name} không hợp lệ.`, name);
  return n;
}

/** Chuẩn hoá và kiểm tra query danh sách. Ném Errors.validation với field là tên tham số. */
export function parseListQuery(query: unknown): ListQuery {
  const parsed = rawSchema.safeParse(query);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? 'query');
    throw Errors.validation(`Tham số ${field} không hợp lệ.`, field);
  }
  const r = parsed.data;

  let maxPrice: number | undefined;
  const mp = empty(r.maxPrice);
  if (mp !== undefined) {
    if (!/^\d{1,12}$/.test(mp)) throw Errors.validation('Tham số maxPrice không hợp lệ.', 'maxPrice');
    maxPrice = Number(mp) === 0 ? undefined : Number(mp);
  }

  const av = empty(r.available);
  if (av !== undefined && av !== 'true' && av !== 'false') {
    throw Errors.validation('Tham số available không hợp lệ.', 'available');
  }

  const qRaw = empty(r.q);
  let tokens: string[] = [];
  if (qRaw !== undefined) {
    const q = qRaw.replace(/\s+/g, ' ').normalize('NFC');
    if ([...q].length > 100) throw Errors.validation('Từ khoá tìm kiếm quá dài.', 'q');
    tokens = parseSearchTokens(q);
  }

  const sort = empty(r.sort) ?? 'featured';
  if (!SORTS.includes(sort as SortKey)) throw Errors.validation('Tham số sort không hợp lệ.', 'sort');

  let ids: string[] | undefined;
  const idsRaw = empty(r.ids);
  if (idsRaw !== undefined) {
    const parts = idsRaw.split(',').map((s) => s.trim());
    if (parts.length > 48) throw Errors.validation('Tối đa 48 sản phẩm mỗi lần.', 'ids');
    ids = [...new Set(parts.filter((s) => UUID_RE.test(s)).map((s) => s.toLowerCase()))];
  }

  return {
    gender: empty(r.gender),
    category: empty(r.category),
    moment: empty(r.moment),
    size: empty(r.size)?.toUpperCase(),
    color: empty(r.color)?.normalize('NFC'),
    maxPrice,
    available: av === 'true',
    tokens,
    sort: sort as SortKey,
    page: intIn('page', empty(r.page), 1, 10000, 1),
    limit: intIn('limit', empty(r.limit), 1, 48, 24),
    ids,
  };
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Slug đường dẫn: trim + chữ thường; không hợp lệ -> null (controller trả 404). */
export function normalizeSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (s.length < 3 || s.length > 80 || !SLUG_RE.test(s)) return null;
  return s;
}
