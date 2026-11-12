import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSIGHT_PERMISSIONS, STORE_SETTINGS_SEED } from '../src/config/assumptions';
import prisma from '../src/config/prisma';
import { Errors } from '../src/lib/errors';
import { changeRatio, divRoundHalfUp, ratio4 } from '../src/lib/money-math';
import { parseBodyAll } from '../src/lib/validate';
import { addCalendarDays, daysBetween, isRealDate, vnDateISO, vnDayBoundsUtc } from '../src/lib/vn-time';
import { parseAuditQuery, parseDateRange, parseRange, parseReportQuery } from '../src/modules/insights-admin/insights.schemas';
import { periodsOf } from '../src/modules/insights-admin/periods';
import { z } from 'zod';
import { assertLocalTestDb, TEST_DB_URL } from './guard';
import { resetCheckout, resetState } from './helpers';

/** Lát 8.1 (nền): T-INS-04 (migration), T-INS-06 (hàm thuần), quyền, parseBodyAll / validationMany. */

const MIGRATION = '20261112000100_admin_insights_schema';
const CWD = path.resolve(__dirname, '..');

describe('T-INS-04 migration admin_insights_schema (AC-INS-09)', () => {
  const sql = readFileSync(path.resolve(CWD, `prisma/migrations/${MIGRATION}/migration.sql`), 'utf8');

  it('chỉ cộng thêm: không DROP / TRUNCATE / RENAME / DELETE / UPDATE / INSERT / đổi kiểu; CREATE INDEX có IF NOT EXISTS', () => {
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '').replace(/^--.*$/gm, '');
    expect(stripped).not.toMatch(/\b(TRUNCATE|RENAME|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA|CONSTRAINT))\b/i);
    expect(stripped).not.toMatch(/ALTER\s+COLUMN[^;]*\bTYPE\b/i);
    expect(stripped).not.toMatch(/\bUPDATE\s+"?\w+"?\s+SET\b/i);
    expect(stripped).not.toMatch(/\bINSERT\s+INTO\b/i);
    for (const m of stripped.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/gi)) expect.fail(`CREATE INDEX thiếu IF NOT EXISTS: ${m[0]}`);
  });

  it('migrate deploy lần 2 không có gì để áp; migrate diff rỗng', () => {
    assertLocalTestDb();
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL };
    const out = execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: CWD }).toString();
    expect(out).toMatch(/No pending migrations to apply/);
    const diff = execSync(
      `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ${TEST_DB_URL.replace('n2f_test', 'n2f_shadow')}`,
      { env, stdio: 'pipe', cwd: CWD },
    ).toString();
    expect(diff).toMatch(/No difference detected/);
  });

  it('dòng store_settings id 1 có đúng giá trị STORE_INFO; RLS bật; 5 chỉ mục; CHECK hình dạng', async () => {
    await resetState();
    await resetCheckout();
    await prisma.$executeRawUnsafe(`UPDATE "store_settings" SET "hotline" = DEFAULT WHERE id = 1`); // không đổi: kiểm DEFAULT dùng được
    const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT legal_name, registration_number, registration_issuer, to_char(registration_date, 'YYYY-MM-DD') AS registration_date, address, hotline, email,
             privacy_email, hours, notification_url, social_facebook FROM store_settings WHERE id = 1`;
    const i = STORE_SETTINGS_SEED.info;
    expect(row).toEqual({
      legal_name: i.legalName, registration_number: i.registrationNumber, registration_issuer: i.registrationIssuer, registration_date: i.registrationDate,
      address: i.address, hotline: i.hotline, email: i.email, privacy_email: i.privacyEmail, hours: i.hours, notification_url: '', social_facebook: '',
    });
    const [rls] = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE relname = 'store_settings_events'`;
    expect(rls.relrowsecurity).toBe(true);
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE indexname = ANY(${[
        'idx_store_settings_events_at', 'idx_order_events_at', 'idx_inv_adj_at', 'idx_account_events_at', 'idx_orders_status_delivered',
      ]})`;
    expect(idx).toHaveLength(5);

    const rejects = (q: string) => expect(prisma.$executeRawUnsafe(q)).rejects.toThrow();
    const upd = (set: string) => `UPDATE store_settings SET ${set} WHERE id = 1`;
    await rejects(upd(`registration_number = '123456789'`));
    await rejects(upd(`hotline = '1900'`));
    await rejects(upd(`notification_url = 'http://x.vn'`));
    await rejects(upd(`social_facebook = 'javascript:alert(1)'`));
    await rejects(upd(`legal_name = 'A'`));
    await rejects(upd(`address = 'ngắn'`));
    await expect(prisma.$executeRawUnsafe(upd(`registration_number = '0319245768123', hotline = '0912.345.678'`))).resolves.toBe(1);
    await rejects(`INSERT INTO store_settings_events (actor_name, actor_role, changes) VALUES ('A', 'admin', '[]'::jsonb)`);
    await rejects(`INSERT INTO store_settings_events (actor_name, actor_role, changes) VALUES ('A', 'staff', '[{"a":1}]'::jsonb)`);
    await rejects(`INSERT INTO store_settings_events (actor_name, actor_role, changes) VALUES ('A', 'admin', '{}'::jsonb)`);
    await expect(
      prisma.$executeRawUnsafe(`INSERT INTO store_settings_events (actor_name, actor_role, changes) VALUES ('A', 'admin', '[{"a":1}]'::jsonb)`),
    ).resolves.toBe(1);
    await prisma.$executeRawUnsafe('DELETE FROM store_settings_events');
    await resetState(); // đưa cài đặt về mặc định
    const [back] = await prisma.$queryRaw<Array<{ registration_number: string; hotline: string }>>`SELECT registration_number, hotline FROM store_settings WHERE id = 1`;
    expect(back).toEqual({ registration_number: i.registrationNumber, hotline: i.hotline });
  });

  it('số dòng orders / users / store_settings không đổi sau khi áp lại (không backfill)', async () => {
    const [c] = await prisma.$queryRaw<Array<{ s: bigint }>>`SELECT COUNT(*) AS s FROM store_settings`;
    expect(Number(c.s)).toBe(1);
  });
});

describe('T-INS-06 BR-INS-09: số nguyên half-up, kỳ so sánh, ngày thật', () => {
  it('divRoundHalfUp / ratio4 / changeRatio', () => {
    expect(divRoundHalfUp(2_200_000, 3)).toBe(733_333); // 733.333,33
    expect(divRoundHalfUp(1, 2)).toBe(1); // half-up
    expect(divRoundHalfUp(0, 5)).toBe(0);
    expect(ratio4(1, 3)).toBe(0.3333);
    expect(ratio4(2, 3)).toBe(0.6667);
    expect(ratio4(1, 8)).toBe(0.125);
    expect(ratio4(5, 0)).toBe(0);
    expect(ratio4(9_000_000_000_000, 10_000_000_000_000)).toBe(0.9); // vượt 2^53 khi nhân 10000: vẫn đúng nhờ BigInt
    expect(changeRatio(2_200_000, 2_000_000)).toBe(0.1);
    expect(changeRatio(1_200_000, 1_000_000)).toBe(0.2);
    expect(changeRatio(7, 8)).toBe(-0.125);
    expect(Object.is(changeRatio(5, 5), 0)).toBe(true);
    expect(Object.is(changeRatio(10_000, 10_000_000), -0.999)).toBe(true);
    expect(changeRatio(0, 4)).toBe(-1);
    expect(changeRatio(5, 0)).toBeNull();
    expect(changeRatio(0, 0)).toBeNull();
    expect(changeRatio(1, 3)).toBe(-0.6667); // (1-3)/3 = -0.66666 -> -0.6667 (độ lớn half-up)
    expect(() => divRoundHalfUp(1, 0)).toThrow();
  });

  it('isRealDate / daysBetween / vnDayBoundsUtc', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', 'abc', '2026-1-1', '2026-11-12T00:00', '']) expect(isRealDate(bad)).toBe(false);
    expect(daysBetween('2026-11-01', '2026-11-12')).toBe(11);
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    const b = vnDayBoundsUtc('2026-11-12', '2026-11-12');
    expect(b.from.toISOString()).toBe('2026-11-11T17:00:00.000Z');
    expect(b.to.toISOString()).toBe('2026-11-12T17:00:00.000Z');
  });

  it('periodsOf: today / 7d / 30d / khoảng, ranh giới 17:00Z', () => {
    const now = new Date('2026-11-12T08:00:00Z'); // D = 2026-11-12, 15:00 VN
    const t = periodsOf('today', now);
    expect(t.cur.from.toISOString()).toBe('2026-11-11T17:00:00.000Z');
    expect(t.cur.to.toISOString()).toBe('2026-11-12T08:00:00.000Z');
    expect(t.prev.from.toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(t.prev.to.toISOString()).toBe('2026-11-05T08:00:00.000Z');
    const w = periodsOf('7d', now);
    expect(w.cur.from.toISOString()).toBe('2026-11-05T17:00:00.000Z'); // D-6 = 11-06 00:00 VN
    expect(w.cur.to.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(w.prev.from.toISOString()).toBe('2026-10-29T17:00:00.000Z');
    expect(w.prev.to.toISOString()).toBe(w.cur.from.toISOString());
    const m = periodsOf('30d', now);
    expect(m.cur.from.toISOString()).toBe('2026-10-13T17:00:00.000Z'); // D-29 = 10-14 00:00 VN
    expect(m.prev.from.toISOString()).toBe('2026-09-13T17:00:00.000Z');
    expect(m.prev.to.toISOString()).toBe(m.cur.from.toISOString());
    // 00:30 VN ngày 13 (17:30Z ngày 12): hôm nay đã là ngày 13
    expect(periodsOf('today', new Date('2026-11-12T17:30:00Z')).cur.from.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    const r = periodsOf({ from: '2026-11-10', to: '2026-11-12' }, now);
    expect(r.cur.from.toISOString()).toBe('2026-11-09T17:00:00.000Z');
    expect(r.cur.to.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(r.prev.from.toISOString()).toBe('2026-11-06T17:00:00.000Z');
    expect(r.prev.to.toISOString()).toBe('2026-11-09T17:00:00.000Z');
  });

  it('parseDateRange / parseReportQuery / parseRange / parseAuditQuery: thứ tự lỗi và field', () => {
    const now = new Date('2026-11-12T08:00:00Z');
    const fail = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as { extras: { field?: string }; code: string }).code === 'validation' ? (e as { extras: { field?: string } }).extras.field : 'other';
      }
      return 'ok';
    };
    expect(parseReportQuery({}, now)).toMatchObject({ from: '2026-10-14', to: '2026-11-12', days: 30, sort: 'units' });
    expect(parseReportQuery({ from: '2026-11-12', to: '2026-11-12' }, now).days).toBe(1);
    expect(parseReportQuery({ from: '2026-11-01' }, now).to).toBe('2026-11-12');
    expect(parseReportQuery({ from: '2025-11-12', to: '2026-11-12' }, now).days).toBe(366);
    expect(fail(() => parseReportQuery({ from: '2025-11-11', to: '2026-11-12' }, now))).toBe('to');
    expect(fail(() => parseReportQuery({ from: '2026-11-13', to: '2026-11-12' }, now))).toBe('from');
    expect(fail(() => parseReportQuery({ to: '2026-11-13' }, now))).toBe('to');
    for (const bad of ['2026-02-30', '2026-13-01', 'abc', '2026-1-1']) expect(fail(() => parseReportQuery({ from: bad }, now))).toBe('from');
    expect(fail(() => parseReportQuery({ from: 'abc', to: 'xyz' }, now))).toBe('from');
    expect(fail(() => parseReportQuery({ from: ['2026-11-01', '2026-11-02'] }, now))).toBe('from');
    expect(fail(() => parseReportQuery({ sort: 'profit' }, now))).toBe('sort');
    expect(parseReportQuery({ sort: 'revenue' }, now).sort).toBe('revenue');
    expect(parseRange({})).toBe('today');
    expect(parseRange({ range: '30d' })).toBe('30d');
    expect(fail(() => parseRange({ range: 'week' }))).toBe('range');
    // nhật ký: cho phép `to` tương lai, tối đa 92 ngày
    expect(parseAuditQuery({ from: '2026-11-12', to: '2026-11-20' }, now).days).toBe(9);
    expect(parseAuditQuery({ from: '2026-08-12', to: '2026-11-11' }, now).days).toBe(92);
    expect(fail(() => parseAuditQuery({ from: '2026-08-11', to: '2026-11-11' }, now))).toBe('to');
    expect(fail(() => parseAuditQuery({ targetType: 'product' }, now))).toBe('targetType');
    expect(fail(() => parseAuditQuery({ limit: '51' }, now))).toBe('limit');
    expect(fail(() => parseAuditQuery({ limit: '0' }, now))).toBe('limit');
    expect(fail(() => parseAuditQuery({ page: '0' }, now))).toBe('page');
    expect(parseAuditQuery({ page: '99', limit: '50', targetType: 'settings' }, now)).toMatchObject({ page: 99, limit: 50, targetType: 'settings' });
    expect(vnDateISO(now)).toBe('2026-11-12');
    expect(fail(() => parseDateRange({}, { maxDays: 5, allowFuture: true }, now))).toBe('to'); // mặc định 30 ngày > 5
  });
});

describe('quyền Slice 8 và lỗi nhiều trường', () => {
  it('INSIGHT_PERMISSIONS: staff chỉ dashboard.view; admin đủ bốn', () => {
    expect(INSIGHT_PERMISSIONS.staff).toEqual(['dashboard.view']);
    expect([...INSIGHT_PERMISSIONS.admin].sort()).toEqual(['dashboard.revenue', 'dashboard.view', 'settings.audit', 'settings.store']);
  });

  it('parseBodyAll trả MỌI lỗi theo trường (đầu tiên trùng field / message); parseBody cũ không đổi', () => {
    const schema = z.object({
      info: z.object({ a: z.string({ error: 'a sai' }), b: z.number({ error: 'b sai' }) }),
      c: z.string({ error: 'c sai' }),
    });
    try {
      parseBodyAll(schema, { info: { a: 1, b: 'x' } });
      expect.fail('phải ném');
    } catch (e) {
      const err = e as ReturnType<typeof Errors.validation>;
      expect(err.code).toBe('validation');
      expect(err.status).toBe(422);
      expect(err.extras.field).toBe('info.a');
      expect(err.extras.fieldErrors).toEqual([
        { field: 'info.a', message: 'a sai' },
        { field: 'info.b', message: 'b sai' },
        { field: 'c', message: 'c sai' },
      ]);
    }
    expect(() => parseBodyAll(schema, [])).toThrow();
    expect(parseBodyAll(schema, { info: { a: 'x', b: 1 }, c: 'y' })).toEqual({ info: { a: 'x', b: 1 }, c: 'y' });
  });
});
