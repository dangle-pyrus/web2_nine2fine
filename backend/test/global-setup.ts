import { execSync } from 'node:child_process';
import { forceTestEnv, TEST_DB_URL } from './guard';

export default function setup(): void {
  forceTestEnv(); // throw nếu môi trường trỏ DB không cục bộ
  // Áp migration lên DB test cục bộ. Ghi đè rõ ràng cả hai URL, không dựa vào .env.
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
  });
}
