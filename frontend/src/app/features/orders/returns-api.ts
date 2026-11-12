import { HttpClient, HttpEventType } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, filter, map, Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { ApiErrorCode, readApiError } from '../../core/api-error';
import { ReturnAmount, ReturnCase, ReturnCasePhoto, ReturnReason } from './order-models';

/**
 * Member returns (Slice 9, tags `returns`, `return-photos`): only used with `returnsMode: http`.
 * Cookie and `X-Requested-With` come from `core/api-interceptor.ts`. The mock return flow lives in
 * `ACCOUNT_API` and is untouched.
 */
export interface ReturnCreateBody {
  lines: { variantId: string; quantity: number }[];
  reason: ReturnReason;
  detail?: string;
  conditionAck?: boolean;
  photos?: string[];
  bank?: string;
  accountNumber?: string;
  accountName?: string;
}

export type ReturnPhotoProgress =
  { kind: 'progress'; percent: number } | { kind: 'done'; photo: ReturnCasePhoto };

export interface ReturnCreated {
  request: ReturnCase;
  /** `200` with `Idempotency-Replayed`: the first answer again, nothing new was created. */
  replayed: boolean;
}

/** Failure of a returns call, read from the contract `error` (code, field errors, wait time). */
export class ReturnApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'file-too-large',
    readonly detail = '',
    readonly field?: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly retryAfterSeconds?: number,
    readonly currentReturnState?: string,
    /** `invalid-image` only: `format`, `size` or `dimensions`. */
    readonly reason?: string,
  ) {
    super(code);
  }
}

function toReturnError(error: unknown): Observable<never> {
  const detail = readApiError(error);
  // Every field error first; the top-level `field` only fills a gap.
  const fields: Record<string, string> = {};
  for (const item of detail.fieldErrors ?? []) fields[item.field] ??= item.message;
  if (detail.field) fields[detail.field] ??= detail.message;
  return throwError(
    () =>
      new ReturnApiError(
        detail.code,
        detail.message,
        detail.field,
        fields,
        detail.retryAfterSeconds,
        detail.currentReturnState,
        detail.reason,
      ),
  );
}

