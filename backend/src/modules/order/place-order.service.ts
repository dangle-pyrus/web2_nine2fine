import { insertOrderEvent } from './order-event';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { ASSUMPTIONS } from '../../config/assumptions';
import { addMs, now as clockNow } from '../../lib/clock';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { resolveAddress } from '../location/location.service';
import { estimateDeliveryFromDb } from '../checkout/delivery';
import { LineCtx, loadVariantRows, refreshLines } from '../checkout/lines.service';
import { computePricing, sumValue } from '../checkout/pricing';
import { buildQuote, evaluatePaymentMethods } from '../checkout/quote.service';
import { getSettings } from '../store/settings.service';
import { customerRuleViolation, evaluateVouchers } from '../voucher/voucher.service';
import { acquireIdempotency, completeIdempotency, requestHash } from './idempotency';
import { generateOrderCode } from './order-code';
import { scheduleOrderEmail } from './order-email.service';
import { ORDER_INCLUDE, OrderDto, toOrderDto } from './order.mapper';
import type { PlaceOrderBody } from './order.schemas';

/** Đặt hàng: một giao dịch DB, tồn kho nguyên tử (plan mục 4.4). Thứ tự khoá: advisory(phone) -> vouchers -> product_variants. */

const MAX_TX_RETRIES = 3;
const MAX_CODE_TRIES = 10;
const PAYMENT_MSG: Record<string, string> = {
  'over-limit': 'Đơn hàng vượt hạn mức thanh toán khi nhận hàng. Vui lòng chọn chuyển khoản.',
  'too-many-refusals': 'Số điện thoại này không dùng được thanh toán khi nhận hàng. Vui lòng chọn chuyển khoản.',
  'too-many-open-orders': 'Bạn đang có nhiều đơn COD chưa giao. Vui lòng chọn chuyển khoản.',
  'not-enabled': 'Chuyển khoản hiện chưa khả dụng. Vui lòng chọn thanh toán khi nhận hàng.',
};

export interface PlaceOrderResult {
  order: OrderDto;
  replayed: boolean;
}

const isRetryable = (e: unknown): boolean => {
  const x = e as { code?: string; message?: string; meta?: { code?: string; message?: string } };
  if (x?.code === 'P2034') return true;
  const text = `${x?.meta?.code ?? ''} ${x?.meta?.message ?? ''} ${x?.message ?? ''}`;
  return /40P01|40001|deadlock detected|could not serialize/i.test(text);
};

const fingerprint = (items: ReadonlyArray<{ variantId: string; quantity: number }>): string =>
  createHash('sha256')
    .update(
      [...items]
        .map((i) => `${i.variantId}:${i.quantity}`)
        .sort()
        .join('|'),
    )
    .digest('hex');

export async function placeOrder(
  body: PlaceOrderBody,
  ctx: { key: string; userId?: string },
  at: Date = clockNow(),
): Promise<PlaceOrderResult> {
  const hash = requestHash(body, ctx.userId);
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction((tx) => runPlaceOrder(tx, body, ctx, hash, at), {
        isolationLevel: 'ReadCommitted',
        timeout: 10_000,
        maxWait: 5_000,
      });
      if (!result.replayed) scheduleOrderEmail(result.orderId);
      return { order: result.order, replayed: result.replayed };
    } catch (err) {
      if (isRetryable(err) && attempt < MAX_TX_RETRIES - 1) {
        lastError = err;
        continue;
      }
      throw await withFreshQuote(err, body, ctx.userId, at);
    }
  }
  throw lastError;
}

/** Mọi 409 mang `quote` mới nhất (dựng ngoài giao dịch đã rollback), trừ idempotency-conflict / possible-duplicate. */
async function withFreshQuote(err: unknown, body: PlaceOrderBody, userId: string | undefined, at: Date): Promise<unknown> {
  if (!(err instanceof AppError)) return err;
  if (!['stock-changed', 'price-changed', 'voucher-changed'].includes(err.code) || err.extras.quote !== undefined) return err;
  try {
    const removed = new Set(err.extras.removedVoucherCodes ?? []);
    err.extras.quote = await buildQuote(
      {
        items: body.items,
        voucherCodes: body.voucherCodes.filter((c) => !removed.has(c.replace(/\s+/g, '').toUpperCase())),
        address: { provinceCode: body.address.provinceCode, wardCode: body.address.wardCode },
        contact: { email: body.contact.email, phone: body.contact.phone },
        userId,
      },
      prisma,
      at,
    );
  } catch (e) {
    logger.warn('order-409-quote-failed', { reason: e instanceof Error ? e.name : 'unknown' });
  }
  return err;
}

