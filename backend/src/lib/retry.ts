/** Lỗi giao dịch có thể thử lại: xung đột ghi Prisma (P2034), deadlock (40P01), serialization failure (40001). */
export function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string } | null;
  return e?.code === 'P2034' || e?.meta?.code === '40P01' || e?.meta?.code === '40001' || /\b40P01\b/.test(String(e?.message ?? ''));
}
