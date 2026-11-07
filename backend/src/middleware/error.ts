import type { NextFunction, Request, Response } from 'express';
import { AppError, Errors } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFound(_req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.status(404).json({ error: { code: 'not-found', message: 'Không tìm thấy tài nguyên.' } });
}

function body(e: AppError) {
  return {
    error: {
      code: e.code,
      message: e.message,
      ...(e.extras.retryAfterSeconds !== undefined ? { retryAfterSeconds: e.extras.retryAfterSeconds } : {}),
      ...(e.extras.field ? { field: e.extras.field } : {}),
    },
  };
}

/** Middleware lỗi tập trung: không trả stack, SQL, tên bảng; log chỉ tên lỗi (BR-AUTH-36). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appErr: AppError;
  if (err instanceof AppError) {
    appErr = err;
  } else if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted'].includes(
      (err as { type: string }).type,
    )
  ) {
    // JSON hỏng, body > 16 KB: 422 validation (contract không dùng 400/413).
    appErr = Errors.validation('Dữ liệu gửi lên không hợp lệ.');
  } else {
    const e = err as { name?: string; code?: string };
    logger.error('unhandled-error', {
      name: e?.name ?? 'unknown',
      code: typeof e?.code === 'string' ? e.code : undefined,
      method: req.method,
      path: req.path,
    });
    appErr = Errors.unavailable();
  }
  if (appErr.extras.retryAfterSeconds !== undefined) res.set('Retry-After', String(appErr.extras.retryAfterSeconds));
  res.set('Cache-Control', 'no-store');
  res.status(appErr.status).json(body(appErr));
}
