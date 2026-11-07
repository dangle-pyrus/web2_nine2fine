import type { Request, Response } from 'express';
import { Errors } from '../../lib/errors';
import { readSessionToken } from '../../middleware/auth';
import {
  parseCodes,
  parseLoginCode,
  parseLoginPassword,
  parseLookup,
  parseRegister,
  parseReset,
} from './auth.schemas';
import * as service from './auth.service';
import { Audience, authenticate, clearSessionCookie, revokeByToken, setSessionCookie } from './session.service';

const client = (req: Request): service.ClientInfo => ({
  ip: req.ip ?? 'unknown',
  userAgent: req.get('user-agent') ?? undefined,
});

export async function lookup(req: Request, res: Response): Promise<void> {
  const { email } = parseLookup(req.body);
  res.json(await service.lookupEmail(email, client(req).ip));
}

export async function requestCode(req: Request, res: Response): Promise<void> {
  const { email, purpose } = parseCodes(req.body);
  res.json(await service.requestCode(email, purpose, client(req).ip));
}

export async function loginWithCode(req: Request, res: Response): Promise<void> {
  const { email, code } = parseLoginCode(req.body);
  const { user, session } = await service.loginWithCode(email, code, client(req));
  setSessionCookie(res, 'storefront', session);
  res.json(user);
}

export const loginWithPassword =
  (audience: Audience) =>
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = parseLoginPassword(req.body);
    const { user, session } = await service.loginWithPassword(email, password, audience, client(req));
    setSessionCookie(res, audience, session);
    res.json(user);
  };

export async function register(req: Request, res: Response): Promise<void> {
  const input = parseRegister(req.body);
  const { user, session } = await service.register(input, client(req));
  setSessionCookie(res, 'storefront', session);
  res.status(201).json(user);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { email, code, newPassword } = parseReset(req.body);
  await service.resetPassword(email, code, newPassword, client(req).ip);
  res.status(204).end();
}

/** Storefront: chưa đăng nhập là trạng thái bình thường -> 200 {user:null}. */
export async function me(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const token = readSessionToken(req, 'storefront');
  const ctx = await authenticate(token, 'storefront');
  if (!ctx) {
    if (token) clearSessionCookie(res, 'storefront');
    res.json({ user: null });
    return;
  }
  res.json({ user: service.toAuthUser(ctx.user) });
}

/** Admin: chưa đăng nhập -> 401 (giữ hành vi guard admin hiện có). */
export async function adminMe(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const token = readSessionToken(req, 'admin');
  const ctx = await authenticate(token, 'admin');
  if (!ctx) {
    if (token) clearSessionCookie(res, 'admin');
    throw Errors.unauthenticated();
  }
  res.json(service.toAuthUser(ctx.user));
}

export const logout =
  (audience: Audience) =>
  async (req: Request, res: Response): Promise<void> => {
    await revokeByToken(readSessionToken(req, audience), audience);
    clearSessionCookie(res, audience);
    res.status(204).end();
  };

