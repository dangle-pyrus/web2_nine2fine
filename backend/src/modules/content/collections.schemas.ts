import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { slugify } from '../../lib/slug';
import { UUID_RE } from '../../lib/validate';
import type { FieldIssue } from './home-content.schemas';

const C = P1_ASSUMPTIONS.collections;

export interface CollectionInput {
  name: string;
  /** undefined = sinh từ `name` (tạo) / giữ nguyên (sửa). */
  slug?: string;
  description: string;
  status: 'active' | 'draft';
  productIds: string[];
  /** Chỉ ở `PUT`: khoá chống ghi chồng. */
  updatedAt?: string;
}

const SLUG_RE = /^[a-z0-9-]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const len = (s: string): number => [...s].length;
const clean = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Kiểm thân `CollectionInput` (BR-CMS-07), MỌI lỗi theo trường. Tồn tại của `productIds` kiểm ở service (cần DB). */
export function parseCollection(raw: unknown, withVersion: boolean): { ok: true; value: CollectionInput } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, issues: [{ field: 'body', message: 'Dữ liệu gửi lên không hợp lệ.' }] };

  const nameRaw = typeof o.name === 'string' ? clean(o.name) : '';
  if (typeof o.name !== 'string' || len(nameRaw) < 1 || len(nameRaw) > C.nameMax || CONTROL.test(nameRaw)) {
    issues.push({ field: 'name', message: `Tên từ 1 đến ${C.nameMax} ký tự.` });
  }

  let slug: string | undefined;
  if (o.slug !== undefined && o.slug !== null && o.slug !== '') {
    const s = typeof o.slug === 'string' ? o.slug.trim() : '';
    if (typeof o.slug !== 'string' || s.length < C.slug.min || s.length > C.slug.max || !SLUG_RE.test(s)) {
      issues.push({ field: 'slug', message: `Đường dẫn gồm chữ thường a-z, số, dấu gạch ngang, ${C.slug.min} đến ${C.slug.max} ký tự.` });
    } else slug = s;
  }

  let description = '';
  if (o.description !== undefined) {
    const d = typeof o.description === 'string' ? o.description.normalize('NFC').replace(/\r\n?/g, '\n').trim() : null;
    // eslint-disable-next-line no-control-regex
    if (d === null || len(d) > C.descriptionMax || /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(d)) {
      issues.push({ field: 'description', message: `Mô tả tối đa ${C.descriptionMax} ký tự.` });
    } else description = d;
  }

  let status: 'active' | 'draft' = 'draft';
  if (o.status !== undefined) {
    if (o.status !== 'active' && o.status !== 'draft') issues.push({ field: 'status', message: 'Trạng thái không hợp lệ.' });
    else status = o.status;
  }

  let productIds: string[] = [];
  if (o.productIds !== undefined) {
    const arr = o.productIds;
    if (!Array.isArray(arr) || arr.length > C.maxProducts) {
      issues.push({ field: 'productIds', message: `Tối đa ${C.maxProducts} sản phẩm.` });
    } else if (arr.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
      issues.push({ field: 'productIds', message: 'Mã sản phẩm không hợp lệ.' });
    } else {
      const ids = (arr as string[]).map((v) => v.toLowerCase());
      if (new Set(ids).size !== ids.length) issues.push({ field: 'productIds', message: 'Sản phẩm bị trùng.' });
      else productIds = ids;
    }
  }

  let updatedAt: string | undefined;
  if (withVersion) {
    if (typeof o.updatedAt !== 'string' || Number.isNaN(Date.parse(o.updatedAt))) issues.push({ field: 'updatedAt', message: 'updatedAt không hợp lệ.' });
    else updatedAt = o.updatedAt;
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { name: nameRaw, slug, description, status, productIds, ...(updatedAt ? { updatedAt } : {}) } };
}

/** Slug sinh từ tên: bỏ dấu, tối đa 50 ký tự, tối thiểu 2. */
export function slugFromName(name: string): string {
  const s = slugify(name).slice(0, C.slug.max).replace(/-+$/g, '');
  return s.length >= C.slug.min ? s : `${s}-bst`;
}
