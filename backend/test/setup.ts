import { afterAll } from 'vitest';
import { forceTestEnv } from './guard';

// Chạy trước mỗi file test, trước mọi import của code ứng dụng.
forceTestEnv();

afterAll(async () => {
  const { default: prisma } = await import('../src/config/prisma');
  await prisma.$disconnect();
});
