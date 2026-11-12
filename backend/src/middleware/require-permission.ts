import type { NextFunction, Request, Response } from 'express';
import {
  CATALOG_PERMISSIONS, CatalogPermission, INSIGHT_PERMISSIONS, InsightPermission, RETURN_PERMISSIONS, ReturnPermission, USER_PERMISSIONS, UserPermission,
} from '../config/assumptions';
import { Errors } from '../lib/errors';

export type Permission = CatalogPermission | UserPermission | InsightPermission | ReturnPermission;

/** Quyền theo hành động (BR-INV-02, BR-USR-02). Đặt SAU requireAuth, TRƯỚC khi đọc body / mở giao dịch: thiếu quyền -> 403 forbidden. */
export const requirePermission =
  (permission: Permission) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.auth?.user.role;
    if (!role) throw Errors.unauthenticated();
    const allowed: readonly Permission[] =
      role === 'staff' || role === 'admin' ? [...CATALOG_PERMISSIONS[role], ...USER_PERMISSIONS[role], ...INSIGHT_PERMISSIONS[role], ...RETURN_PERMISSIONS[role]] : [];
    if (!allowed.includes(permission)) throw Errors.forbidden();
    next();
  };
