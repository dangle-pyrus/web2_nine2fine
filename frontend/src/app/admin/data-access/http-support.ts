import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, OperatorFunction, throwError } from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { readApiError } from '../../core/api-error';
import { AdminApiError, AdminErrorCode } from './models';

/** `${baseUrl}/admin` – every admin endpoint lives under this prefix. */
export function adminBase(): string {
  return `${inject(API_CONFIG).baseUrl}/admin`;
}

/** Query object → HttpParams, skipping empty values so URLs stay short. */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === '' || value === null || value === undefined) continue;
    params = params.set(key, String(value));
  }
  return params;
}

const STATUS_CODES: Record<number, AdminErrorCode> = {
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  422: 'validation',
};

const AUTH_CODES: readonly string[] = [
  'unauthenticated',
  'forbidden',
  'validation',
  'invalid-credentials',
  'account-disabled',
  'rate-limited',
  'password-locked',
  'origin-not-allowed',
  'unavailable',
];

/**
 * Maps a failed admin request to AdminApiError. Auth endpoints answer with the contract shape
 * `{ error: { code, message, field?, retryAfterSeconds? } }` (docs/api/openapi.yaml) and are read
 * by `error.code` only. The other admin endpoints keep the older `{ code, message, fields }` body
 * (or a bare status) until their slice is integrated.
 */
export function adminErrors<T>(): OperatorFunction<T, T> {
  return catchError((error: unknown): Observable<never> => {
    if (error instanceof HttpErrorResponse) {
      const contract = readApiError(error);
      if (contract.code !== 'unavailable' || (error.error as { error?: unknown } | null)?.error) {
        const code = (
          AUTH_CODES.includes(contract.code) ? contract.code : 'unavailable'
        ) as AdminErrorCode;
        const fields = contract.field ? { [contract.field]: contract.message } : {};
        return throwError(
          () =>
            new AdminApiError(
              code,
              contract.message || defaultMessage(code),
              fields,
              contract.retryAfterSeconds,
            ),
        );
      }
      const body = (error.error ?? {}) as {
        code?: AdminErrorCode;
        message?: string;
        fields?: Record<string, string>;
      };
      const code = body.code ?? STATUS_CODES[error.status] ?? 'unavailable';
      return throwError(
        () => new AdminApiError(code, body.message ?? defaultMessage(code), body.fields ?? {}),
      );
    }
    return throwError(() => new AdminApiError('unavailable', defaultMessage('unavailable')));
  });
}

export function defaultMessage(code: AdminErrorCode): string {
  switch (code) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
    case 'forbidden':
      return 'Tài khoản của bạn không có quyền thực hiện thao tác này.';
    case 'not-found':
      return 'Không tìm thấy dữ liệu. Có thể dữ liệu đã bị xóa.';
    case 'conflict':
      return 'Dữ liệu vừa được người khác thay đổi. Tải lại trang rồi thử lại.';
    case 'invalid-transition':
      return 'Đơn hàng đã chuyển sang trạng thái khác. Tải lại trang để xem trạng thái mới.';
    case 'validation':
      return 'Một số trường chưa hợp lệ. Kiểm tra các trường được đánh dấu rồi lưu lại.';
    default:
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
}

/** Readable message for any error thrown by an admin API. */
export function errorMessage(error: unknown): string {
  return error instanceof AdminApiError ? error.message : defaultMessage('unavailable');
}
