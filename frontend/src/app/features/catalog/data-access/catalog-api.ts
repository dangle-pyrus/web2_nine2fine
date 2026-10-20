import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import {
  Category,
  CatalogQuery,
  Product,
  ProductPage,
  ProductReview,
  ReviewEligibility,
  ReviewInput,
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
    const params = new HttpParams({ fromObject: { ...query } });
    return this.http
      .get<ProductPage>(`${this.baseUrl}/products`, { params })
      .pipe(map(mapProductPage));
  }

  get(slug: string): Observable<Product | undefined> {
    return this.http.get<Product>(`${this.baseUrl}/products/${encodeURIComponent(slug)}`);
  }

  reviews(productId: string): Observable<ProductReview[]> {
    return this.http.get<ProductReview[]>(
      `${this.baseUrl}/products/${encodeURIComponent(productId)}/reviews`,
    );
  }

  sizeChart(category: Category): Observable<SizeChart> {
    return this.http.get<SizeChart>(`${this.baseUrl}/size-charts/${category}`);
  }

  reviewEligibility(productId: string): Observable<ReviewEligibility> {
    return this.http.get<ReviewEligibility>(
      `${this.baseUrl}/products/${encodeURIComponent(productId)}/reviews/eligibility`,
      { withCredentials: true },
    );
  }

  submitReview(productId: string, input: ReviewInput): Observable<ProductReview> {
    return this.http.post<ProductReview>(
      `${this.baseUrl}/products/${encodeURIComponent(productId)}/reviews`,
      input,
      { withCredentials: true },
    );
  }

  notifyBackInStock(variantId: string, email: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/stock-alerts`, { variantId, email });
  }
}

// Proposed contract only: adapt this boundary once the backend DTO is available.
function mapProductPage(dto: ProductPage): ProductPage {
  return { items: dto.items, total: dto.total };
}
