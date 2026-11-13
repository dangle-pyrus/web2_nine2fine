import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { ApiErrorCode, readApiError } from '../../../core/api-error';

export interface WishlistEntry {
  productId: string;
  addedAt: string;
}

/** Active products of the account, newest first (at most 100). */
export interface WishlistSnapshot {
  items: WishlistEntry[];
  total: number;
}

export interface WishlistMergeResult extends WishlistSnapshot {
  /** Ids dropped because they were invalid or past the 100 limit. */
  skipped: number;
}

/** Wishlist kept on the server per account (Slice 10, tag `wishlist`). */
export interface WishlistApi {
  list(): Observable<WishlistSnapshot>;
  add(productId: string): Observable<WishlistEntry>;
  remove(productId: string): Observable<void>;
  /** Sends only the ids added while not synced (guest / offline), never the cached list. */
  merge(productIds: string[]): Observable<WishlistMergeResult>;
}
export const WISHLIST_API = new InjectionToken<WishlistApi>('WISHLIST_API');

/** Failure of a wishlist call; `offline` = no answer at all (the id stays on the device). */
export class WishlistApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'offline',
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

function toWishlistError(error: unknown): Observable<never> {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return throwError(() => new WishlistApiError('offline'));
  }
  const detail = readApiError(error);
  return throwError(() => new WishlistApiError(detail.code, detail.retryAfterSeconds));
}

@Injectable({ providedIn: 'root' })
export class HttpWishlistApi implements WishlistApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/account/wishlist`;

  list(): Observable<WishlistSnapshot> {
    return this.http.get<WishlistSnapshot>(this.base).pipe(catchError(toWishlistError));
  }

  add(productId: string): Observable<WishlistEntry> {
    return this.http
      .put<WishlistEntry>(`${this.base}/${encodeURIComponent(productId)}`, null)
      .pipe(catchError(toWishlistError));
  }

  remove(productId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/${encodeURIComponent(productId)}`)
      .pipe(catchError(toWishlistError));
  }

  merge(productIds: string[]): Observable<WishlistMergeResult> {
    return this.http
      .post<WishlistMergeResult>(`${this.base}/merge`, { productIds })
      .pipe(catchError(toWishlistError));
  }
}

/** What the toast says when a heart could not be saved. */
export function wishlistErrorMessage(error: unknown): string {
  if (!(error instanceof WishlistApiError)) return 'Chưa lưu được yêu thích. Vui lòng thử lại.';
  switch (error.code) {
    case 'wishlist-full':
      return 'Danh sách yêu thích đã đủ 100 sản phẩm. Hãy bỏ bớt một sản phẩm rồi thêm lại.';
    case 'rate-limited':
      return error.retryAfterSeconds
        ? `Bạn thao tác quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
        : 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    case 'not-found':
      return 'Sản phẩm này hiện không còn bán.';
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    default:
      return 'Chưa lưu được yêu thích. Vui lòng thử lại.';
  }
}
