import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { UUID_RE } from '../../lib/validate';

const CFG = P1_ASSUMPTIONS.recommendations;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export interface RecQuery {
  /** UUID (chữ thường) hoặc slug, giữ thứ tự, bỏ trùng; phần tử sai dạng bị bỏ (như id lạ). */
  tokens: string[];
  limit: number;
}

const one = (v: unknown): string | undefined => (Array.isArray(v) ? v.map(String).join(',') : typeof v === 'string' ? v : undefined);

/** `ids`: 0..10 phần tử sau khi bỏ phần rỗng (> 10 -> 422 `ids`); `limit`: nguyên 1..8, mặc định 4 (ngoài khoảng / không phải số -> 422 `limit`). */
export function parseRecQuery(q: Record<string, unknown>): RecQuery {
  const rawLimit = one(q.limit);
  let limit: number = CFG.limit.default;
  if (rawLimit !== undefined) {
    if (!/^[0-9]{1,3}$/.test(rawLimit.trim())) throw Errors.validation(`limit phải là số nguyên từ 1 đến ${CFG.limit.max}.`, 'limit');
    limit = Number(rawLimit.trim());
    if (limit < 1 || limit > CFG.limit.max) throw Errors.validation(`limit phải là số nguyên từ 1 đến ${CFG.limit.max}.`, 'limit');
  }
  const rawIds = one(q.ids);
  if (rawIds !== undefined && rawIds.length > 800) throw Errors.validation('Danh sách ids quá dài.', 'ids');
  const parts = (rawIds ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  if (parts.length > CFG.maxInputs) throw Errors.validation(`Tối đa ${CFG.maxInputs} sản phẩm đầu vào.`, 'ids');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of parts) {
    if (!(UUID_RE.test(t) || SLUG_RE.test(t)) || seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
  }
  return { tokens, limit };
}
