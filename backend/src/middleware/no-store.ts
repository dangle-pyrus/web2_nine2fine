import type { NextFunction, Request, Response } from 'express';

/** `Cache-Control: no-store` ngay từ đầu router (có cả ở 401 / 403, BR-ADM-01). */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store');
  next();
}
