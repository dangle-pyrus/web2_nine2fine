import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { readApiError } from '../../../core/api-error';
import {
  Category,
  CatalogQuery,
  Product,
  ProductPage,
  ProductReview,
  ReviewEligibility,
  ReviewInput,
  SEARCH_MAX_LENGTH,
  SizeChart,
} from '../models/product';

export interface CatalogApi {
  list(query: CatalogQuery): Observable<ProductPage>;
  get(slug: string): Observable<Product | undefined>;
  reviews(productId: string): Observable<ProductReview[]>;
  sizeChart(category: Category): Observable<SizeChart>;
  reviewEligibility(productId: string): Observable<ReviewEligibility>;
  submitReview(productId: string, input: ReviewInput): Observable<ProductReview>;
  /** Emails the shopper once this variant is back in stock. */
  notifyBackInStock(variantId: string, email: string): Observable<void>;
}
export const CATALOG_API = new InjectionToken<CatalogApi>('CATALOG_API');

@Injectable({ providedIn: 'root' })
export class HttpCatalogApi implements CatalogApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  list(query: CatalogQuery): Observable<ProductPage> {
    return this.http
      .get<ProductPage>(`${this.baseUrl}/products`, { params: toParams(query) })
      .pipe(map(mapProductPage));
  }

  /** `404 not-found` means the product does not exist (`undefined`); any other failure is thrown. */
  get(slug: string): Observable<Product | undefined> {
    return this.http
      .get<Product>(`${this.baseUrl}/products/${encodeURIComponent(slug)}`)
      .pipe(
        catchError((error: unknown) =>
          readApiError(error).code === 'not-found' ? of(undefined) : throwError(() => error),
        ),
      );
  }

  /** The backend has no reviews yet (BR-CAT-17): nothing to fetch. */
  reviews(): Observable<ProductReview[]> {
    return of([]);
  }

  sizeChart(category: Category): Observable<SizeChart> {
    return this.http.get<SizeChart>(`${this.baseUrl}/size-charts/${category}`);
  }

  reviewEligibility(): Observable<ReviewEligibility> {
    return throwError(
      () => new Error('Reviews are not available on the HTTP catalog (BR-CAT-17).'),
    );
  }

  submitReview(): Observable<ProductReview> {
    return throwError(
      () => new Error('Reviews are not available on the HTTP catalog (BR-CAT-17).'),
    );
  }

  notifyBackInStock(): Observable<void> {
    return throwError(
      () => new Error('Back-in-stock alerts are not available on the HTTP catalog.'),
    );
  }
}

/** Only meaningful values reach the URL: empty, `false` and `0` mean "no filter". */
export function toParams(query: CatalogQuery): HttpParams {
  const entries: [string, string | number | boolean | undefined][] = [
    ['gender', query.gender],
    ['category', query.category],
    ['moment', query.moment],
    ['size', query.size],
    ['color', query.color],
    ['maxPrice', query.maxPrice],
    ['available', query.available],
    ['q', query.q.trim().slice(0, SEARCH_MAX_LENGTH)],
    ['sort', query.sort],
    ['page', query.page],
    ['limit', query.limit],
    ['ids', query.ids?.join(',')],
  ];
  const fromObject: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value === undefined || value === '' || value === false || value === 0) continue;
    fromObject[key] = String(value);
  }
  return new HttpParams({ fromObject });
}

function mapProductPage(dto: ProductPage): ProductPage {
  return { items: dto.items, total: dto.total, page: dto.page, limit: dto.limit };
}
