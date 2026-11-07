/**
 * CHỐT CHẶN AN TOÀN: test chỉ được chạy trên Postgres cục bộ.
 * Mọi thao tác xoá / dọn dữ liệu trong test phải gọi assertLocalTestDb() trước.
 */
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
    MAIL_FROM_NAME: 'nine2fine',
  });
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM_ADDRESS', 'MAIL_OUTBOX_DIR']) {
    delete process.env[k];
  }
  assertLocalTestDb();
}
