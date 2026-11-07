import { Prisma } from '@prisma/client';

/** Tham số thời gian cho cột `timestamp(6)` (UTC), không dùng now() của CSDL (plan mục 4, R3). */
export const ts = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/** Client dùng được cho cả PrismaClient lẫn giao dịch tương tác. */
export type Db = Prisma.TransactionClient;
