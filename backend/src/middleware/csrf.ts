import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/env';
import { Errors } from '../lib/errors';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lớp CSRF 2 + 3: mọi yêu cầu ghi phải có Origin thuộc allowlist và header X-Requested-With: n2f.
 * Đặt TRƯỚC bộ đọc body để yêu cầu bị chặn không bị xử lý thêm.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  const allowed = getConfig().corsAllowedOrigins;
  if (!origin || !allowed.includes(origin.replace(/\/$/, ''))) throw Errors.originNotAllowed();
  if (req.get('x-requested-with') !== 'n2f') throw Errors.originNotAllowed();
  next();
}

/** Yêu cầu có body phải là application/json. */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) return next();
  const len = Number(req.get('content-length') ?? 0);
  const hasBody = len > 0 || req.get('transfer-encoding') !== undefined;
  if (hasBody && !req.is('application/json')) throw Errors.validation('Dữ liệu gửi lên không hợp lệ.');
  next();
}
