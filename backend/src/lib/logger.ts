/** Log tối giản. Quy tắc: không bao giờ truyền mã OTP, mật khẩu, token; email phải qua maskEmail. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

type Meta = Record<string, string | number | boolean | undefined>;

function write(level: 'info' | 'warn' | 'error', msg: string, meta?: Meta): void {
  if (process.env.NODE_ENV === 'test' && process.env.LOG_IN_TEST !== '1') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const logger = {
  info: (msg: string, meta?: Meta) => write('info', msg, meta),
  warn: (msg: string, meta?: Meta) => write('warn', msg, meta),
  error: (msg: string, meta?: Meta) => write('error', msg, meta),
};
