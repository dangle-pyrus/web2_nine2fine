/**
 * Chạy NGOÀI vitest (tiến trình con) với DATABASE_URL trỏ qua proxy TCP có trễ.
 * Đo trung vị thời gian POST /auth/codes cho email có / không có tài khoản (AC-AUTH-07, BR-AUTH-03).
 * In JSON ra stdout. Chỉ chạy khi test/guard xác nhận URL gốc là n2f_test cục bộ (do test cha truyền vào).
 */
import { forceTestEnvForChild } from './guard-child';

forceTestEnvForChild();

async function main(): Promise<void> {
  const request = (await import('supertest')).default;
  const { createApp } = await import('../src/app');
  const { default: prisma } = await import('../src/config/prisma');
  const { flushMail, setMailTransport } = await import('../src/mail/mailer');
  const { hashPassword } = await import('../src/lib/crypto');
  setMailTransport({ async send() {} });
  const app = createApp();
  const runs = Number(process.env.LAT_RUNS ?? 6);

  const existing = 'lat-existing@example.com';
  await prisma.user.deleteMany({ where: { email: existing } });
  await prisma.user.create({
    data: { email: existing, passwordHash: await hashPassword('Nine2fine1'), firstName: 'A', lastName: 'B', terms_accepted_at: new Date() },
  });
  const missing = 'lat-missing@example.com';

  const result: Record<string, { existing: number; missing: number }> = {};
  for (const purpose of ['login', 'register', 'reset-password']) {
    const med: Record<string, number> = {};
    for (const [label, email] of [['existing', existing], ['missing', missing]] as const) {
      const ts: number[] = [];
      for (let i = 0; i < runs; i++) {
        await flushMail();
        await prisma.authRateLimit.deleteMany({});
        await prisma.authActionToken.deleteMany({ where: { email } });
        const t0 = performance.now();
        const r = await request(app)
          .post('/api/auth/codes')
          .set('Origin', 'http://localhost:4200')
          .set('X-Requested-With', 'n2f')
          .set('X-Forwarded-For', `10.9.${i}.1`)
          .send({ email, purpose });
        ts.push(performance.now() - t0);
        if (r.status !== 200) throw new Error(`unexpected status ${r.status}`);
      }
      ts.sort((a, b) => a - b);
      med[label] = ts[Math.floor(ts.length / 2)];
    }
    result[purpose] = { existing: med.existing, missing: med.missing };
  }
  await flushMail();
  await prisma.user.deleteMany({ where: { email: existing } });
  await prisma.$disconnect();
  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`latency-child failed: ${e instanceof Error ? e.message.slice(0, 600) : String(e)}\n`);
    process.exit(1);
  },
);
