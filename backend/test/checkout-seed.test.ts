import { beforeAll, describe, expect, it } from 'vitest';
import { seedCheckout } from '../prisma/seed-checkout';
import prisma from '../src/config/prisma';
import { resetCheckout } from './helpers';

const count = async (table: string) =>
  Number((await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*) AS c FROM "${table}"`))[0].c);

// T-MIG-01 (phần seed): AC-CHK-41.
describe('seed checkout idempotent', () => {
  beforeAll(resetCheckout);

  it('34 tỉnh/thành, >= 3000 phường/xã, mã 01 / 48 / 79, không phường mồ côi', async () => {
    expect(await count('provinces')).toBe(34);
    expect(await count('wards')).toBeGreaterThanOrEqual(3000);
    const codes = (await prisma.province.findMany({ select: { code: true } })).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['01', '48', '79']));
    const orphans = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM wards w LEFT JOIN provinces p ON p.province_code = w.province_code WHERE p.province_code IS NULL`;
    expect(Number(orphans[0].c)).toBe(0);
  });

  it('chạy lại không trùng, không đặt lại lượt đã dùng, không ghi đè tham số đã đổi', async () => {
    await prisma.$executeRawUnsafe(`UPDATE vouchers SET used_count = 1 WHERE code = 'N2FFREESHIP'`);
    await prisma.$executeRawUnsafe(`UPDATE store_settings SET shipping_fee = 35000 WHERE id = 1`);
    const before = [await count('vouchers'), await count('provinces'), await count('wards'), await count('holidays'), await count('store_settings')];
    await seedCheckout(prisma);
    await seedCheckout(prisma);
    const after = [await count('vouchers'), await count('provinces'), await count('wards'), await count('holidays'), await count('store_settings')];
    expect(after).toEqual(before);
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FFREESHIP' } });
    expect(v.usedCount).toBe(1);
    expect((await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } })).shippingFee).toBe(35000);
  });

  it('voucher seed đúng thuộc tính', async () => {
    const w = await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FWELCOME15' } });
    expect(w).toMatchObject({ kind: 'percent', value: 15, firstOrderOnly: true, minSubtotal: 100000, perUserLimit: 1, totalLimit: null });
    expect(w.endsAt?.toISOString()).toBe('2027-12-31T16:59:59.000Z');
    const f = await prisma.voucher.findUniqueOrThrow({ where: { code: 'N2FFREESHIP' } });
    expect(f).toMatchObject({ kind: 'free_shipping', value: null, minSubtotal: 300000 });
  });
});
