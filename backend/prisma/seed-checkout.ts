import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { foldVi } from '../src/lib/text';
import locationData from './seed-data/vn-locations.json';
import holidayData from './seed-data/holidays-vn.json';

/**
 * Seed Slice 3 idempotent (BR-CHK-33, AC-CHK-41): tham số vận hành, 2 voucher, địa giới 34 tỉnh/thành, ngày nghỉ.
 * Chạy lại không trùng và KHÔNG đặt lại `used_count` / không ghi đè tham số đã đổi bằng SQL.
 * Không gắn vào `prisma db seed`; chạy bằng `npm run seed:checkout` (dùng DIRECT_URL, không qua pgbouncer 6543).
 */

interface LocationFile {
  provinces: { code: string; name: string }[];
  wards: [string, string, string][];
}
interface HolidayFile {
  holidays: { date: string; name: string }[];
}

const locations = locationData as unknown as LocationFile;
const holidays = holidayData as unknown as HolidayFile;

const EXPECTED_PROVINCES = 34;
const ENDS_AT = new Date('2027-12-31T16:59:59.000Z'); // 31/12/2027 23:59:59 giờ Việt Nam

function validate(): void {
  if (locations.provinces.length !== EXPECTED_PROVINCES) throw new Error('Địa giới phải có đúng 34 tỉnh/thành.');
  const provinceCodes = new Set(locations.provinces.map((p) => p.code));
  if (provinceCodes.size !== locations.provinces.length) throw new Error('Mã tỉnh trùng.');
  const wardCodes = new Set<string>();
  for (const [code, provinceCode] of locations.wards) {
    if (wardCodes.has(code)) throw new Error('Mã phường/xã trùng.');
    wardCodes.add(code);
    if (!provinceCodes.has(provinceCode)) throw new Error('Phường/xã mồ côi (không có tỉnh).');
  }
  for (const code of ['01', '48', '79']) {
    if (!provinceCodes.has(code)) throw new Error(`Thiếu mã tỉnh ${code} (mock FE đang dùng).`);
  }
}

async function seedLocations(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`INSERT INTO "provinces" ("province_code", "name", "name_search")
    SELECT * FROM unnest(${locations.provinces.map((p) => p.code)}::text[], ${locations.provinces.map((p) => p.name)}::text[],
                         ${locations.provinces.map((p) => foldVi(p.name))}::text[])
    ON CONFLICT ("province_code") DO UPDATE SET "name" = EXCLUDED."name", "name_search" = EXCLUDED."name_search"`;

  // Phường/xã: chia lô để không vượt giới hạn tham số của một câu.
  const CHUNK = 1500;
  for (let i = 0; i < locations.wards.length; i += CHUNK) {
    const part = locations.wards.slice(i, i + CHUNK);
    await tx.$executeRaw`INSERT INTO "wards" ("ward_code", "province_code", "name", "name_search")
      SELECT * FROM unnest(${part.map((w) => w[0])}::text[], ${part.map((w) => w[1])}::text[],
                           ${part.map((w) => w[2])}::text[], ${part.map((w) => foldVi(w[2]))}::text[])
      ON CONFLICT ("ward_code") DO UPDATE SET "province_code" = EXCLUDED."province_code",
        "name" = EXCLUDED."name", "name_search" = EXCLUDED."name_search"`;
  }

}

export async function seedCheckout(
  prisma: PrismaClient,
  opts: { locations?: boolean } = {},
): Promise<{ provinces: number; wards: number; holidays: number; vouchers: number }> {
  if (process.env.NODE_ENV === 'production' && process.env.CHECKOUT_SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Từ chối seed checkout ở production: đặt CHECKOUT_SEED_ALLOW_PRODUCTION=1 nếu chủ ý.');
  }
  validate();

  return prisma.$transaction(
    async (tx) => {
      // Tham số vận hành: một dòng, không ghi đè giá trị đã đổi.
      await tx.$executeRaw`INSERT INTO "store_settings" ("id", "updated_at")
        VALUES (1, (${new Date()}::timestamptz AT TIME ZONE 'UTC')) ON CONFLICT ("id") DO NOTHING`;

      const upsertVoucher = (v: {
        code: string;
        name: string;
        kind: 'percent' | 'free_shipping';
        value: number | null;
        minSubtotal: number;
        firstOrderOnly: boolean;
      }) =>
        tx.$executeRaw`INSERT INTO "vouchers"
          ("code", "name", "kind", "value", "min_subtotal", "ends_at", "per_user_limit", "first_order_only", "updated_at")
          VALUES (${v.code}, ${v.name}, ${v.kind}::"voucher_kind", ${v.value}, ${v.minSubtotal},
                  (${ENDS_AT}::timestamptz AT TIME ZONE 'UTC'), 1, ${v.firstOrderOnly},
                  (${new Date()}::timestamptz AT TIME ZONE 'UTC'))
          ON CONFLICT ("code") DO NOTHING`;
      await upsertVoucher({
        code: 'N2FWELCOME15', name: 'Giảm 15% đơn đầu tiên', kind: 'percent', value: 15, minSubtotal: 100000, firstOrderOnly: true,
      });
      await upsertVoucher({
        code: 'N2FFREESHIP', name: 'Miễn phí giao hàng', kind: 'free_shipping', value: null, minSubtotal: 300000, firstOrderOnly: false,
      });

      if (opts.locations !== false) await seedLocations(tx);

      await tx.$executeRaw`INSERT INTO "holidays" ("holiday_date", "name")
        SELECT * FROM unnest(${holidays.holidays.map((h) => h.date)}::date[], ${holidays.holidays.map((h) => h.name)}::text[])
        ON CONFLICT ("holiday_date") DO UPDATE SET "name" = EXCLUDED."name"`;
      const [counts] = await tx.$queryRaw<Array<{ provinces: bigint; settings: bigint; vouchers: bigint; wards: bigint; holidays: bigint }>>(
        Prisma.sql`SELECT (SELECT COUNT(*) FROM "provinces") AS provinces, (SELECT COUNT(*) FROM "store_settings") AS settings,
                          (SELECT COUNT(*) FROM "vouchers") AS vouchers, (SELECT COUNT(*) FROM "wards") AS wards,
                          (SELECT COUNT(*) FROM "holidays") AS holidays`,
      );
      if (Number(counts.provinces) !== EXPECTED_PROVINCES) throw new Error('Sau seed: số tỉnh khác 34.');
      if (Number(counts.settings) !== 1) throw new Error('Sau seed: store_settings phải có đúng 1 dòng.');
      if (Number(counts.vouchers) < 2) throw new Error('Sau seed: thiếu voucher.');
      return {
        provinces: Number(counts.provinces),
        wards: Number(counts.wards),
        holidays: Number(counts.holidays),
        vouchers: Number(counts.vouchers),
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

if (require.main === module) {
  dotenv.config();
  // Seed dùng DIRECT_URL (cổng 5432) nếu có, tránh pgbouncer 6543.
  const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  seedCheckout(prisma)
    .then((r) => {
      console.log(`Seed checkout xong: ${r.provinces} tỉnh/thành, ${r.wards} phường/xã, ${r.holidays} ngày nghỉ, ${r.vouchers} voucher.`);
    })
    .catch((e: unknown) => {
      console.error('Seed checkout lỗi:', e instanceof Error ? e.message : 'unknown');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
