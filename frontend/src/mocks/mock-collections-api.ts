import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import type {
  CollectionDetail,
  CollectionsApi,
} from '../app/features/catalog/data-access/collections-api';
import { DEFAULT_QUERY } from '../app/features/catalog/models/product';
import { MockCatalogApi } from './mock-catalog-api';
import { MockStorefrontContent } from './mock-storefront-content';

/** Mock of `GET /collections/{slug}`: the collections the mock admin edits, active ones only. */
@Injectable({ providedIn: 'root' })
export class MockCollectionsApi implements CollectionsApi {
  private readonly content = inject(MockStorefrontContent);
  private readonly catalog = inject(MockCatalogApi);

  get(slug: string): Observable<CollectionDetail | undefined> {
    const found = this.content.collections.find(
      (collection) =>
        collection.slug === slug.trim().toLowerCase() && collection.status === 'active',
    );
    if (!found) return of(undefined);
    return this.catalog.list({ ...DEFAULT_QUERY, ids: found.productIds, limit: 200 }).pipe(
      map(({ items }) => ({
        slug: found.slug,
        name: found.name,
        description: found.description,
        // The collection's own order, not the catalog's.
        products: found.productIds.flatMap((id) => items.filter((item) => item.id === id)),
      })),
    );
  }
}
