import { inject, Injectable } from '@angular/core';
import { AdminSession } from '../../app/admin/core/admin-session';
import { AdminApiError, AuditEntry, Page, PageQuery } from '../../app/admin/data-access/models';
import { defaultMessage } from '../../app/admin/data-access/http-support';
import { MockPersistence } from '../mock-persistence';
import { AdminSeed, createSeed } from './admin-seed';

/**
 * In-memory admin "backend" shared by the mock APIs. Kept in sessionStorage through
 * MockPersistence so a demo survives F5 in the same tab.
 */
@Injectable({ providedIn: 'root' })
export class AdminMockDb {
  private readonly session = inject(AdminSession);
  readonly data: AdminSeed;

  constructor() {
    const persistence = inject(MockPersistence);
    const saved = persistence.register<AdminSeed>('admin', () => this.data);
    this.data = saved ?? createSeed();
  }

  actor(): string {
    return this.session.user()?.name ?? 'Hệ thống';
  }

  log(entry: Omit<AuditEntry, 'id' | 'at' | 'actor'>): void {
    this.data.audit.unshift({
      ...entry,
      id: `a${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      actor: this.actor(),
    });
  }

  nextOrderSequence(): number {
    return ++this.data.sequence;
  }
}

export function notFound(what: string): AdminApiError {
  return new AdminApiError('not-found', `Không tìm thấy ${what}. Có thể dữ liệu đã bị xóa.`);
}

export function invalid(message: string, fields: Record<string, string> = {}): AdminApiError {
  return new AdminApiError('validation', message || defaultMessage('validation'), fields);
}

export function transition(message: string): AdminApiError {
  return new AdminApiError('invalid-transition', message);
}

/** Lower-cased, accent-free text for search. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function matches(term: string, ...fields: (string | undefined | null)[]): boolean {
  const needle = normalize(term.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalize(field).includes(needle));
}

/** Sort + slice like the backend would. `sorters` maps a sort key to a comparable value. */
export function paginate<T>(
  items: T[],
  query: PageQuery,
  sorters: Record<string, (item: T) => string | number>,
  defaultSort: string,
): Page<T> {
  const key = sorters[query.sort] ? query.sort : defaultSort;
  const pick = sorters[key];
  const factor = query.dir === 'asc' ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    return (left < right ? -1 : left > right ? 1 : 0) * factor;
  });
  const pageSize = Math.max(1, query.pageSize);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, query.page), pages);
  return {
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageSize,
  };
}

export const clone = <T>(value: T): T => structuredClone(value);

/** `ao-blazer`, then `ao-blazer-2`, `ao-blazer-3`… until `taken` says no. */
export function uniqueSlug(slug: string, taken: (slug: string) => boolean): string {
  if (!slug || !taken(slug)) return slug;
  let n = 2;
  while (taken(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
