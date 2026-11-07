import { z } from 'zod';

/**
 * Cấu hình tập trung, kiểm bằng zod. KHÔNG nạp dotenv ở đây (server.ts / seed.ts làm việc đó).
 * Khi thiếu / sai: ném ConfigError chỉ chứa TÊN biến, không bao giờ chứa giá trị.
 */

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const boolStr = z.preprocess(
  (v) => (typeof v === 'string' ? ['true', '1', 'yes'].includes(v.trim().toLowerCase()) : v),
  z.boolean(),
);

const schema = z
  .object({
    NODE_ENV: z.preprocess(emptyToUndefined, z.enum(['development', 'test', 'production']).default('development')),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: opt(z.string()),
    TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().default('false')),
    CORS_ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().default('http://localhost:4200')),
    COOKIE_SAMESITE: z.preprocess(emptyToUndefined, z.enum(['lax', 'strict', 'none']).default('lax')),
    OTP_HMAC_SECRET: z.string().min(32),
    MAIL_MODE: z.preprocess(emptyToUndefined, z.enum(['smtp', 'dev-outbox']).default('dev-outbox')),
    MAIL_OUTBOX_DIR: opt(z.string()),
    SMTP_HOST: opt(z.string()),
    SMTP_PORT: opt(z.coerce.number().int().min(1).max(65535)),
    SMTP_SECURE: z.preprocess(emptyToUndefined, boolStr.default(true)),
    SMTP_USER: opt(z.string()),
    SMTP_PASS: opt(z.string()),
    MAIL_FROM_NAME: z.preprocess(emptyToUndefined, z.string().default('nine2fine')),
    MAIL_FROM_ADDRESS: opt(z.string()),
    SUPPORT_EMAIL: z.preprocess(emptyToUndefined, z.string().default('phthang0872@gmail.com')),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_MODE === 'smtp') {
      for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM_ADDRESS'] as const) {
        if (env[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: 'required when MAIL_MODE=smtp' });
      }
    }
    if (env.COOKIE_SAMESITE === 'none' && env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'none requires NODE_ENV=production (Secure)' });
    }
  });

export class ConfigError extends Error {
  constructor(public readonly variables: string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  trustProxy: boolean | number;
  corsAllowedOrigins: string[];
  cookieSameSite: 'lax' | 'strict' | 'none';
  otpHmacSecret: string;
  mail: {
    mode: 'smtp' | 'dev-outbox';
    outboxDir?: string;
    smtp?: { host: string; port: number; secure: boolean; user: string; pass: string };
    fromName: string;
    fromAddress: string;
  };
  supportEmail: string;
}

function parseTrustProxy(v: string): boolean | number {
  const s = v.trim().toLowerCase();
  if (s === 'false' || s === '0' || s === '') return false;
  if (s === 'true') return 1;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : false;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'env')))];
    throw new ConfigError(names);
  }
  const e = parsed.data;
  const smtp =
    e.MAIL_MODE === 'smtp'
      ? { host: e.SMTP_HOST!, port: e.SMTP_PORT!, secure: e.SMTP_SECURE, user: e.SMTP_USER!, pass: e.SMTP_PASS! }
      : undefined;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    corsAllowedOrigins: e.CORS_ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    cookieSameSite: e.COOKIE_SAMESITE,
    otpHmacSecret: e.OTP_HMAC_SECRET,
    mail: {
      mode: e.MAIL_MODE,
      outboxDir: e.MAIL_OUTBOX_DIR,
      smtp,
      fromName: e.MAIL_FROM_NAME,
      fromAddress: e.MAIL_FROM_ADDRESS ?? 'no-reply@nine2fine.test',
    },
    supportEmail: e.SUPPORT_EMAIL,
  };
}

let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
/** Chỉ dùng trong test. */
export function resetConfigCache(): void {
  cached = undefined;
}
