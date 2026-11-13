import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../../lib/validate';
import { cartQuoteLimit } from '../../middleware/rate-limit';
import { optionalAuth } from '../../middleware/optional-auth';
import { simulatePayment } from '../order/payment.service';

/**
 * `POST /api/orders/{orderCode}/payment/simulate` (chỉ khi PAYMENT_SIMULATOR=true; tắt -> 404).
 * Gắn dưới `/orders` sau originGuard + cookieParser, TRƯỚC orderRouter. Quyền như trang thanh toán (chủ đơn / `n2f_oa`).
 */
const bodySchema = z.object({ action: z.enum(['pay', 'pay-partial', 'expire']) }).strict();

export const paymentSimulatorRouter = Router();

paymentSimulatorRouter.post(
  '/:orderCode/payment/simulate',
  cartQuoteLimit,
  optionalAuth,
  (req: Request, res: Response, next: NextFunction) => {
    const { action } = parseBody(bodySchema, req.body);
    simulatePayment(req, String(req.params.orderCode), action)
      .then((s) => res.set('Cache-Control', 'no-store').json(s))
      .catch(next);
  },
);
