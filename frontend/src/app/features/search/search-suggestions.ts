import { Injectable, signal } from '@angular/core';
import { Params } from '@angular/router';
import { CATEGORIES, MOMENTS, Product } from '../catalog/models/product';

/** One row in "Gợi ý hàng đầu": category/moment rows open their page, other terms run a search. */
export interface SearchSuggestion {
  label: string;
  path: string;
  queryParams?: Params;
}

/**
 * Provisional merchandising terms for the empty search state (Nike "Popular Search Terms").
 * Each term returns products in the mock catalog; replace from analytics/CMS later.
 */
export const POPULAR_SEARCHES = [
  'Blazer',
  'Sơ mi',
  'Đầm midi',
  'Quần ống suông',
  'Chân váy',
  'Gile',
];

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

export function termSuggestion(term: string): SearchSuggestion {
  return { label: term, path: '/search', queryParams: { q: term } };
}

/** Destinations first (categories, moments), then terms taken from the matching products. */
export function buildSuggestions(
  query: string,
  products: Product[],
  limit = 5,
): SearchSuggestion[] {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const matches = (label: string) => normalizeSearch(label).includes(needle);
  const destinations: SearchSuggestion[] = [
    ...CATEGORIES.filter((category) => matches(category.label)).map((category) => ({
      label: category.label,
      path: `/shop/${category.value}`,
    })),
    ...MOMENTS.filter((moment) => matches(moment.label)).map((moment) => ({
      label: moment.label,
      path: `/shop-by-moment/${moment.value}`,
    })),
  ];
  const terms = [
    ...POPULAR_SEARCHES,
    ...products.map((product) => product.type.split(' · ')[0]),
    ...products.map((product) => product.name),
  ].filter(matches);
  const seen = new Set<string>();
  return [...destinations, ...terms.map(termSuggestion)]
    .filter((suggestion) => {
      const key = normalizeSearch(suggestion.label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** Splits a label around the typed text so the template can emphasise the match (Nike style). */
export function highlight(label: string, query: string): { text: string; match: boolean }[] {
  const index = normalizeSearch(label).indexOf(normalizeSearch(query));
  const length = query.trim().length;
  if (index < 0 || !length) return [{ text: label, match: false }];
  return [
    { text: label.slice(0, index), match: false },
    { text: label.slice(index, index + length), match: true },
    { text: label.slice(index + length), match: false },
  ].filter((part) => part.text);
}

const HISTORY_KEY = 'n2f.search.recent.v1';

/** Recent searches kept on this device only (plan 12: optional history). Never sent anywhere. */
@Injectable({ providedIn: 'root' })
export class SearchHistory {
  readonly terms = signal<string[]>(this.read());

  add(term: string): void {
    const value = term.trim();
    if (!value) return;
    const next = [
      value,
      ...this.terms().filter((item) => normalizeSearch(item) !== normalizeSearch(value)),
    ];
    this.save(next.slice(0, 5));
  }

  clear(): void {
    this.save([]);
  }

  private save(terms: string[]): void {
    this.terms.set(terms);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(terms));
    } catch {
      // Storage may be unavailable (private mode); history then lasts for this session only.
    }
  }

  private read(): string[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').slice(0, 5)
        : [];
    } catch {
      return [];
    }
  }
}
