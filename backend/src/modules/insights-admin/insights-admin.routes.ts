import { Request, Router } from 'express';
import { now } from '../../lib/clock';
import { adminReportLimit } from '../../middleware/rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import prisma from '../../config/prisma';
import { toSalesCsv } from './csv';
import { getDashboard } from './dashboard.service';
import { listAudit } from './audit.query';
import { parseAuditQuery, parseExportQuery, parseRange, parseReportQuery } from './insights.schemas';
import { getSalesReport } from './report.service';
import { staffDisplayName } from '../order/order-event';
import { getAdminSettings, SettingsActor, updateSettings } from './settings.service';

/**
 * Routers Slice 8. Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff','admin')`, `adminRateLimit`
 * (vai trò / is_active đọc lại từ DB mỗi yêu cầu, BR-INS-01). `requirePermission` đứng TRƯỚC Zod và trước mọi truy cập DB.
 * Lát 8.1: khung rỗng; từng route thêm ở 8.2 (dashboard), 8.3 (reports), 8.4 (settings), 8.5 (audit).
 */
export const adminDashboardRouter = Router();
export const adminReportsRouter = Router();
export const adminSettingsRouter = Router();
export const adminAuditRouter = Router();

/* ---------------- GET /admin/dashboard ---------------- */
adminDashboardRouter.get('/', requirePermission('dashboard.view'), async (req, res) => {
  const range = parseRange({ ...req.query });
  res.json(await getDashboard(req.auth!.user.role as 'staff' | 'admin', range, now()));
});

/* ---------------- GET /admin/reports/sales, /sales/export ----------------
 * Thứ tự: quyền 403 -> giới hạn báo cáo 429 (chung bộ đếm 20 / 60 giây với CSV) -> tham số 422 -> truy vấn. */
adminReportsRouter.get('/sales', requirePermission('dashboard.revenue'), adminReportLimit, async (req, res) => {
  const at = now();
  res.json(await getSalesReport(prisma, parseReportQuery({ ...req.query }, at), at));
});

adminReportsRouter.get('/sales/export', requirePermission('dashboard.revenue'), adminReportLimit, async (req, res) => {
  const at = now();
  const report = await getSalesReport(prisma, parseExportQuery({ ...req.query }, at), at);
  res
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nine2fine-bao-cao-${report.from}_${report.to}.csv"`,
      'Cache-Control': 'no-store',
    })
    .send(toSalesCsv(report));
});

/* ---------------- GET / PUT /admin/settings/store ----------------
 * PUT: noStore -> requireAuth 401 -> originGuard 403 -> adminRateLimit 429 -> requirePermission 403 -> Zod 422 -> giao dịch. */
const actorOf = (req: Request): SettingsActor => ({ id: req.auth!.user.user_id, name: staffDisplayName(req.auth!.user) });

adminSettingsRouter.get('/store', requirePermission('settings.store'), async (_req, res) => {
  res.json(await getAdminSettings(prisma, now()));
});

adminSettingsRouter.put('/store', requirePermission('settings.store'), async (req, res) => {
  res.json(await updateSettings(actorOf(req), req.body, now()));
});

/* ---------------- GET /admin/audit-log (chỉ đọc; PUT / PATCH / DELETE -> 404) ---------------- */
adminAuditRouter.get('/', requirePermission('settings.audit'), async (req, res) => {
  res.json(await listAudit(prisma, parseAuditQuery({ ...req.query }, now())));
});
