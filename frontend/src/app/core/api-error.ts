import { HttpErrorResponse } from '@angular/common/http';
import type { CheckoutQuote } from '../features/checkout/checkout-models';

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
  // Slice 3 (cart, checkout, orders).
  'invalid-address',
  'stock-changed',
  'price-changed',
  'voucher-changed',
  'idempotency-conflict',
  'possible-duplicate',
  'not-cancellable',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** A line the shop cannot fill: `available` is what is left (0 = sold out or discontinued). */
export interface StockIssue {
  variantId: string;
  available: number;
}

/**
 * Body of every error response: `{ error: { code, message, retryAfterSeconds?, field?, ... } }`.
 * The Slice 3 extras are read with type checks; a malformed part is dropped.
 */
export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
  field?: string;
  quote?: CheckoutQuote;
  stockIssues?: StockIssue[];
  removedVoucherCodes?: string[];
  existingOrderCode?: string;
}

function readStockIssues(value: unknown): StockIssue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (item): item is StockIssue =>
      typeof item?.variantId === 'string' && Number.isInteger(item?.available),
  );
}

function readQuote(value: unknown): CheckoutQuote | undefined {
  const quote = value as Partial<CheckoutQuote> | null;
  return quote &&
    typeof quote === 'object' &&
    Array.isArray(quote.lines) &&
    typeof quote.pricing?.total === 'number'
    ? (quote as CheckoutQuote)
    : undefined;
}

/**
 * Reads the contract error from a failed request. Only `error.code` decides the meaning; the HTTP
 * status and the message are never used. A response without a known code (network failure, proxy
 * error page, unknown code) counts as `unavailable`.
 */
export function readApiError(error: unknown): ApiErrorDetail {
  const unavailable: ApiErrorDetail = { code: 'unavailable', message: '' };
  if (!(error instanceof HttpErrorResponse)) return unavailable;
  const detail = (error.error as { error?: Record<string, unknown> } | null)?.error;
  const code = API_ERROR_CODES.find((known) => known === detail?.['code']);
  if (!detail || !code) return unavailable;
  const seconds = detail['retryAfterSeconds'];
  const removed = detail['removedVoucherCodes'];
  return {
    code,
    message: typeof detail['message'] === 'string' ? detail['message'] : '',
    retryAfterSeconds: typeof seconds === 'number' && seconds > 0 ? seconds : undefined,
    field: typeof detail['field'] === 'string' ? detail['field'] : undefined,
    quote: readQuote(detail['quote']),
    stockIssues: readStockIssues(detail['stockIssues']),
    removedVoucherCodes: Array.isArray(removed)
      ? removed.filter((item): item is string => typeof item === 'string')
      : undefined,
    existingOrderCode:
      typeof detail['existingOrderCode'] === 'string' ? detail['existingOrderCode'] : undefined,
  };
}
