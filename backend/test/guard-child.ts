import { assertLocalTestDb, TEST_DB_URL } from './guard';

/**
 * Tiến trình con đo độ trễ: DATABASE_URL trỏ proxy 127.0.0.1:<port>/n2f_test (do test cha truyền).
 * Chốt chặn vẫn áp dụng: host phải cục bộ và DB phải là n2f_test; proxy phía cha chỉ chuyển tiếp tới TEST_DB_URL.
 */
export function forceTestEnvForChild(): void {
  const url = process.env.LAT_PROXY_URL ?? '';
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  assertLocalTestDb();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    OTP_HMAC_SECRET: 'test-only-otp-hmac-secret-0123456789abcdef',
    MAIL_MODE: 'dev-outbox',
    CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
    TRUST_PROXY: '1',
  });
  void TEST_DB_URL;
}
