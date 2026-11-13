import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { Product } from '../models/product';

export const RECOMMENDATION_MAX_IDS = 10;

/**
 * Suggestions from one deterministic server function (Slice 10, tag `recommendations`): one
 * product (PDP), several (cart) or none (best sellers). Public, never personalised; an empty list
 * means the block stays hidden.
 */
export interface RecommendationsApi {
  /** `ids`: product ids or slugs, at most 10 (extra ones are dropped). `limit` 1..8, default 4. */
  list(ids: string[], limit?: number): Observable<Product[]>;
}
export const RECOMMENDATIONS_API = new InjectionToken<RecommendationsApi>('RECOMMENDATIONS_API');

@Injectable({ providedIn: 'root' })
export class HttpRecommendationsApi implements RecommendationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  list(ids: string[], limit = 4): Observable<Product[]> {
    let params = new HttpParams().set('limit', limit);
    const wanted = ids.filter(Boolean).slice(0, RECOMMENDATION_MAX_IDS);
    if (wanted.length) params = params.set('ids', wanted.join(','));
    return this.http
      .get<{ items: Product[] }>(`${this.baseUrl}/recommendations`, { params })
      .pipe(map((body) => body.items));
  }
}
