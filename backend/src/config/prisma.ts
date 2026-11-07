import { PrismaClient } from '@prisma/client';
import { getConfig } from './env';

// Một PrismaClient duy nhất. URL lấy từ cấu hình đã kiểm (không phụ thuộc vào việc Prisma tự đọc .env).
const prisma = new PrismaClient({
  datasourceUrl: getConfig().databaseUrl,
  log: ['warn', 'error'],
});

export default prisma;
