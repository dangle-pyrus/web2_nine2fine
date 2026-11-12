/**
 * CHỐT CHẶN AN TOÀN: test chỉ được chạy trên Postgres cục bộ.
 * Mọi thao tác xoá / dọn dữ liệu trong test phải gọi assertLocalTestDb() trước.
 */
import os from 'node:os';
import path from 'node:path';

export const TEST_DB_URL = 'postgresql://postgres@127.0.0.1:54329/n2f_test';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

/** Ném lỗi (không in giá trị URL) nếu DATABASE_URL hoặc DIRECT_URL không trỏ về máy cục bộ / DB n2f_test. */
export function assertLocalTestDb(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const value = env[name];
    const host = value ? hostOf(value) : null;
    if (!value || !host || !LOCAL_HOSTS.has(host)) {
      throw new Error(`REFUSING TO RUN TESTS: ${name} must point to 127.0.0.1/localhost (test database only).`);
    }
    if (!/\/n2f_test(\?|$)/.test(value)) {
      throw new Error(`REFUSING TO RUN TESTS: ${name} must target the n2f_test database.`);
    }
  }
}

/**
 * Ép môi trường test. Nếu môi trường ngoài (shell / .env) đang trỏ DATABASE_URL / DIRECT_URL
 * tới host không cục bộ thì dừng ngay thay vì âm thầm ghi đè.
 */
export function forceTestEnv(): void {
  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const ambient = process.env[name];
    const host = ambient ? hostOf(ambient) : null;
    if (ambient && (!host || !LOCAL_HOSTS.has(host))) {
      throw new Error(`REFUSING TO RUN TESTS: ambient ${name} is not a local host.`);
    }
  }
  Object.assign(process.env, {
    DATABASE_URL: TEST_DB_URL,
    DIRECT_URL: TEST_DB_URL,
    NODE_ENV: 'test',
    OTP_HMAC_SECRET: 'test-only-otp-hmac-secret-0123456789abcdef',
    MAIL_MODE: 'dev-outbox',
    CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
    COOKIE_SAMESITE: 'lax',
    TRUST_PROXY: '1',
    SUPPORT_EMAIL: 'support@example.test',
    MEDIA_STORAGE: 'local',
    MEDIA_LOCAL_DIR: path.join(os.tmpdir(), `n2f-media-test-${process.pid}`),
    MAIL_FROM_NAME: 'nine2fine',
    RETURN_PHOTO_LOCAL_DIR: path.join(os.tmpdir(), `n2f-return-photos-test-${process.pid}`),
    // Khoá cố định CHỈ cho test (32 byte base64); không dùng ở production.
    RETURN_ACCOUNT_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM_ADDRESS', 'MAIL_OUTBOX_DIR', 'APP_BASE_URL', 'BANK_NAME', 'BANK_ACCOUNT_NUMBER', 'BANK_ACCOUNT_NAME', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_RETURN_BUCKET']) {
    delete process.env[k];
  }
  assertLocalTestDb();
}
