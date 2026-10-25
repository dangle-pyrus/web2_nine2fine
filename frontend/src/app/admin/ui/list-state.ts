import { computed, DestroyRef, inject, signal, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  expand,
  map,
  Observable,
  of,
  switchMap,
  tap,
  toArray,
} from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { errorMessage } from '../data-access/http-support';
import { DEFAULT_PAGE_SIZE, Page, PageQuery } from '../data-access/models';

/**
 * List page state kept in the URL (4.1: filters, sort and page are shareable and survive "back").
 * `defaults` lists every key with its default; values equal to the default are left out of the URL.
 */
export function urlQuery<Q extends PageQuery>(
  defaults: Omit<Q, 'page' | 'pageSize' | 'search' | 'sort' | 'dir'> & Partial<PageQuery>,
) {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const base = {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: '',
    sort: '',
    dir: 'desc',
    ...defaults,
  } as Q;

  const query = toSignal(
    route.queryParamMap.pipe(
      map((params) => {
        const value = { ...base } as Record<string, unknown>;
        for (const key of Object.keys(base)) {
          const raw = params.get(key);
          if (raw === null) continue;
          value[key] =
            typeof base[key as keyof Q] === 'number' ? Number(raw) || base[key as keyof Q] : raw;
        }
        return value as Q;
      }),
    ),
    { initialValue: base },
  );

  function update(patch: Partial<Q>, options: { keepPage?: boolean } = {}): void {
    const next = { ...query(), ...patch } as Record<string, unknown>;
    if (!options.keepPage && !('page' in patch)) next['page'] = 1;
    const params: Params = {};
    for (const key of Object.keys(base)) {
      params[key] = next[key] === base[key as keyof Q] ? null : next[key];
    }
    void router.navigate([], { relativeTo: route, queryParams: params, replaceUrl: true });
  }

  function reset(keep: (keyof Q)[] = []): void {
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(base))
      if (!keep.includes(key as keyof Q)) patch[key] = base[key as keyof Q];
    update(patch as Partial<Q>);
  }

  return { query, update, reset, defaults: base };
}

export interface Loaded<T> {
  data: T | null;
  /** First load (skeleton). */
  loading: boolean;
  /** Reload with old data kept and dimmed (5.9). */
  refreshing: boolean;
  error: string | null;
}

/**
 * Loads `fetch(query)` whenever `query` changes or `reload()` is called, keeping the previous data
 * while refreshing so the table does not jump.
 */
export function loader<Q, T>(query: Signal<Q>, fetch: (query: Q) => Observable<T>) {
  const tick = signal(0);
  const state = signal<Loaded<T>>({ data: null, loading: true, refreshing: false, error: null });
  const source = computed(() => ({ query: query(), tick: tick() }));

  const subscription = toObservable(source)
    .pipe(
      debounceTime(0),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      tap(() =>
        state.update((value) => ({
          ...value,
          loading: value.data === null,
          refreshing: value.data !== null,
          error: null,
        })),
      ),
      switchMap(({ query: value }) =>
        fetch(value).pipe(
          map((data) => ({ data, loading: false, refreshing: false, error: null }) as Loaded<T>),
          catchError((error: unknown) =>
            of({
              data: state().data,
              loading: false,
              refreshing: false,
              error: errorMessage(error),
            } as Loaded<T>),
          ),
        ),
      ),
    )
    .subscribe((value) => state.set(value));
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

  return {
    state: state.asReadonly(),
    data: computed(() => state().data),
    reload: () => tick.update((value) => value + 1),
    /** Replace data locally after a mutation, without a request. */
    patch: (update: (data: T) => T) =>
      state.update((value) => (value.data ? { ...value, data: update(value.data) } : value)),
  };
}

/** Row selection for bulk actions (4.1, 5.3). */
export class Selection<K> {
  readonly ids = signal<ReadonlySet<K>>(new Set());
  readonly count = computed(() => this.ids().size);

  has(id: K): boolean {
    return this.ids().has(id);
  }
  toggle(id: K): void {
    const next = new Set(this.ids());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.ids.set(next);
  }
  setAll(ids: K[], on: boolean): void {
    this.ids.set(on ? new Set(ids) : new Set());
  }
  allOf(ids: K[]): boolean {
    return ids.length > 0 && ids.every((id) => this.ids().has(id));
  }
  someOf(ids: K[]): boolean {
    return ids.some((id) => this.ids().has(id)) && !this.allOf(ids);
  }
  clear(): void {
    this.ids.set(new Set());
  }
}

export type PageOf<T> = Page<T>;

/** Date presets for filters (5.2). Returns YYYY-MM-DD bounds in GMT+7. */
export const DATE_PRESETS = [
  { value: '', label: 'Mọi thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
  { value: 'this-month', label: 'Tháng này' },
  { value: 'last-month', label: 'Tháng trước' },
] as const;

export function presetRange(preset: string, now = new Date()): { from: string; to: string } {
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 86_400_000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  const today = day(0);
  const [y, m] = today.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: day(-1), to: day(-1) };
    case '7d':
      return { from: day(-6), to: today };
    case '30d':
      return { from: day(-29), to: today };
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last-month': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
    }
    default:
      return { from: '', to: '' };
  }
}

/** Largest page the API serves (ADMIN_API_CONTRACT: 20 · 50 · 100). */
const EXPORT_PAGE_SIZE = 100;

/** Every row matching a list query, read page by page, for "Xuất file → Tất cả theo bộ lọc". */
export function fetchAllPages<T>(fetch: (page: number, pageSize: number) => Observable<Page<T>>) {
  return fetch(1, EXPORT_PAGE_SIZE).pipe(
    expand((page) =>
      page.page * page.pageSize < page.total ? fetch(page.page + 1, EXPORT_PAGE_SIZE) : EMPTY,
    ),
    map((page) => page.items),
    toArray(),
    map((pages) => pages.flat()),
  );
}

/** Client-side CSV download for "Xuất file" (5.1). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const body = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
