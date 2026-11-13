import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Order, OrderItem } from '@prisma/client';
import { RETURNS_ASSUMPTIONS } from '../../config/assumptions';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { isRetryable } from '../../lib/retry';
import { ts } from '../../lib/sql';
import { BODY_MSG } from '../../lib/validate';
import { acquireIdempotency, completeIdempotency, requestHash } from '../order/idempotency';
import { scheduleEventEmail } from '../order/order-email.service';
import { normalizeOrderCode } from '../order/order-code';
import { encryptAccountNumber, hmacForHash, last4Of } from './account-secret';
import { computeReturnAmount, type ReturnAmountResult } from './return-amount';
import { emitReturnEvent } from './return-events';
import { type PhotoAudience, type ReturnAmountDto, toReturnRequest, type ReturnRequestDto } from './return.mapper';
import { loadReturn } from './return.query';
import { checkEligibility, faultOf, type ReturnFault, type ReturnReason } from './return-rules';
import { dependentIssues, lc, parseCreateFields, RETURN_MSG, throwIfIssues, type CreateShape } from './returns.schemas';

/** Gửi yêu cầu trả hàng (plan mục 6.1) và ước tính (Should). Chủ thể: thành viên chủ đơn. */

const TX = { timeout: 10_000, maxWait: 5_000 } as const;

export interface MemberPrincipal {
  kind: 'member';
  userId: string;
}

/** Khách vãng lai (BR-RET-60): quyền = grant `n2f_oa` gắn đúng đơn `orderId` (đơn KHÔNG thuộc tài khoản thành viên). */
export interface GuestPrincipal {
  kind: 'guest';
  grantHash: string;
  orderId: string;
}

export type ReturnPrincipal = MemberPrincipal | GuestPrincipal;

/** Dạng ảnh trong DTO trả về: URL ảnh trỏ về đúng nhóm endpoint của chủ thể. */
export const audienceFor = (p: ReturnPrincipal, orderCode: string): PhotoAudience =>
  p.kind === 'member' ? { kind: 'member' } : { kind: 'guest', orderCode };

/** Định danh chủ thể cho băm Idempotency: thành viên theo tài khoản, khách theo đơn (grant mới sau OTP vẫn phát lại được). */
const identityOf = (p: ReturnPrincipal): string => (p.kind === 'member' ? p.userId : `guest:${p.orderId}`);

/** Ảnh phải do CHÍNH chủ thể tải: thành viên theo tài khoản; khách theo grant (`grant_hash`) + cùng đơn (BR-RET-62). */
const ownPhotoSql = (p: ReturnPrincipal, orderId: string): Prisma.Sql =>
  p.kind === 'member'
    ? Prisma.sql`"uploader_user_id" = ${p.userId}::uuid`
    : Prisma.sql`"grant_hash" = ${p.grantHash} AND "order_id" = ${orderId}::uuid`;

type OrderWithItems = Order & { items: OrderItem[] };

/** Đơn của chính thành viên; mã sai dạng / không có / của người khác -> `null` (gọi tự quyết 404 để thứ tự 422 -> 404 đúng). */
async function findOwnedOrder(p: ReturnPrincipal, rawCode: string): Promise<OrderWithItems | null> {
  const code = normalizeOrderCode(rawCode);
  if (!code) return null;
  const o = await prisma.order.findUnique({ where: { code }, include: { items: true } });
  if (!o) return null;
  if (p.kind === 'member') return o.userId === p.userId ? o : null;
  return o.userId === null && o.order_id === p.orderId ? o : null;
}

const asObject = (body: unknown): Record<string, unknown> => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(BODY_MSG);
  return body as Record<string, unknown>;
};

