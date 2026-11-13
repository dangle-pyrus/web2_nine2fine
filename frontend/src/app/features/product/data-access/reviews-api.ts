import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../../core/api-config';
import { ApiErrorCode, readApiError } from '../../../core/api-error';
import {
  ProductReview,
  ProductReviewPage,
  ReviewEligibility,
  ReviewInput,
  ReviewListQuery,
} from '../../catalog/models/product';

/**
 * Product reviews (Slice 10, tag `reviews`). The shopper cannot choose `sizeBought`: the server
 * takes it from the order, so it is not part of what `submit` sends.
 */
export interface ReviewsApi {
  list(productId: string, query: ReviewListQuery): Observable<ProductReviewPage>;
  eligibility(productId: string): Observable<ReviewEligibility>;
  submit(productId: string, input: ReviewInput): Observable<ProductReview>;
}
export const REVIEWS_API = new InjectionToken<ReviewsApi>('REVIEWS_API');

/** Failure of a reviews call: the contract `error.code`, every field error, the wait time. */
export class ReviewApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'offline',
    readonly fieldErrors: Record<string, string> = {},
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

function toReviewError(error: unknown): Observable<never> {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return throwError(() => new ReviewApiError('offline'));
  }
  const detail = readApiError(error);
  const fields: Record<string, string> = {};
  for (const item of detail.fieldErrors ?? []) fields[item.field] ??= item.message;
  if (detail.field) fields[detail.field] ??= detail.message;
  return throwError(() => new ReviewApiError(detail.code, fields, detail.retryAfterSeconds));
}

@Injectable({ providedIn: 'root' })
export class HttpReviewsApi implements ReviewsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_CONFIG).baseUrl;

  list(productId: string, query: ReviewListQuery): Observable<ProductReviewPage> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.rating) params = params.set('rating', query.rating);
    return this.http
      .get<ProductReviewPage>(`${this.baseUrl}/products/${encodeURIComponent(productId)}/reviews`, {
        params,
      })
      .pipe(catchError(toReviewError));
  }

  /** The server answers `sign-in` itself when there is no session (never a 401). */
  eligibility(productId: string): Observable<ReviewEligibility> {
    return this.http
      .get<ReviewEligibility>(`${this.baseUrl}/reviews/eligibility`, { params: { productId } })
      .pipe(catchError(toReviewError));
  }

  submit(productId: string, input: ReviewInput): Observable<ProductReview> {
    // `sizeBought` is the server's (from the order), so it is left out of the body.
    const body = {
      productId,
      rating: input.rating,
      fit: input.fit,
      height: input.height,
      title: input.title,
      body: input.body,
    };
    return this.http
      .post<ProductReview>(`${this.baseUrl}/reviews`, body)
      .pipe(catchError(toReviewError));
  }
}

/** One sentence for a failed submit; field errors are shown on their fields. */
export function reviewErrorMessage(error: unknown): string {
  const retry = 'Thông tin bạn nhập vẫn được giữ, vui lòng thử lại.';
  if (!(error instanceof ReviewApiError)) return `Chưa gửi được đánh giá. ${retry}`;
  switch (error.code) {
    case 'validation':
      return 'Vui lòng kiểm tra các thông tin được đánh dấu.';
    case 'already-reviewed':
      return 'Bạn đã đánh giá sản phẩm này rồi.';
    case 'not-eligible':
      return 'Chỉ khách đã nhận sản phẩm này mới đánh giá được. Nếu bạn vừa nhận hàng, vui lòng thử lại sau.';
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để gửi đánh giá.';
    case 'rate-limited':
      return error.retryAfterSeconds
        ? `Bạn gửi quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
        : 'Bạn gửi quá nhanh. Vui lòng thử lại sau ít phút.';
    case 'origin-not-allowed':
      return 'Yêu cầu bị từ chối. Vui lòng tải lại trang rồi thử lại.';
    case 'not-found':
      return 'Sản phẩm này hiện không còn để đánh giá.';
    default:
      return `Chưa gửi được đánh giá. ${retry}`;
  }
}

/** The answer says "already there" / "never possible": reload the eligibility instead of retrying. */
export function reviewErrorSettles(error: unknown): boolean {
  return (
    error instanceof ReviewApiError &&
    (error.code === 'already-reviewed' || error.code === 'not-eligible')
  );
}
