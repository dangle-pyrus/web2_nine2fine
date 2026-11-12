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
  // Slice 6 (admin catalog).
  'version-conflict',
  'publish-incomplete',
  'invalid-image',
  'duplicate',
  'stock-changed',
  'product-in-use',
  'variant-in-use',
  'voucher-in-use',
  'idempotency-conflict',
  'not-found',
  // Slice 7 (admin customers and staff).
  'self-change',
  'last-admin',
  // Slice 9 (returns).
  'invalid-transition',
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
        const fields: Record<string, string> = contract.field
          ? { [contract.field]: contract.message }
          : {};
        for (const item of contract.fieldErrors ?? []) fields[item.field] ??= item.message;
        return throwError(
          () =>
            new AdminApiError(
              code,
              contract.message || defaultMessage(code),
              fields,
              contract.retryAfterSeconds,
              {
                field: contract.field,
                missing: contract.missing,
                reason: contract.reason,
                sku: contract.sku,
                productId: contract.productId,
                available: contract.available,
                reserved: contract.reserved,
              },
            ),
        );
      }
      const body = (error.error ?? {}) as {
        code?: AdminErrorCode;
        message?: string;
        fields?: Record<string, string>;
      };
      const code = body.code ?? STATUS_CODES[error.status] ?? 'unavailable';
      // A dropped connection has no JSON body: `error.error` is the browser's own error, whose
      // text ("Failed to fetch") is not for the screen.
      const message = body.code && typeof body.message === 'string' ? body.message : undefined;
      return throwError(
        () => new AdminApiError(code, message ?? defaultMessage(code), body.fields ?? {}),
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
    case 'order-state-changed':
      return 'Đơn vừa được cập nhật bởi người khác.';
    case 'condition-not-met':
      return 'Đơn chưa đủ điều kiện cho thao tác này. Tải lại đơn để xem trạng thái mới.';
    case 'rate-limited':
      return 'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.';
    case 'version-conflict':
      return VERSION_CONFLICT_MESSAGE;
    case 'publish-incomplete':
      return 'Chưa đủ điều kiện để chuyển sang "Đang bán".';
    case 'invalid-image':
      return 'Ảnh không hợp lệ.';
    case 'duplicate':
      return 'Giá trị này đã được dùng.';
    case 'stock-changed':
      return 'Tồn kho vừa thay đổi. Kiểm tra số mới rồi thử lại.';
    case 'product-in-use':
      return 'Sản phẩm đã từng hiển thị hoặc đã có đơn; hãy Ẩn thay vì xoá.';
    case 'variant-in-use':
      return 'Biến thể đã có đơn hàng nên không bỏ được.';
    case 'voucher-in-use':
      return 'Mã đã được dùng; hãy tắt thay vì xoá.';
    case 'idempotency-conflict':
      return 'Yêu cầu này trùng khoá với một điều chỉnh khác. Tải lại rồi thử lại.';
    case 'self-change':
      return 'Bạn không thể tự khoá hoặc tự đổi vai trò của chính mình.';
    case 'last-admin':
      return 'Cửa hàng cần ít nhất một quản trị viên đang hoạt động. Hãy nâng người khác lên quản trị viên trước.';
    case 'validation':
      return 'Một số trường chưa hợp lệ. Kiểm tra các trường được đánh dấu rồi lưu lại.';
    default:
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
}

/** BR-INV-05. */
export const VERSION_CONFLICT_MESSAGE =
  'Dữ liệu vừa được người khác cập nhật. Tải lại để xem bản mới; thay đổi của bạn chưa được lưu.';

/** What a missing publish condition is called on screen. */
const MISSING_LABELS: Record<string, string> = {
  images: 'ảnh sản phẩm',
  variants: 'biến thể (màu, size)',
  name: 'tên sản phẩm',
  type: 'dòng mô tả ngắn',
  category: 'danh mục',
  price: 'giá bán',
};

export function missingLabels(missing: string[] | undefined): string[] {
  return (missing ?? []).map((item) => MISSING_LABELS[item] ?? item);
}

const IMAGE_REASONS: Record<string, string> = {
  format: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP (kiểm theo nội dung tệp).',
  size: 'Ảnh lớn hơn 5 MB. Giảm kích thước ảnh rồi tải lại.',
  dimensions: 'Ảnh cần có cạnh ngắn từ 600 px và cạnh dài tối đa 6.000 px.',
};

/**
 * Readable message for any error thrown by an admin API. Slice 6 codes are worded here so every
 * page says the same thing (the server's own text is the fallback).
 */
export function errorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) return defaultMessage('unavailable');
  const detail = error.detail;
  switch (error.code) {
    case 'publish-incomplete': {
      const missing = missingLabels(detail.missing);
      return missing.length
        ? `Chưa chuyển sang "Đang bán" được, còn thiếu: ${missing.join(', ')}.`
        : defaultMessage(error.code);
    }
    case 'invalid-image':
      return IMAGE_REASONS[detail.reason ?? ''] ?? defaultMessage(error.code);
    case 'variant-in-use':
      return `${detail.sku ? `SKU ${detail.sku}` : 'Biến thể'} đã có đơn hàng nên không bỏ được. Đặt tồn về 0 để ngừng bán size này.`;
    case 'version-conflict':
      return VERSION_CONFLICT_MESSAGE;
    case 'self-change':
    case 'last-admin':
      return defaultMessage(error.code);
    default:
      return error.message;
  }
}
