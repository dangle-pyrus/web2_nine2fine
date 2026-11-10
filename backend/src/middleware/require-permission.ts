import type { NextFunction, Request, Response } from 'express';
import { CATALOG_PERMISSIONS, CatalogPermission } from '../config/assumptions';
import { Errors } from '../lib/errors';

/** Quyền theo hành động (BR-INV-02). Đặt SAU requireAuth, TRƯỚC khi đọc body / mở giao dịch: thiếu quyền -> 403 forbidden. */
export const requirePermission =
  (permission: CatalogPermission) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.auth?.user.role;
    if (!role) throw Errors.unauthenticated();
    const allowed = role === 'staff' || role === 'admin' ? CATALOG_PERMISSIONS[role] : [];
    if (!allowed.includes(permission)) throw Errors.forbidden();
    next();
  };
