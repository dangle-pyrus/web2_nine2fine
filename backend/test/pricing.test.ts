import { describe, expect, it } from 'vitest';
import { allocateByWeight, floorTo } from '../src/lib/money';
import { vnYYMMDD } from '../src/lib/vn-time';
import { estimateDelivery } from '../src/modules/checkout/delivery';
import { computePricing, discountAmount } from '../src/modules/checkout/pricing';

const settings = { shippingFee: 30000, freeShippingThreshold: 1_000_000 };
const line = (id: string, unitPrice: number, quantity = 1) => ({ variantId: id, unitPrice, quantity });
const pct15 = { kind: 'percent' as const, value: 15, maxDiscount: null };

describe('T-CHK-01 pricing.ts', () => {
  it('999.000 chưa tới ngưỡng, 1.000.000 miễn phí giao (theo ngưỡng, trước voucher)', () => {
    const a = computePricing({ lines: [line('a', 999_000)], freeShipVoucher: false, settings });
    expect(a.pricing).toEqual({ subtotal: 999_000, discount: 0, shippingFee: 30000, shippingDiscount: 0, total: 1_029_000 });
    expect(a.shipping.freeReason).toBeNull();
    const b = computePricing({ lines: [line('a', 1_000_000)], freeShipVoucher: false, settings });
    expect(b.pricing).toMatchObject({ shippingFee: 30000, shippingDiscount: 30000, total: 1_000_000 });
    expect(b.shipping.freeReason).toBe('threshold');
  });

  it('blazer 1.290.000 + WELCOME15: giảm 193.000, miễn phí theo ngưỡng, tổng 1.097.000 (AC-VOU-07)', () => {
    const r = computePricing({
      lines: [line('b', 1_290_000)],
      discount: { voucher: pct15, eligibleVariantIds: new Set(['b']) },
      freeShipVoucher: false,
      settings,
    });
    expect(r.pricing).toEqual({ subtotal: 1_290_000, discount: 193_000, shippingFee: 30000, shippingDiscount: 30000, total: 1_097_000 });
  });

  it('390.000 + WELCOME15 + FREESHIP: giảm 58.000, phí miễn lý do voucher, tổng 332.000 (AC-VOU-01)', () => {
    const r = computePricing({
      lines: [line('t', 390_000)],
      discount: { voucher: pct15, eligibleVariantIds: new Set(['t']) },
      freeShipVoucher: true,
      settings,
    });
    expect(r.pricing).toEqual({ subtotal: 390_000, discount: 58_000, shippingFee: 30000, shippingDiscount: 30000, total: 332_000 });
    expect(r.shipping).toEqual({ fee: 30000, freeReason: 'voucher' });
  });

  it('trần mức giảm, mã số tiền không vượt tiền hàng, làm tròn xuống 1.000', () => {
    expect(discountAmount({ kind: 'percent', value: 15, maxDiscount: 100_000 }, 1_290_000)).toBe(100_000);
    expect(discountAmount({ kind: 'fixed', value: 500_000, maxDiscount: null }, 390_000)).toBe(390_000);
    expect(discountAmount({ kind: 'percent', value: 10, maxDiscount: null }, 99_990)).toBe(9_000);
    expect(floorTo(58_500, 1000)).toBe(58_000);
  });

  it('giỏ rỗng (mọi dòng hết hàng): không tính phí giao', () => {
    const r = computePricing({ lines: [], freeShipVoucher: false, settings });
    expect(r.pricing).toEqual({ subtotal: 0, discount: 0, shippingFee: 0, shippingDiscount: 0, total: 0 });
  });
});

