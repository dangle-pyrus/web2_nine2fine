import { HttpErrorResponse } from '@angular/common/http';

/** Stable error codes of docs/api/openapi.yaml (`ErrorCode`). */
export const API_ERROR_CODES = [
  'validation',
  'underage',
  'invalid-code',
  'code-locked',
  'rate-limited',
  'password-locked',
  'invalid-credentials',
  'account-disabled',
  'email-registered',
  'unauthenticated',
  'forbidden',
  'origin-not-allowed',
  'unavailable',
  'not-found',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every error response: `{ error: { code, message, retryAfterSeconds?, field? } }`. */
export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
  field?: string;
}

/**
 * Reads the contract error from a failed request. Only `error.code` decides the meaning; the HTTP
 * status and the message are never used. A response without a known code (network failure, proxy
 * error page, unknown code) counts as `unavailable`.
 */
export function readApiError(error: unknown): ApiErrorDetail {
  const unavailable: ApiErrorDetail = { code: 'unavailable', message: '' };
  if (!(error instanceof HttpErrorResponse)) return unavailable;
  const detail = (error.error as { error?: Partial<ApiErrorDetail> } | null)?.error;
  const code = API_ERROR_CODES.find((known) => known === detail?.code);
  if (!detail || !code) return unavailable;
  const seconds = detail.retryAfterSeconds;
  return {
    code,
    message: typeof detail.message === 'string' ? detail.message : '',
    retryAfterSeconds: typeof seconds === 'number' && seconds > 0 ? seconds : undefined,
    field: typeof detail.field === 'string' ? detail.field : undefined,
  };
}
