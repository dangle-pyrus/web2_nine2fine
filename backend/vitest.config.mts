import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Mọi test dùng chung một DB thật nên chạy tuần tự.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