describe('T-CHK-02 allocateByWeight', () => {
  it('ví dụ AC-VOU-08: 390.000 + 550.000, giảm 141.000 -> 58.500 + 82.500 (chia hết, dư 0)', () => {
    const r = computePricing({
      lines: [line('a-off', 390_000), line('b-weekend', 550_000)],
      discount: { voucher: pct15, eligibleVariantIds: new Set(['a-off', 'b-weekend']) },
      freeShipVoucher: false,
      settings,
    });
    expect(r.pricing.discount).toBe(141_000);
    const by = Object.fromEntries(r.lineDiscounts.map((d) => [d.variantId, d.amount]));
    expect(by['a-off']).toBe(58_500);
    expect(by['b-weekend']).toBe(82_500);
    expect(r.lineDiscounts.reduce((a, d) => a + d.amount, 0)).toBe(141_000);
  });

  it('có dư: 3 dòng 100.000 / 200.000 / 250.000 giảm 99.999 -> dư vào dòng 250.000', () => {
    const parts = allocateByWeight(99_999, [
      { id: 'a', weight: 100_000 },
      { id: 'b', weight: 200_000 },
      { id: 'c', weight: 250_000 },
    ]);
    const by = Object.fromEntries(parts.map((p) => [p.id, p.amount]));
    expect(by.a).toBe(18_181);
    expect(by.b).toBe(36_363);
    expect(by.c).toBe(45_455); // 45.454 + 1 dư
    expect(parts.reduce((x, p) => x + p.amount, 0)).toBe(99_999);
  });

  it('property: tổng phần chia luôn bằng tổng giảm (200 mẫu)', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 200; i++) {
      const n = 1 + rnd(8);
      const items = Array.from({ length: n }, (_, k) => ({ id: `v${k}`, weight: 10_000 + rnd(5_000_000) }));
      const total = 1 + rnd(items.reduce((a, x) => a + x.weight, 0));
      const parts = allocateByWeight(total, items);
      expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(total);
      expect(parts.every((p) => p.amount >= 0)).toBe(true);
    }
  });

  it('hoà trọng số: phần dư vào variantId nhỏ nhất', () => {
    const parts = allocateByWeight(101, [
      { id: 'b', weight: 100 },
      { id: 'a', weight: 100 },
      { id: 'c', weight: 100 },
    ]);
    expect(parts.find((p) => p.id === 'a')!.amount).toBe(35);
    expect(parts.reduce((x, p) => x + p.amount, 0)).toBe(101);
  });
});

describe('T-CHK-03 delivery.ts (AC-CHK-11)', () => {
  const s = { cutoffHour: 16, deliveryDaysMin: 2, deliveryDaysMax: 4 };
  const none = new Set<string>();
  // 2026-11-09 là thứ Hai. 03:00Z = 10:00 giờ VN.
  it('thứ Hai 10:00 -> thứ Tư..thứ Sáu', () => {
    expect(estimateDelivery(new Date('2026-11-09T03:00:00Z'), s, none)).toEqual({ from: '2026-11-11', to: '2026-11-13' });
  });
  it('thứ Hai 16:30 -> bắt đầu thứ Ba, thứ Năm..thứ Bảy', () => {
    expect(estimateDelivery(new Date('2026-11-09T09:30:00Z'), s, none)).toEqual({ from: '2026-11-12', to: '2026-11-14' });
  });
  it('thứ Sáu 10:00 -> thứ Hai..thứ Tư (bỏ Chủ nhật)', () => {
    expect(estimateDelivery(new Date('2026-11-13T03:00:00Z'), s, none)).toEqual({ from: '2026-11-16', to: '2026-11-18' });
  });
  it('thứ Sáu 10:00 mà thứ Hai kế tiếp là ngày lễ -> lùi thêm một ngày', () => {
    expect(estimateDelivery(new Date('2026-11-13T03:00:00Z'), s, new Set(['2026-11-16']))).toEqual({
      from: '2026-11-17',
      to: '2026-11-19',
    });
  });
  it('vnYYMMDD theo ngày Việt Nam: 17:30Z ngày 8 đã là ngày 9', () => {
    expect(vnYYMMDD(new Date('2026-11-08T17:30:00Z'))).toBe('261109');
  });
});
