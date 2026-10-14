import { PrismaClient } from '@prisma/client';

// Khởi tạo một thể hiện (instance) duy nhất của PrismaClient để tái sử dụng xuyên suốt ứng dụng
// Tránh việc mở quá nhiều connection pool tới database (Supabase PostgreSQL)
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export default prisma;
