import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { readApiError } from '../../../core/api-error';
import { MockCollectionsApi } from '../../../../mocks/mock-collections-api';
import { Product } from '../models/product';

export interface CollectionDetail {
  slug: string;
  name: string;
  description: string;
  /** Active products only, in the shop's order. */
  products: Product[];
}

/** Collections of products (Slice 10 lát 10.8, Should): public, active ones only. */
export interface CollectionsApi {
  /** `undefined` when there is no active collection with that slug. */
  get(slug: string): Observable<CollectionDetail | undefined>;
}
export const COLLECTIONS_API = new InjectionToken<CollectionsApi>('COLLECTIONS_API');

/** `GET /api/collections/{slug}` (public, `max-age=60`; `draft` and unknown slugs are 404). */
@Injectable({ providedIn: 'root' })
export class HttpCollectionsApi implements CollectionsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  get(slug: string): Observable<CollectionDetail | undefined> {
    return this.http
      .get<CollectionDetail>(`${this.baseUrl}/collections/${encodeURIComponent(slug)}`)
      .pipe(
        catchError((error: unknown) =>
          readApiError(error).code === 'not-found' ? of(undefined) : throwError(() => error),
        ),
      );
  }
}

/** Provided by the lazy collection page so the mock stays out of the initial bundle; `contentMode` decides. */
export const COLLECTIONS_PROVIDERS: Provider[] = [
  {
    provide: COLLECTIONS_API,
    useFactory: () =>
      inject(API_CONFIG).contentMode === 'mock'
        ? inject(MockCollectionsApi)
        : inject(HttpCollectionsApi),
  },
];
