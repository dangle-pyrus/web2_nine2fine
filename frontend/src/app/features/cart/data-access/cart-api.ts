import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { CommercePolicy } from '../../../core/commerce-policy';
import { RefreshedLine } from '../../checkout/checkout-models';

/** Server cart of a signed-in shopper (`CartView` in docs/api/openapi.yaml). */
export interface CartViewDto {
  lines: (RefreshedLine & { updatedAt: string })[];
  policy: CommercePolicy;
  expiresAt: string | null;
}

export interface CartNotice {
  code: 'stock-limit' | 'per-variant-limit' | 'merged';
  variantId?: string;
  adjustedTo?: number;
}

export interface CartMutated {
  cart: CartViewDto;
  notice: CartNotice | null;
}

export interface CartMergeResult {
  cart: CartViewDto;
  mergedVariantIds: string[];
  skippedVariantIds: string[];
  addedCount: number;
  evicted: { variantId: string; productId: string; quantity: number }[];
}

/** Member cart on the server. Guests never call it (their cart stays in the browser). */
export interface CartApi {
  get(): Observable<CartViewDto>;
  addLine(variantId: string, quantity: number): Observable<CartMutated>;
  setQuantity(variantId: string, quantity: number): Observable<CartMutated>;
  removeLine(variantId: string): Observable<CartMutated>;
  changeVariant(variantId: string, toVariantId: string): Observable<CartMutated>;
  /** `lines` is only what the guest added since the last sync; the same key replays the result. */
  merge(
    lines: { variantId: string; quantity: number }[],
    idempotencyKey: string,
  ): Observable<CartMergeResult>;
}

export const CART_API = new InjectionToken<CartApi>('CART_API');

@Injectable({ providedIn: 'root' })
export class HttpCartApi implements CartApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/cart`;

  get(): Observable<CartViewDto> {
    return this.http.get<CartViewDto>(this.base);
  }
  addLine(variantId: string, quantity: number): Observable<CartMutated> {
    return this.http.post<CartMutated>(`${this.base}/lines`, { variantId, quantity });
  }
  setQuantity(variantId: string, quantity: number): Observable<CartMutated> {
    return this.http.put<CartMutated>(`${this.base}/lines/${encodeURIComponent(variantId)}`, {
      quantity,
    });
  }
  removeLine(variantId: string): Observable<CartMutated> {
    return this.http.delete<CartMutated>(`${this.base}/lines/${encodeURIComponent(variantId)}`);
  }
  changeVariant(variantId: string, toVariantId: string): Observable<CartMutated> {
    return this.http.post<CartMutated>(
      `${this.base}/lines/${encodeURIComponent(variantId)}/change-variant`,
      { toVariantId },
    );
  }
  merge(
    lines: { variantId: string; quantity: number }[],
    idempotencyKey: string,
  ): Observable<CartMergeResult> {
    return this.http.post<CartMergeResult>(
      `${this.base}/merge`,
      { lines },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  }
}
