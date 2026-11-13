import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { RecommendationsApi } from '../app/features/catalog/data-access/recommendations-api';
import { DEFAULT_QUERY, Product } from '../app/features/catalog/models/product';
import { MockCatalogApi } from './mock-catalog-api';

const BY_RANK = (a: Product, b: Product) =>
  a.salesRank - b.salesRank || a.slug.localeCompare(b.slug);
const inStock = (product: Product) => product.variants.some((variant) => variant.inventory > 0);

/** BR-REC-01 for one product: same category + shared Moment, same category, same Moment, best sellers. */
function forOne(source: Product, pool: Product[], limit: number): Product[] {
  const shared = (p: Product) => p.moments.filter((m) => source.moments.includes(m)).length;
  const others = pool.filter((p) => p.id !== source.id && inStock(p));
  const steps = [
    others
      .filter((p) => p.category === source.category && shared(p) > 0)
      .sort((a, b) => shared(b) - shared(a) || BY_RANK(a, b)),
    others.filter((p) => p.category === source.category).sort(BY_RANK),
    others.filter((p) => shared(p) > 0).sort(BY_RANK),
    [...others].sort(BY_RANK),
  ];
  const picked: Product[] = [];
  for (const step of steps) {
    for (const product of step) {
      if (picked.length >= limit) return picked;
      if (!picked.some((p) => p.id === product.id)) picked.push(product);
    }
  }
  return picked;
}

/** Mock of `GET /recommendations`: the same four steps, computed on the mock catalog. */
@Injectable({ providedIn: 'root' })
export class MockRecommendationsApi implements RecommendationsApi {
  private readonly catalog = inject(MockCatalogApi);

  list(ids: string[], limit = 4): Observable<Product[]> {
    return this.catalog.list({ ...DEFAULT_QUERY, limit: 500 }).pipe(
      map(({ items }) => {
        const wanted = ids.slice(0, 10);
        const sources = wanted
          .map((id) => items.find((p) => p.id === id || p.slug === id))
          .filter((p): p is Product => !!p);
        if (!sources.length) return items.filter(inStock).sort(BY_RANK).slice(0, limit);
        if (sources.length === 1) return forOne(sources[0], items, limit);
        const score = new Map<string, { product: Product; points: number }>();
        for (const source of sources) {
          for (const product of forOne(source, items, 8)) {
            const entry = score.get(product.id) ?? { product, points: 0 };
            entry.points++;
            score.set(product.id, entry);
          }
        }
        return [...score.values()]
          .filter(({ product }) => !sources.some((s) => s.id === product.id))
          .sort((a, b) => b.points - a.points || BY_RANK(a.product, b.product))
          .map(({ product }) => product)
          .slice(0, limit);
      }),
    );
  }
}
