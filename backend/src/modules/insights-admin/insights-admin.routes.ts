import { Router } from 'express';

/**
 * Routers Slice 8. Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff','admin')`, `adminRateLimit`
 * (vai trò / is_active đọc lại từ DB mỗi yêu cầu, BR-INS-01). `requirePermission` đứng TRƯỚC Zod và trước mọi truy cập DB.
 * Lát 8.1: khung rỗng; từng route thêm ở 8.2 (dashboard), 8.3 (reports), 8.4 (settings), 8.5 (audit).
 */
export const adminDashboardRouter = Router();
export const adminReportsRouter = Router();
export const adminSettingsRouter = Router();
export const adminAuditRouter = Router();
