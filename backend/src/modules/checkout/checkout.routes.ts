import { NextFunction, Request, Response, Router } from 'express';
import { parseBody } from '../../lib/validate';
import { cartQuoteLimit } from '../../middleware/rate-limit';
import { memberIdOf, optionalAuth } from '../../middleware/optional-auth';
import { assertVoucherNotLocked, recordVoucherMisses } from '../voucher/voucher-guard';
import { normalizeVoucherCode } from '../voucher/voucher.service';
import { quoteSchema, voucherCheckSchema } from './checkout.schemas';
import { buildQuoteDetail } from './quote.service';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const ip = (req: Request) => req.ip ?? 'unknown';

/** POST /checkout/quote: công khai (phiên sai = khách), không đổi dữ liệu. */
export const checkoutRouter = Router();
checkoutRouter.post(
  '/quote',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    const body = parseBody(quoteSchema, req.body);
    if (body.voucherCodes.length > 0) await assertVoucherNotLocked(ip(req));
    const { quote, evaluation } = await buildQuoteDetail({ ...body, userId: memberIdOf(req) });
    if (evaluation.notFoundCount > 0) await recordVoucherMisses(ip(req), evaluation.notFoundCount);
    res.set('Cache-Control', 'no-store').json(quote);
  }),
);

/** POST /vouchers/check: mã đặt cuối, mã không đạt vẫn 200 (BR-VOU-03, 04, 09). */
export const voucherRouter = Router();
voucherRouter.post(
  '/check',
  cartQuoteLimit,
  optionalAuth,
  wrap(async (req, res) => {
    const body = parseBody(voucherCheckSchema, req.body);
    await assertVoucherNotLocked(ip(req));
    const code = normalizeVoucherCode(body.code);
    const detail = await buildQuoteDetail({
      items: body.items,
      voucherCodes: [...body.voucherCodes, body.code],
      address: body.address,
      contact: body.contact,
      userId: memberIdOf(req),
    });
    if (detail.evaluation.notFoundCount > 0) await recordVoucherMisses(ip(req), detail.evaluation.notFoundCount);
    const result =
      detail.evaluation.vouchers.find((v) => v.code === code) ?? detail.evaluation.rejected.find((v) => v.code === code);
    res.set('Cache-Control', 'no-store').json({ result, quote: detail.quote });
  }),
);
