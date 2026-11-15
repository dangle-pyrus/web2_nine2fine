import { Router } from 'express';
import prisma from '../../config/prisma';
import { INSIGHTS_ASSUMPTIONS } from '../../config/assumptions';
import { now } from '../../lib/clock';
import { requirePermission } from '../../middleware/require-permission';
import { parseDateRange } from '../insights-admin/insights.schemas';
import { getExtraReport } from './insights-extra.service';

/**
 * GET /admin/reports-extra?from&to (nâng cấp admin 2026-11-15). CHỈ ĐỌC, chỉ quyền `dashboard.revenue` (quản trị viên).
 * Gắn ở app.ts với cùng khuôn Slice 8: noStore -> requireAuth('admin') -> requireRole -> adminRateLimit; ở đây
 * `requirePermission` 403 đứng trước Zod 422 và trước DB. Cùng quy tắc ngày như `/admin/reports/sales` (BR-RPT-01).
 */
export const adminReportsExtraRouter = Router();

adminReportsExtraRouter.get('/', requirePermission('dashboard.revenue'), async (req, res) => {
  const at = now();
  const range = parseDateRange({ ...req.query }, { maxDays: INSIGHTS_ASSUMPTIONS.reportMaxDays, allowFuture: false }, at);
  res.json(await getExtraReport(prisma, range, at));
});