export interface ReturnsApi {
  /** Raw bytes of one file; progress events, then the stored photo. */
  uploadPhoto(file: File): Observable<ReturnPhotoProgress>;
  /** `Idempotency-Key` is kept by the caller across retries of the same content. */
  create(orderCode: string, body: ReturnCreateBody, key: string): Observable<ReturnCreated>;
  estimate(
    orderCode: string,
    lines: ReturnCreateBody['lines'],
    reason: ReturnReason,
  ): Observable<ReturnAmount>;
  cancel(orderCode: string): Observable<ReturnCase>;
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable({ providedIn: 'root' })
export class HttpReturnsApi implements ReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_CONFIG).baseUrl}/account`;

  uploadPhoto(file: File): Observable<ReturnPhotoProgress> {
    return this.http
      .post<ReturnCasePhoto>(`${this.base}/return-photos`, file, {
        // The server reads the format from the bytes; an unknown type goes as raw octets.
        headers: {
          'Content-Type': PHOTO_TYPES.includes(file.type) ? file.type : 'application/octet-stream',
        },
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event): ReturnPhotoProgress => {
          if (event.type === HttpEventType.Response) return { kind: 'done', photo: event.body! };
          const progress = event.type === HttpEventType.UploadProgress ? event : null;
          const total = progress?.total ?? 0;
          return {
            kind: 'progress',
            percent: total ? Math.round((100 * (progress?.loaded ?? 0)) / total) : 0,
          };
        }),
        catchError(toReturnError),
      );
  }

  create(orderCode: string, body: ReturnCreateBody, key: string): Observable<ReturnCreated> {
    return this.http
      .post<ReturnCase>(`${this.base}/orders/${encodeURIComponent(orderCode)}/return`, body, {
        headers: { 'Idempotency-Key': key },
        observe: 'response',
      })
      .pipe(
        map((response) => ({
          request: response.body!,
          replayed: response.headers.get('Idempotency-Replayed') === 'true',
        })),
        catchError(toReturnError),
      );
  }

  estimate(orderCode: string, lines: ReturnCreateBody['lines'], reason: ReturnReason) {
    return this.http
      .post<ReturnAmount>(`${this.base}/orders/${encodeURIComponent(orderCode)}/return/estimate`, {
        lines,
        reason,
      })
      .pipe(catchError(toReturnError));
  }

  cancel(orderCode: string): Observable<ReturnCase> {
    return this.http
      .post<ReturnCase>(`${this.base}/orders/${encodeURIComponent(orderCode)}/return/cancel`, {})
      .pipe(catchError(toReturnError));
  }
}

export const RETURNS_API = new InjectionToken<ReturnsApi>('RETURNS_API', {
  providedIn: 'root',
  factory: () => inject(HttpReturnsApi),
});

const HOTLINE_TAIL = 'Cần hỗ trợ, vui lòng liên hệ nine2fine.';

const MESSAGES: Partial<Record<ApiErrorCode | 'file-too-large', string>> = {
  'not-returnable': `Đơn này chưa đủ điều kiện để trả hàng (cần giao thành công và đã thanh toán). ${HOTLINE_TAIL}`,
  'return-window-closed': `Đơn này đã quá thời hạn trả hàng (30 ngày kể từ ngày nhận). ${HOTLINE_TAIL}`,
  'return-exists': 'Đơn này đã có yêu cầu trả hàng. Mở chi tiết đơn để xem trạng thái.',
  'invalid-transition':
    'Yêu cầu đã được nine2fine xử lý nên không thể huỷ trực tuyến. Vui lòng gọi hotline để được hỗ trợ.',
  'idempotency-conflict':
    'Yêu cầu này trùng với một lần gửi khác có nội dung khác. Vui lòng bấm gửi lại.',
  unauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'origin-not-allowed': 'Yêu cầu bị từ chối. Vui lòng tải lại trang rồi thử lại.',
  'not-found': 'Không tìm thấy đơn hàng hoặc yêu cầu trả hàng.',
};

/** What a failed upload says on the photo itself. */
export function returnPhotoError(error: unknown): string {
  if (!(error instanceof ReturnApiError)) return 'Không tải được ảnh. Thử lại.';
  if (error.code === 'invalid-image') {
    switch (error.reason) {
      case 'size':
        return 'Ảnh lớn hơn 5 MB.';
      case 'format':
        return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.';
      case 'dimensions':
        return 'Ảnh quá nhỏ (cạnh ngắn dưới 200 px) hoặc quá lớn (trên 8.000 px).';
      default:
        return 'Ảnh không hợp lệ.';
    }
  }
  if (error.code === 'rate-limited') return waitText(error);
  if (error.code === 'unauthenticated') return MESSAGES.unauthenticated!;
  return 'Không tải được ảnh. Thử lại hoặc chọn ảnh khác.';
}

function waitText(error: ReturnApiError): string {
  return error.retryAfterSeconds
    ? `Bạn thao tác quá nhanh. Chờ ${error.retryAfterSeconds} giây rồi thử lại.`
    : 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
}

/** One sentence for a failed submit / cancel; field errors are shown on their fields. */
export function returnErrorMessage(error: unknown): string {
  if (!(error instanceof ReturnApiError))
    return 'Chưa gửi được. Kiểm tra kết nối rồi thử lại; thông tin bạn nhập vẫn được giữ.';
  if (error.code === 'rate-limited') return waitText(error);
  if (error.code === 'validation') return 'Vui lòng kiểm tra các thông tin được đánh dấu.';
  return (
    MESSAGES[error.code] ??
    'Chưa gửi được. Kiểm tra kết nối rồi thử lại; thông tin bạn nhập vẫn được giữ.'
  );
}

/** Errors worth a link back to the order (the request cannot be sent at all). */
export function returnErrorBlocksOrder(error: unknown): boolean {
  return (
    error instanceof ReturnApiError &&
    (error.code === 'not-returnable' ||
      error.code === 'return-window-closed' ||
      error.code === 'return-exists')
  );
}