/** Ánh xạ `variantId -> dòng đơn`; trùng / lạ / số lượng ngoài 1..đã mua -> `422 lines`. */
function mapLines(items: OrderItem[], lines: CreateShape['lines']): Map<string, number> {
  const by = new Map(items.map((i) => [lc(i.variantId), i]));
  const qty = new Map<string, number>();
  for (const l of lines) {
    const item = by.get(lc(l.variantId));
    if (!item || l.quantity < 1 || l.quantity > item.quantity || qty.has(item.order_item_id)) throw Errors.validation(RETURN_MSG.lines, 'lines');
    qty.set(item.order_item_id, l.quantity);
  }
  return qty;
}

function amountFor(o: OrderWithItems, qty: Map<string, number>, fault: ReturnFault): ReturnAmountResult {
  return computeReturnAmount({
    orderLines: o.items.map((i) => ({ orderItemId: i.order_item_id, unitPrice: i.unitPrice, quantity: i.quantity, lineDiscount: i.lineDiscount })),
    qtyByItem: qty, fault, shippingFee: o.shippingFee, shippingDiscount: o.shippingDiscount,
  });
}

const toAmountDto = (a: ReturnAmountResult): ReturnAmountDto => ({
  goodsAmount: a.goodsAmount, shippingRefund: a.shippingRefund, returnShippingFee: a.returnShippingFee, amount: a.amount, final: false,
});

/** `POST .../return/estimate` (Should): đúng số mà `createReturn` sẽ lưu; không ghi gì, không kiểm ảnh / mô tả / tài khoản / hạn. */
export async function estimateReturn(p: ReturnPrincipal, rawCode: string, body: unknown): Promise<ReturnAmountDto> {
  const raw = asObject(body);
  const order = await findOwnedOrder(p, rawCode);
  const f = parseCreateFields(raw, ['lines', 'reason']);
  throwIfIssues(f.issues);
  if (!order) throw Errors.notFound();
  const fault = faultOf(f.value.reason as ReturnReason);
  const a = amountFor(order, mapLines(order.items, f.value.lines!), fault);
  if (a.amount <= 0) throw Errors.validation(RETURN_MSG.amount, 'lines');
  return toAmountDto(a);
}

export interface CreateResult {
  dto: ReturnRequestDto;
  replayed: boolean;
}

