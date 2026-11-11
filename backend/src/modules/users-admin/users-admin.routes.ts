import { Request, Response, Router } from 'express';
import prisma from '../../config/prisma';
import { Errors } from '../../lib/errors';
import { adminStaffCreateLimit } from '../../middleware/rate-limit';
import { requirePermission } from '../../middleware/require-permission';
import { parseBody, UUID_RE } from '../../lib/validate';
import { staffDisplayName } from '../order/order-event';
import { listAccountEvents } from './account-event';
import { AccountActor, AccountOp, changeAccountState } from './account-status.service';
import { customerExists, listCustomerOrders, listCustomers, loadCustomer } from './customer.query';
import { listStaff } from './staff.query';
import { createStaff } from './staff.service';
import {
  customerListQuerySchema, customerOrdersQuerySchema, lockSchema, optionalKey, parseInput, requiredKey, roleSchema, staffCreateSchema, unlockSchema,
} from './users-admin.schemas';

/**
 * Router Slice 7. Gắn ở app.ts SAU `noStore`, `requireAuth('admin')`, `requireRole('staff','admin')`, `adminRateLimit`
 * (vai trò / is_active đọc lại từ DB mỗi yêu cầu, BR-USR-01). `requirePermission` đứng TRƯỚC Zod và trước mọi truy cập DB.
 */

const actorOf = (req: Request): AccountActor => {
  const a = req.auth!;
  return { id: a.user.user_id, sessionId: a.sessionId, role: a.user.role as 'staff' | 'admin', name: staffDisplayName(a.user) };
};
const idOf = (req: Request, name: string): string => {
  const v = String(req.params[name]);
  if (!UUID_RE.test(v)) throw Errors.notFound();
  return v;
};
const pathOf = (req: Request): string => `${req.baseUrl}${req.path}`;

/* ---------------- /admin/customers ---------------- */
export const adminCustomersRouter = Router();

adminCustomersRouter.get('/', requirePermission('customers.view'), async (req, res) => {
  res.json(await listCustomers(parseBody(customerListQuerySchema, { ...req.query }), req.auth!.user.role));
});

adminCustomersRouter.get('/:customerId', requirePermission('customers.view'), async (req, res) => {
  const c = await loadCustomer(prisma, idOf(req, 'customerId'), req.auth!.user.role);
  if (!c) throw Errors.notFound('Không tìm thấy khách hàng.');
  res.json(c);
});

adminCustomersRouter.get('/:customerId/orders', requirePermission('customers.view'), async (req, res) => {
  const id = idOf(req, 'customerId');
  const q = parseBody(customerOrdersQuerySchema, { ...req.query });
  if (!(await customerExists(id))) throw Errors.notFound('Không tìm thấy khách hàng.');
  res.json(await listCustomerOrders(id, q.page, q.limit));
});

async function respond(req: Request, kind: 'customer' | 'staff', targetId: string, input: AccountOp, res: Response): Promise<void> {
  const r = await changeAccountState({ actor: actorOf(req), kind, targetId, input, key: optionalKey(req.get('idempotency-key')), path: pathOf(req) });
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.json(r.dto);
}

adminCustomersRouter.post('/:customerId/lock', requirePermission('customers.edit'), async (req, res) => {
  optionalKey(req.get('idempotency-key'));
  const { reason } = parseInput(lockSchema, req.body);
  await respond(req, 'customer', idOf(req, 'customerId'), { op: 'lock', reason }, res);
});

adminCustomersRouter.post('/:customerId/unlock', requirePermission('customers.edit'), async (req, res) => {
  optionalKey(req.get('idempotency-key'));
  const { reason } = parseInput(unlockSchema, req.body);
  await respond(req, 'customer', idOf(req, 'customerId'), { op: 'unlock', reason }, res);
});

/* ---------------- /admin/staff ---------------- */
export const adminStaffRouter = Router();

adminStaffRouter.get('/', requirePermission('settings.staff'), async (_req, res) => {
  res.json(await listStaff());
});

// Thứ tự: quyền 403 -> giới hạn tạo 429 -> Idempotency-Key 422 -> Zod 422 -> (giao dịch) 409.
adminStaffRouter.post('/', requirePermission('settings.staff'), adminStaffCreateLimit, async (req, res) => {
  const key = requiredKey(req.get('idempotency-key'));
  const input = parseInput(staffCreateSchema, req.body);
  const r = await createStaff({ actor: actorOf(req), input, key, path: pathOf(req) });
  if (r.replayed) res.set('Idempotency-Replayed', 'true');
  res.status(r.replayed ? 200 : 201).json(r.dto);
});

adminStaffRouter.post('/:staffId/lock', requirePermission('settings.staff'), async (req, res) => {
  optionalKey(req.get('idempotency-key'));
  const { reason } = parseInput(lockSchema, req.body);
  await respond(req, 'staff', idOf(req, 'staffId'), { op: 'lock', reason }, res);
});

adminStaffRouter.post('/:staffId/unlock', requirePermission('settings.staff'), async (req, res) => {
  optionalKey(req.get('idempotency-key'));
  const { reason } = parseInput(unlockSchema, req.body);
  await respond(req, 'staff', idOf(req, 'staffId'), { op: 'unlock', reason }, res);
});

adminStaffRouter.put('/:staffId/role', requirePermission('settings.staff'), async (req, res) => {
  optionalKey(req.get('idempotency-key'));
  const { role, reason } = parseInput(roleSchema, req.body);
  await respond(req, 'staff', idOf(req, 'staffId'), { op: 'role', role, reason }, res);
});

/* ---------------- /admin/accounts ---------------- */
export const adminAccountsRouter = Router();

adminAccountsRouter.get('/:accountId/history', requirePermission('settings.staff'), async (req, res) => {
  const events = await listAccountEvents(String(req.params.accountId));
  if (!events) throw Errors.notFound('Không tìm thấy tài khoản.');
  res.json(events);
});
