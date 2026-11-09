import { NextFunction, Request, Response, Router } from 'express';
import { createRateLimit } from '../../middleware/rate-limit';
import { parseAddress, parsePassword, parseProfilePatch } from './account.schemas';
import { getMembership, getProfile, setPassword, updateProfile } from './account.service';
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from './address.service';
import { listMemberVouchers } from './voucher-list.service';

/**
 * /api/account/** (PRD Slice 5). Gắn trong app.ts SAU `noStore` + `requireAuth('storefront')`,
 * nên mọi handler có `req.auth` và mọi phản hồi (kể cả 401) có `Cache-Control: no-store` (BR-ACC-01).
 */
type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const byUser = (req: Request): string => req.auth?.user.user_id ?? req.ip ?? 'unknown';
/** BR-ACC-02: theo tài khoản; đọc 120 / 60 giây, ghi 30 / 60 giây. */
export const accountReadLimit = createRateLimit({ name: 'account-read', windowMs: 60_000, max: 120, key: byUser });
export const accountWriteLimit = createRateLimit({ name: 'account-write', windowMs: 60_000, max: 30, key: byUser });
function accountRateLimit(req: Request, res: Response, next: NextFunction): void {
  (req.method === 'GET' || req.method === 'HEAD' ? accountReadLimit : accountWriteLimit)(req, res, next);
}

const uid = (req: Request) => req.auth!.user.user_id;

export const accountRouter = Router();
accountRouter.use(accountRateLimit);

accountRouter.get('/profile', wrap(async (req, res) => {
  res.json(await getProfile(uid(req)));
}));
accountRouter.patch('/profile', wrap(async (req, res) => {
  res.json(await updateProfile(uid(req), parseProfilePatch(req.body)));
}));
accountRouter.put('/password', wrap(async (req, res) => {
  await setPassword(uid(req), req.auth!.sessionId, parsePassword(req.body));
  res.status(204).end();
}));
accountRouter.get('/addresses', wrap(async (req, res) => {
  res.json(await listAddresses(uid(req)));
}));
accountRouter.post('/addresses', wrap(async (req, res) => {
  res.status(201).json(await createAddress(uid(req), parseAddress(req.body)));
}));
accountRouter.put('/addresses/:id', wrap(async (req, res) => {
  res.json(await updateAddress(uid(req), String(req.params.id), parseAddress(req.body)));
}));
accountRouter.delete('/addresses/:id', wrap(async (req, res) => {
  await deleteAddress(uid(req), String(req.params.id));
  res.status(204).end();
}));
accountRouter.post('/addresses/:id/default', wrap(async (req, res) => {
  res.json(await setDefaultAddress(uid(req), String(req.params.id)));
}));
accountRouter.get('/membership', wrap(async (req, res) => {
  res.json(await getMembership(uid(req)));
}));
accountRouter.get('/vouchers', wrap(async (req, res) => {
  res.json(await listMemberVouchers(uid(req)));
}));