export async function createReturn(p: ReturnPrincipal, rawCode: string, body: unknown, key: string, path: string): Promise<CreateResult> {
  const raw = asObject(body);
  const order = await findOwnedOrder(p, rawCode);
  const f = parseCreateFields(raw);
  if (!order) {
    throwIfIssues(f.issues); // 422 đứng trước 404 (thứ tự kiểm của contract)
    throw Errors.notFound();
  }
  const method = order.paymentMethod;
  const dep = dependentIssues(raw, f.value, method);
  throwIfIssues(f.issues, dep.issues);
  const v = f.value as CreateShape;
  const account = dep.account; // chỉ có khi đơn COD
  const fault = faultOf(v.reason);

  const hash = requestHash(
    {
      method: 'POST', path,
      body: {
        lines: [...v.lines].map((l) => ({ variantId: lc(l.variantId), quantity: l.quantity })).sort((a, b) => (a.variantId < b.variantId ? -1 : 1)),
        reason: v.reason, detail: v.detail ?? '', conditionAck: v.conditionAck === true,
        photos: [...(v.photos ?? [])].map(lc).sort(),
        // Không băm số tài khoản trần (6..19 chữ số dò ngược được): dùng HMAC.
        account: account ? { bank: account.bank, accountNumber: hmacForHash(account.accountNumber), accountName: account.accountName } : null,
      },
    },
    identityOf(p),
  );

  for (let attempt = 1; ; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const at = clockNow();
        const acq = await acquireIdempotency(tx, 'admin-action', key, hash, at);
        if (acq.kind === 'replay') return { dto: acq.snapshot as ReturnRequestDto, replayed: true, eventId: null as string | null };

        // Tuần tự hoá các yêu cầu cùng đơn, rồi đọc lại đơn trong giao dịch.
        await tx.$queryRaw(Prisma.sql`SELECT "order_id" FROM "orders" WHERE "order_id" = ${order.order_id}::uuid FOR UPDATE`);
        const o = await tx.order.findUniqueOrThrow({ where: { order_id: order.order_id }, include: { items: true } });

        const el = checkEligibility({ status: o.status, paymentStatus: o.paymentStatus, deliveredAt: o.deliveredAt }, at);
        if (el === 'not-returnable') throw Errors.notReturnable();
        if (el === 'window-closed') throw Errors.returnWindowClosed();
        const live = await tx.orderReturn.findFirst({ where: { orderId: o.order_id, activeOrderId: { not: null } }, select: { return_id: true } });
        if (live) throw Errors.returnExists();

        const qty = mapLines(o.items, v.lines);
        const photoIds = (v.photos ?? []).map(lc);
        if (photoIds.length > 0) {
          const since = new Date(at.getTime() - RETURNS_ASSUMPTIONS.photo.attachWindowMs);
          const ok = await tx.$queryRaw<Array<{ photo_id: string }>>(Prisma.sql`
            SELECT "photo_id" FROM "return_photos"
            WHERE "photo_id" = ANY(${photoIds}::uuid[]) AND "return_id" IS NULL AND "created_at" >= ${ts(since)} AND ${ownPhotoSql(p, o.order_id)}
            FOR UPDATE`);
          if (ok.length !== photoIds.length) throw Errors.validation('Ảnh minh chứng chưa hợp lệ hoặc đã hết hạn gắn.', 'photos');
        }
        const amt = amountFor(o, qty, fault);
        if (amt.amount <= 0) throw Errors.validation(RETURN_MSG.amount, 'lines');

        const returnId = randomUUID();
        try {
          await tx.orderReturn.create({
            data: {
              return_id: returnId, orderId: o.order_id, activeOrderId: o.order_id, state: 'requested', reason: v.reason, fault, detail: v.detail ?? '',
              conditionAck: v.conditionAck === true, requestedVia: p.kind, requestedBy: p.kind === 'member' ? p.userId : null, requestedAt: at,
              goodsAmount: amt.goodsAmount, shippingRefund: amt.shippingRefund, returnShippingFee: amt.returnShippingFee, amount: amt.amount, amountFinal: false,
              ...(account
                ? {
                    bankName: account.bank, accountLast4: last4Of(account.accountNumber), accountName: account.accountName,
                    accountNumberEnc: encryptAccountNumber(account.accountNumber, returnId),
                  }
                : {}),
              items: { create: [...qty].map(([orderItemId, quantity]) => ({ orderItemId, quantity, goodsAmount: amt.lines.get(orderItemId) ?? 0 })) },
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw Errors.returnExists();
          throw err;
        }
        if (photoIds.length > 0) {
          await tx.$executeRaw(Prisma.sql`UPDATE "return_photos" SET "return_id" = ${returnId}::uuid WHERE "photo_id" = ANY(${photoIds}::uuid[])`);
        }
        const eventId = await emitReturnEvent(tx, {
          orderId: o.order_id, returnId, orderStatus: o.status, paymentStatus: o.paymentStatus, kind: 'return_requested', actor: 'customer', at, reasonCode: v.reason,
        });
        const row = await loadReturn(tx, returnId);
        const dto = await toReturnRequest(tx, row!, o.paymentMethod, audienceFor(p, o.code));
        await completeIdempotency(tx, 'admin-action', key, { orderId: o.order_id, snapshot: dto });
        return { dto, replayed: false, eventId };
      }, TX);
      if (out.eventId) {
        scheduleEventEmail(out.eventId);
        logger.info('return-requested', { returnId: out.dto.id, orderCode: order.code, via: p.kind, action: 'create' });
      }
      return { dto: out.dto, replayed: out.replayed };
    } catch (err) {
      if (!(err instanceof AppError) && attempt < 3 && isRetryable(err)) continue;
      throw err;
    }
  }
}
