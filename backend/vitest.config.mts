import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Lưu ý M2: trên Windows worker có thể chết ngẫu nhiên (0xC0000409); đã thử threads/isolate/engine binary/no-maglev, chưa khắc phục.
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Mọi test dùng chung một DB thật nên chạy tuần tự.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