interface TxResult {
  order: OrderDto;
  orderId: string;
  replayed: boolean;
}

async function runPlaceOrder(
  tx: Db,
  body: PlaceOrderBody,
  ctx: { key: string; userId?: string },
  hash: string,
  at: Date,
): Promise<TxResult> {
  // 1. Idempotency.
  const acquired = await acquireIdempotency(tx, 'order-create', ctx.key, hash, at);
  if (acquired.kind === 'replay' && acquired.orderId) {
    const existing = await tx.order.findUniqueOrThrow({ where: { order_id: acquired.orderId }, include: ORDER_INCLUDE });
    return { order: toOrderDto(existing), orderId: existing.order_id, replayed: true };
  }

  const phone = body.contact.phone;
  const email = body.contact.email;
  const method = body.paymentMethod === 'cod' ? 'cod' : 'bank_transfer';

  // Khoá theo SĐT: hai đơn cùng SĐT tuần tự hoá để đếm "COD chưa giao" / "đơn đầu tiên" không chạy đua (một khoá advisory
  // mỗi giao dịch, lấy đầu tiên nên không tự deadlock).
  if (method === 'cod' || body.voucherCodes.length > 0) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order-phone:${phone}`}, 0))`);
  }

  // 2. Địa chỉ + cấu hình.
  const place = await resolveAddress(tx, body.address.provinceCode, body.address.wardCode);
  if (!place) throw Errors.invalidAddress();
  const settings = await getSettings(tx);

  // Hạn mức cấu trúc: tổng số lượng <= 20 (BR-CART-03).
  const totalQty = body.items.reduce((a, i) => a + i.quantity, 0);
  if (totalQty > settings.maxItemsPerOrder) {
    throw Errors.validation(`Mỗi đơn tối đa ${settings.maxItemsPerOrder} sản phẩm.`, 'items');
  }

  // 3. Đọc dòng, khoá chia sẻ sản phẩm (giá không đổi giữa lúc đọc và lúc commit).
  const rows = await loadVariantRows(
    tx,
    body.items.map((i) => i.variantId),
    true,
  );
  const lines = refreshLines(body.items, rows, settings);
  const priced = lines.filter((l) => l.effectiveQuantity > 0);
  const pricingLines = priced.map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice, quantity: l.effectiveQuantity }));
  const subtotal = sumValue(pricingLines);

  const customer = { userId: ctx.userId, phone, email };
  const evaluation = await evaluateVouchers({
    db: tx,
    codes: body.voucherCodes,
    lines: priced,
    customer,
    now: at,
    thresholdFree: subtotal > 0 && subtotal >= settings.freeShippingThreshold,
  });
  const computed = computePricing({
    lines: pricingLines,
    discount: evaluation.discount
      ? {
          voucher: {
            kind: evaluation.discount.row.kind as 'percent' | 'fixed',
            value: evaluation.discount.row.value ?? 0,
            maxDiscount: evaluation.discount.row.maxDiscount,
          },
          eligibleVariantIds: evaluation.discount.eligibleVariantIds,
        }
      : undefined,
    freeShipVoucher: !!evaluation.freeShip,
    settings,
  });

  // 4. Kiểm không khoá, theo thứ tự quyết định mã lỗi (CHK-CF-01).
  // (a) phương thức thanh toán.
  const options = await evaluatePaymentMethods(tx, computed.pricing.total, phone, settings, at);
  const chosen = options.find((o) => o.method === body.paymentMethod);
  if (!chosen || !chosen.available) {
    throw Errors.validation(PAYMENT_MSG[chosen?.reason ?? 'not-enabled'], 'paymentMethod');
  }
  // (b) tồn: gom MỌI dòng thiếu.
  const short = lines.filter((l) => l.effectiveQuantity < l.requestedQuantity);
  if (short.length > 0) {
    throw Errors.stockChanged(short.map((l) => ({ variantId: l.variantId, available: Math.max(0, l.maxQuantity) })));
  }
  // (c) mã voucher.
  if (evaluation.rejected.length > 0) throw Errors.voucherChanged(evaluation.rejected.map((r) => r.code));
  // (d) giá khách đang thấy (kể cả khi giảm).
  const expectedPrice = new Map(body.expected.lines.map((l) => [l.variantId.toLowerCase(), l.unitPrice]));
  const e = body.expected.pricing;
  const p = computed.pricing;
  const priceChanged =
    priced.some((l) => expectedPrice.get(l.variantId) !== l.unitPrice) ||
    e.subtotal !== p.subtotal ||
    e.discount !== p.discount ||
    e.shippingFee !== p.shippingFee ||
    e.shippingDiscount !== p.shippingDiscount ||
    e.total !== p.total;
  if (priceChanged) throw Errors.priceChanged();
  // (e) đơn trùng 10 phút (Should).
  const fp = fingerprint(body.items);
  if (!body.confirmDuplicate) {
    const dup = await tx.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT "code" FROM "orders"
      WHERE "recipient_phone" = ${phone} AND "items_fingerprint" = ${fp}
        AND "created_at" > ${ts(addMs(at, -ASSUMPTIONS.duplicateWindowMs))} AND "status" <> 'cancelled'
      ORDER BY "created_at" DESC LIMIT 1`);
    if (dup[0]) throw Errors.possibleDuplicate(dup[0].code);
  }

  // 6. Giữ lượt voucher theo voucher_id tăng dần (khoá trước tồn kho).
  const claims = [evaluation.discount?.row, evaluation.freeShip?.row].filter((r): r is NonNullable<typeof r> => !!r);
  claims.sort((a, b) => (a.voucher_id < b.voucher_id ? -1 : 1));
  const failed: string[] = [];
  for (const v of claims) {
    const got = await tx.$queryRaw<Array<{ used_count: number }>>(Prisma.sql`
      UPDATE "vouchers" SET "used_count" = "used_count" + 1, "updated_at" = ${ts(at)}
      WHERE "voucher_id" = ${v.voucher_id}::uuid AND "is_active"
        AND ("starts_at" IS NULL OR "starts_at" <= ${ts(at)}) AND ("ends_at" IS NULL OR "ends_at" > ${ts(at)})
        AND ("total_limit" IS NULL OR "used_count" < "total_limit")
      RETURNING "used_count"`);
    if (got.length === 0) {
      failed.push(v.code);
      continue;
    }
    // Đã giữ khoá dòng voucher: kiểm lại lượt riêng và "đơn đầu tiên" trên dữ liệu đã commit.
    if (await customerRuleViolation(tx, v, customer)) failed.push(v.code);
  }
  if (failed.length > 0) throw Errors.voucherChanged(failed);

  // 7. Trừ tồn từng dòng theo variant_id tăng dần; chạy hết rồi gom mọi dòng thất bại.
  const byId = [...priced].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));
  const shortNow: string[] = [];
  for (const l of byId) {
    const r = await tx.$queryRaw<Array<{ inventory_qty: number }>>(Prisma.sql`
      UPDATE "product_variants" SET "inventory_qty" = "inventory_qty" - ${l.effectiveQuantity}, "updated_at" = ${ts(at)}
      WHERE "variant_id" = ${l.variantId}::uuid AND "inventory_qty" >= ${l.effectiveQuantity}
      RETURNING "inventory_qty"`);
    if (r.length === 0) shortNow.push(l.variantId);
  }
  if (shortNow.length > 0) {
    const now = await tx.$queryRaw<Array<{ variant_id: string; inventory_qty: number }>>(Prisma.sql`
      SELECT "variant_id", "inventory_qty" FROM "product_variants" WHERE "variant_id" = ANY(${shortNow}::uuid[])`);
    const left = new Map(now.map((x) => [x.variant_id, x.inventory_qty]));
    throw Errors.stockChanged(
      shortNow.map((id) => ({ variantId: id, available: Math.max(0, Math.min(settings.maxPerVariant, left.get(id) ?? 0)) })),
    );
  }

  // 8. Tạo đơn.
  const window = await estimateDeliveryFromDb(tx, at, settings);
  const isBank = method === 'bank_transfer';
  const needsConfirmCall = await needsConfirmationCall(tx, ctx.userId, computed.pricing.total);
  const discountCode = evaluation.discount?.row.code ?? null;
  const shippingCode = evaluation.freeShip?.row.code ?? null;
  const inv = body.invoice;
  let orderId: string | undefined;
  let code = '';
  for (let i = 0; i < MAX_CODE_TRIES && !orderId; i++) {
    code = generateOrderCode(at);
    const ins = await tx.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
      INSERT INTO "orders" (
        "code", "user_id", "status", "payment_status", "payment_method", "email", "recipient_name", "recipient_phone",
        "province_code", "ward_code", "province_name", "ward_name", "street", "note",
        "invoice_company", "invoice_tax_code", "invoice_address", "invoice_email",
        "subtotal", "discount", "shipping_fee", "shipping_discount", "total",
        "discount_voucher_code", "shipping_voucher_code", "payment_due_at", "estimated_from", "estimated_to",
        "needs_confirm_call", "terms_accepted_at", "items_fingerprint", "created_at")
      VALUES (
        ${code}, ${ctx.userId ?? null}::uuid, ${isBank ? 'to_pay' : 'to_ship'}::"order_status", 'pending', ${method}::"payment_method",
        ${email}, ${body.contact.name}, ${phone},
        ${body.address.provinceCode}, ${body.address.wardCode}, ${place.provinceName}, ${place.wardName}, ${body.address.street}, ${body.note},
        ${inv?.companyName ?? null}, ${inv?.taxCode ?? null}, ${inv?.address ?? null}, ${inv?.email ?? null},
        ${p.subtotal}, ${p.discount}, ${p.shippingFee}, ${p.shippingDiscount}, ${p.total},
        ${discountCode}, ${shippingCode},
        ${isBank ? ts(addMs(at, settings.bankHoldMinutes * 60_000)) : Prisma.sql`NULL`},
        ${window.from}::date, ${window.to}::date,
        ${needsConfirmCall}, ${ts(at)}, ${fp}, ${ts(at)})
      ON CONFLICT ("code") DO NOTHING
      RETURNING "order_id"`);
    orderId = ins[0]?.order_id;
  }
  if (!orderId) throw Errors.unavailable();

  const discountByVariant = new Map(computed.lineDiscounts.map((d) => [d.variantId, d.amount]));
  await tx.orderItem.createMany({
    data: priced.map((l: LineCtx, idx) => ({
      orderId: orderId!,
      lineNo: idx + 1,
      variantId: l.variantId,
      productId: l.productId,
      productSlug: l.slug,
      name: l.name,
      colorName: l.color,
      size: l.size,
      sku: l.sku,
      mediaId: l.mediaId,
      unitPrice: l.unitPrice,
      compareAtPrice: l.compareAtPrice ?? null,
      quantity: l.effectiveQuantity,
      lineDiscount: discountByVariant.get(l.variantId) ?? 0,
    })),
  });
  if (claims.length > 0) {
    await tx.voucherRedemption.createMany({
      data: claims.map((v) => ({ voucherId: v.voucher_id, orderId: orderId!, userId: ctx.userId ?? null, phone, email, createdAt: at })),
    });
  }
  await insertOrderEvent(tx, {
    orderId: orderId!,
    at,
    fromStatus: null,
    toStatus: isBank ? 'to_pay' : 'to_ship',
    paymentStatus: 'pending',
    actor: 'customer',
    kind: 'placed',
  });

  // 9. Kiểm cuối: tổng phần giảm theo dòng = giảm giá đơn; tổng dòng = tạm tính. Lệch là bug -> rollback + 500.
  const [sums] = await tx.$queryRaw<Array<{ ld: bigint; st: bigint }>>(Prisma.sql`
    SELECT COALESCE(SUM("line_discount"), 0)::bigint AS ld, COALESCE(SUM("unit_price"::bigint * "quantity"), 0)::bigint AS st
    FROM "order_items" WHERE "order_id" = ${orderId}::uuid`);
  if (Number(sums.ld) !== p.discount || Number(sums.st) !== p.subtotal) throw new Error('order-total-mismatch');

  // 10. Giỏ thành viên: chỉ xoá các dòng đã mua (BR-CART-07).
  if (ctx.userId) {
    const cart = await tx.cart.findUnique({ where: { userId: ctx.userId } });
    if (cart) {
      await tx.cartLine.deleteMany({ where: { cartId: cart.cart_id, variantId: { in: priced.map((l) => l.variantId) } } });
      await tx.$executeRaw(Prisma.sql`UPDATE "carts" SET "updated_at" = ${ts(at)} WHERE "cart_id" = ${cart.cart_id}::uuid`);
    }
  }

  // 11. Ghi order_id vào khoá idempotency.
  await completeIdempotency(tx, 'order-create', ctx.key, { orderId });
  const created = await tx.order.findUniqueOrThrow({ where: { order_id: orderId }, include: ORDER_INCLUDE });
  return { order: toOrderDto(created), orderId, replayed: false };
}

/** BR-CHK-20: COD cần CSKH gọi xác nhận, trừ thành viên đã có đơn `completed` và đơn này < 1.000.000 ₫. */
async function needsConfirmationCall(tx: Db, userId: string | undefined, total: number): Promise<boolean> {
  if (!userId || total >= ASSUMPTIONS.noConfirmCallBelowTotal) return true;
  const done = await tx.order.findFirst({ where: { userId, status: 'completed' }, select: { order_id: true } });
  return !done;
}
