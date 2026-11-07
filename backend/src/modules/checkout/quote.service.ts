import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { now as clockNow } from '../../lib/clock';
import { Errors } from '../../lib/errors';
import type { Db } from '../../lib/sql';
import { ts } from '../../lib/sql';
import { resolveAddress } from '../location/location.service';
import { getSettings, PolicyDto, Settings, toPolicy } from '../store/settings.service';
import { evaluateVouchers, EvaluateResult, VoucherAppliedDto, VoucherRejectionDto } from '../voucher/voucher.service';
import { DeliveryWindow, estimateDeliveryFromDb } from './delivery';
import { LineCtx, loadVariantRows, refreshLines, RefreshedLine, RequestedLine, toRefreshedDto } from './lines.service';
import { computePricing, Pricing, sumValue } from './pricing';

export type PaymentMethodDto = 'cod' | 'bank-transfer';
export type PaymentReason = 'over-limit' | 'too-many-refusals' | 'too-many-open-orders' | 'not-enabled';

export interface PaymentOptionDto {
  method: PaymentMethodDto;
  available: boolean;
  reason?: PaymentReason;
}

/** Dạng `Quote` của contract. */
export interface QuoteDto {
  lines: RefreshedLine[];
  lineDiscounts: Array<{ variantId: string; amount: number }>;
  pricing: Pricing;
  vouchers: VoucherAppliedDto[];
  rejectedVouchers: VoucherRejectionDto[];
  shipping: { fee: number; freeReason: 'threshold' | 'voucher' | null; addressRequired: boolean };
  estimatedDelivery: DeliveryWindow;
  paymentMethods: PaymentOptionDto[];
  policy: PolicyDto;
}

export interface QuoteInput {
  items: readonly RequestedLine[];
  voucherCodes?: readonly string[];
  address?: { provinceCode: string; wardCode: string };
  contact?: { email?: string; phone?: string };
  /** Chỉ thành viên (role member); staff / admin không có. */
  userId?: string;
}

export interface QuoteDetail {
  quote: QuoteDto;
  settings: Settings;
  lines: LineCtx[];
  evaluation: EvaluateResult;
}

/**
 * Điều kiện phương thức thanh toán (BR-CHK-19, plan mục 4.5). Chưa biết SĐT (báo giá sớm): chỉ áp `over-limit`.
 */
export async function evaluatePaymentMethods(
  db: Db,
  total: number,
  phone: string | undefined,
  settings: Settings,
  at: Date,
): Promise<PaymentOptionDto[]> {
  const cod: PaymentOptionDto = { method: 'cod', available: true };
  if (total > settings.codMaxTotal) {
    cod.available = false;
    cod.reason = 'over-limit';
  } else if (phone) {
    const [r] = await db.$queryRaw<Array<{ refused: number; open: number }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "delivery_refused_at" IS NOT NULL
          AND "delivery_refused_at" > ${ts(at)} - make_interval(months => ${settings.codRefusalMonths}::int))::int AS refused,
        COUNT(*) FILTER (WHERE "status" IN ('to_ship', 'to_receive', 'cancel_requested'))::int AS open
      FROM "orders" WHERE "recipient_phone" = ${phone} AND "payment_method" = 'cod'`);
    if ((r?.refused ?? 0) >= settings.codRefusalLimit) {
      cod.available = false;
      cod.reason = 'too-many-refusals';
    } else if ((r?.open ?? 0) >= settings.codOpenOrderLimit) {
      cod.available = false;
      cod.reason = 'too-many-open-orders';
    }
  }
  const bank: PaymentOptionDto = settings.bankTransferEnabled
    ? { method: 'bank-transfer', available: true }
    : { method: 'bank-transfer', available: false, reason: 'not-enabled' };
  return [cod, bank];
}

/** Báo giá phía máy chủ (BR-CART-08, BR-CHK-10, BR-VOU-05..08). Không đổi dữ liệu, không giữ hàng, không trừ lượt. */
export async function buildQuoteDetail(input: QuoteInput, db: Db = prisma, at: Date = clockNow()): Promise<QuoteDetail> {
  const settings = await getSettings(db);
  if (input.address && !(await resolveAddress(db, input.address.provinceCode, input.address.wardCode))) {
    throw Errors.invalidAddress();
  }

  const rows = await loadVariantRows(
    db,
    input.items.map((i) => i.variantId),
  );
  const lines = refreshLines(input.items, rows, settings);
  const priced = lines.filter((l) => l.effectiveQuantity > 0);

  // Hạn mức cấu trúc: tổng số lượng hiệu lực <= 20 (BR-CART-03, AC-CART-05).
  if (priced.reduce((a, l) => a + l.effectiveQuantity, 0) > settings.maxItemsPerOrder) {
    throw Errors.validation(`Mỗi đơn tối đa ${settings.maxItemsPerOrder} sản phẩm.`, 'items');
  }

  const pricingLines = priced.map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice, quantity: l.effectiveQuantity }));
  const subtotal = sumValue(pricingLines);
  const thresholdFree = subtotal > 0 && subtotal >= settings.freeShippingThreshold;

  const evaluation = await evaluateVouchers({
    db,
    codes: input.voucherCodes ?? [],
    lines: priced,
    customer: { userId: input.userId, phone: input.contact?.phone, email: input.contact?.email },
    now: at,
    thresholdFree,
  });

  const result = computePricing({
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

  const estimatedDelivery = await estimateDeliveryFromDb(db, at, settings);
  const paymentMethods = await evaluatePaymentMethods(db, result.pricing.total, input.contact?.phone, settings, at);

  const quote: QuoteDto = {
    lines: lines.map(toRefreshedDto),
    lineDiscounts: result.lineDiscounts,
    pricing: result.pricing,
    vouchers: evaluation.vouchers,
    rejectedVouchers: evaluation.rejected,
    shipping: { fee: result.shipping.fee, freeReason: result.shipping.freeReason, addressRequired: !input.address },
    estimatedDelivery,
    paymentMethods,
    policy: toPolicy(settings),
  };
  return { quote, settings, lines, evaluation };
}

export const buildQuote = async (input: QuoteInput, db?: Db, at?: Date): Promise<QuoteDto> =>
  (await buildQuoteDetail(input, db, at)).quote;
