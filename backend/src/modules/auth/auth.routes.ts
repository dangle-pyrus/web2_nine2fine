import { Router } from 'express';
import * as c from './auth.controller';

/** Storefront: /api/auth/* */
export const authRouter = Router();
authRouter.post('/lookup', c.lookup);
authRouter.post('/codes', c.requestCode);
authRouter.post('/login/code', c.loginWithCode);
authRouter.post('/login/password', c.loginWithPassword('storefront'));
authRouter.post('/register', c.register);
authRouter.post('/password/reset', c.resetPassword);
authRouter.get('/me', c.me);
authRouter.post('/logout', c.logout('storefront'));

/** Admin: /api/admin/auth/* */
export const adminAuthRouter = Router();
adminAuthRouter.post('/login', c.loginWithPassword('admin'));
adminAuthRouter.get('/me', c.adminMe);
adminAuthRouter.post('/logout', c.logout('admin'));
