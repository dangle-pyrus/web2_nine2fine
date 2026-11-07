import { PrismaClient } from '@prisma/client';
import { getConfig } from './env';

const isTest = process.env.NODE_ENV === 'test';

// Một PrismaClient duy nhất. URL lấy từ cấu hình đã kiểm (không phụ thuộc vào việc Prisma tự đọc .env).
// Ở test, truy vấn được phát qua sự kiện để đếm (T-CAT-52).
const prisma = new PrismaClient({
  datasourceUrl: getConfig().databaseUrl,
  log: isTest
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : ['warn', 'error'],
});

/** Chỉ có giá trị khi NODE_ENV=test: các câu SQL đã chạy (bỏ BEGIN/COMMIT). */
export const queryLog: string[] = [];
if (isTest) {
  (prisma as unknown as { $on: (e: 'query', cb: (q: { query: string }) => void) => void }).$on('query', (q) => {
    if (!/^(BEGIN|COMMIT|ROLLBACK)/i.test(q.query)) queryLog.push(q.query);
  });
}

export default prisma;
