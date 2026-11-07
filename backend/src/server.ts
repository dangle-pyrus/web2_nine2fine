import dotenv from 'dotenv';

// 1) Nạp .env TRƯỚC mọi import khác dùng cấu hình. 2) Kiểm cấu hình; thiếu -> thoát, chỉ in TÊN biến.
dotenv.config();

import { ConfigError, loadConfig } from './config/env';

async function main(): Promise<void> {
  let port: number;
  try {
    port = loadConfig().port;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Cấu hình không hợp lệ hoặc thiếu biến môi trường: ${err.variables.join(', ')}`);
    } else {
      console.error('Không thể đọc cấu hình.');
    }
    process.exit(1);
  }

  const { createApp } = await import('./app');
  const { purgeStaleBuckets } = await import('./modules/auth/rate-limit.service');
  const { logger } = await import('./lib/logger');
  const app = createApp();

  const server = app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Không thể mở cổng ${port}: ${err.code ?? err.name}`);
    process.exit(1);
  });

  // Dọn bộ đếm đã hết hiệu lực mỗi ngày (không đụng bảng token / phiên).
  const timer = setInterval(
    () => {
      purgeStaleBuckets(24 * 3600 * 1000).catch(() => logger.warn('purge-rate-limits-failed'));
    },
    24 * 3600 * 1000,
  );
  timer.unref();
}

void main();
