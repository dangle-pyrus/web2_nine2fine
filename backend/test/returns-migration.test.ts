import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { assertLocalTestDb, TEST_DB_URL } from './guard';
import { insertRevenueOrder, makeProduct, resetCheckout, resetState } from './helpers';

/** T-RET-01 (AC-RET-05): hai migration của Slice 9 chỉ cộng thêm; ràng buộc DB là lưới cuối của BR-RET. */

const CWD = path.resolve(__dirname, '..');
const ENUM = '20261112000200_returns_enum';
const SCHEMA = '20261112000300_returns_schema';
const sqlOf = (m: string) => readFileSync(path.resolve(CWD, `prisma/migrations/${m}/migration.sql`), 'utf8');
const strip = (sql: string) => sql.replace(/ON (DELETE|UPDATE) (RESTRICT|CASCADE|SET NULL)/g, '').replace(/^--.*$/gm, '');

describe('T-RET-01 migration returns_enum + returns_schema', () => {
  it('chỉ cộng thêm: không DROP / TRUNCATE / RENAME / DELETE / UPDATE / đổi kiểu; CREATE INDEX có IF NOT EXISTS', () => {
    for (const m of [ENUM, SCHEMA]) {
      const s = strip(sqlOf(m));
      expect(s, m).not.toMatch(/\b(TRUNCATE|RENAME|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA|CONSTRAINT))\b/i);
      expect(s, m).not.toMatch(/ALTER\s+COLUMN[^;]*\bTYPE\b/i);
      expect(s, m).not.toMatch(/\bUPDATE\s+"?\w+"?\s+SET\b/i);
      expect(s, m).not.toMatch(/\bINSERT\s+INTO\b/i);
      for (const x of s.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/gi)) expect.fail(`CREATE INDEX thiếu IF NOT EXISTS: ${x[0]}`);
    }
  });

  it('tệp enum chỉ chứa ADD VALUE IF NOT EXISTS cho đúng 6 giá trị; tệp schema không đụng enum', () => {
    const e = strip(sqlOf(ENUM)).trim().split(/;\s*/).filter(Boolean);
    expect(e).toHaveLength(6);
    for (const stmt of e) expect(stmt).toMatch(/^ALTER TYPE "order_event_kind" ADD VALUE IF NOT EXISTS 'return_(requested|approved|rejected|received|refunded|cancelled)'$/);
    expect(strip(sqlOf(SCHEMA))).not.toMatch(/ALTER\s+TYPE/i);
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

  it('enum order_status không đổi; order_event_kind có đủ 6 giá trị mới; ba bảng mới bật RLS; chỉ mục tồn tại', async () => {
    const st = await prisma.$queryRaw<Array<{ v: string }>>`SELECT unnest(enum_range(NULL::order_status))::text AS v`;
    expect(st.map((r) => r.v)).toEqual(['to_pay', 'to_ship', 'to_receive', 'completed', 'cancel_requested', 'cancelled']);
    const ev = await prisma.$queryRaw<Array<{ v: string }>>`SELECT unnest(enum_range(NULL::order_event_kind))::text AS v`;
    expect(ev.map((r) => r.v)).toEqual(expect.arrayContaining(['return_requested', 'return_approved', 'return_rejected', 'return_received', 'return_refunded', 'return_cancelled']));
    const rls = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('order_returns', 'order_return_items', 'return_photos')`;
    expect(rls).toHaveLength(3);
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(${[
        'uq_order_returns_active', 'idx_order_returns_state_requested', 'idx_order_returns_order', 'uq_order_return_items', 'uq_return_photos_key', 'idx_return_photos_return', 'idx_order_events_return',
      ]})`;
    expect(idx).toHaveLength(7);
  });

  describe('dữ liệu và ràng buộc', () => {
    let orderId = '';
    let order2 = '';
    let itemId = '';
    beforeAll(async () => {
      await resetState();
      await resetCheckout();
      const p = await makeProduct({ name: 'Ràng buộc trả', variants: [{ sku: 'RET-MIG-1', qty: 5 }] });
      const v = p.variants[0].id;
      const o1 = await insertRevenueOrder({ deliveredAt: new Date(), lines: [{ variantId: v, quantity: 2, unitPrice: 100_000 }], shippingFee: 30_000 });
      const o2 = await insertRevenueOrder({ deliveredAt: new Date(), lines: [{ variantId: v, quantity: 1, unitPrice: 100_000 }] });
      orderId = o1.id;
      order2 = o2.id;
      itemId = (await prisma.orderItem.findFirstOrThrow({ where: { orderId } })).order_item_id;
    });

    const ret = (o: string, state: string, extra: Record<string, string> = {}) => {
      const cols: Record<string, string> = {
        order_id: `'${o}'`, active_order_id: state === 'cancelled' ? 'NULL' : `'${o}'`, state: `'${state}'`, reason: `'wrong-size'`, fault: `'shop'`,
        requested_via: `'member'`, requested_at: `'2026-11-12 08:00:00'`, goods_amount: '200000', amount: '200000',
        ...(state === 'cancelled' ? { cancelled_at: `'2026-11-12 09:00:00'` } : {}),
        ...(state === 'rejected' ? { rejected_at: `'2026-11-12 09:00:00'`, reject_note: `'Không đủ điều kiện'` } : {}),
        ...extra,
      };
      return `INSERT INTO order_returns (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')})`;
    };
    const rejects = async (q: string) => {
      await expect(prisma.$executeRawUnsafe(q)).rejects.toThrow();
    };

    it('a) tối đa 1 yêu cầu không-cancelled mỗi đơn (23505); cancelled + 1 yêu cầu sống cùng đơn được', async () => {
      await expect(prisma.$executeRawUnsafe(ret(orderId, 'rejected'))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(ret(orderId, 'requested'))).rejects.toThrow(/unique|duplicate|23505/i);
      await rejects(ret(orderId, 'rejected'));
      await prisma.$executeRawUnsafe(`DELETE FROM order_returns WHERE order_id = '${orderId}'`);
      await expect(prisma.$executeRawUnsafe(ret(orderId, 'cancelled'))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(ret(orderId, 'cancelled'))).resolves.toBe(1);
      await expect(prisma.$executeRawUnsafe(ret(orderId, 'requested'))).resolves.toBe(1);
      await rejects(ret(orderId, 'requested', { active_order_id: 'NULL' })); // active NULL chỉ khi cancelled
      await rejects(ret(order2, 'requested', { active_order_id: `'${orderId}'` })); // active phải = order_id
    });

    it('b) refunded còn account_number_enc bị từ chối; requested có enc được (cần bank)', async () => {
      const refunded = (enc: string) =>
        ret(order2, 'refunded', {
          approved_at: `'2026-11-12 09:00:00'`, received_at: `'2026-11-12 10:00:00'`, refunded_at: `'2026-11-12 11:00:00'`, refund_reference: `'CK-0001'`, amount_final: 'true',
          bank_name: `'VCB'`, account_last4: `'7890'`, account_name: `'NGUYEN VAN A'`, account_number_enc: enc,
        });
      await rejects(refunded(`'abc'`));
      await expect(prisma.$executeRawUnsafe(refunded('NULL'))).resolves.toBe(1);
      await prisma.$executeRawUnsafe(`DELETE FROM order_returns WHERE order_id = '${order2}'`);
      await rejects(ret(order2, 'requested', { account_number_enc: `'abc'` })); // enc không có bank
      await expect(prisma.$executeRawUnsafe(ret(order2, 'requested', { bank_name: `'VCB'`, account_last4: `'7890'`, account_name: `'A'`, account_number_enc: `'abc'` }))).resolves.toBe(1);
      await rejects(ret(order2, 'requested', { bank_name: `'VCB'` })); // bank thiếu last4 / tên
      await prisma.$executeRawUnsafe(`DELETE FROM order_returns WHERE order_id = '${order2}'`);
    });

    it('c) amount lệch công thức, fault lệch lý do, rejected thiếu ghi chú, amount_final sai trạng thái bị từ chối', async () => {
      await rejects(ret(order2, 'requested', { amount: '199999' }));
      await rejects(ret(order2, 'requested', { shipping_refund: '30000' })); // 200000 + 30000 - 0 <> 200000
      await expect(prisma.$executeRawUnsafe(ret(order2, 'requested', { shipping_refund: '30000', amount: '230000' }))).resolves.toBe(1);
      await prisma.$executeRawUnsafe(`DELETE FROM order_returns WHERE order_id = '${order2}'`);
      await rejects(ret(order2, 'requested', { fault: `'customer'` }));
      await rejects(ret(order2, 'requested', { reason: `'other'` }));
      await rejects(ret(order2, 'rejected', { reject_note: `'ngắn'` })); // < 5 ký tự
      await rejects(ret(order2, 'requested', { amount_final: 'true' }));
      await rejects(ret(order2, 'received', { approved_at: `'2026-11-12 09:00:00'`, received_at: `'2026-11-12 10:00:00'` })); // received thiếu amount_final
      await rejects(ret(order2, 'approved')); // thiếu approved_at
      await rejects(ret(order2, 'requested', { requested_via: `'bot'` }));
    });

    it('d) disposition khi accepted_quantity = 0 bị từ chối; số lượng ngoài khoảng bị từ chối', async () => {
      const [r] = await prisma.$queryRaw<Array<{ return_id: string }>>`SELECT return_id FROM order_returns WHERE order_id = ${orderId}::uuid AND state = 'requested'`;
      const item = (qty: number, accepted: string, disp: string, goods = 100000) =>
        `INSERT INTO order_return_items (return_id, order_item_id, quantity, accepted_quantity, disposition, goods_amount) VALUES ('${r.return_id}', '${itemId}', ${qty}, ${accepted}, ${disp}, ${goods})`;
      await rejects(item(1, '0', `'restock'`)); // disposition khi đạt = 0
      await rejects(item(1, '2', 'NULL')); // đạt > yêu cầu
      await rejects(item(0, 'NULL', 'NULL', 0)); // quantity 0
      await rejects(item(1, 'NULL', 'NULL', -1)); // tiền âm
      await expect(prisma.$executeRawUnsafe(item(1, '1', `'restock'`))).resolves.toBe(1);
      await rejects(item(1, 'NULL', 'NULL')); // unique (return, order_item)
    });

    it('e) storage_key sai mẫu bị từ chối (kể cả khoá công khai up-...); xoá đơn kéo theo yêu cầu, dòng, ảnh (CASCADE)', async () => {
      const photo = (key: string, extra = '') =>
        `INSERT INTO return_photos (storage_key, storage, content_type, byte_size, width, height${extra ? ', return_id' : ''}) VALUES ('${key}', 'local', 'image/jpeg', 100, 400, 400${extra ? `, '${extra}'` : ''})`;
      await rejects(photo(`up-${'a'.repeat(32)}.jpg`));
      await rejects(photo(`rp-${'a'.repeat(31)}.jpg`));
      await rejects(photo(`rp-${'A'.repeat(32)}.jpg`));
      await rejects(photo(`rp-${'a'.repeat(32)}.gif`));
      await rejects(`INSERT INTO return_photos (storage_key, storage, content_type, byte_size, width, height) VALUES ('rp-${'b'.repeat(32)}.jpg', 'local', 'image/jpeg', 5242881, 400, 400)`);
      const [r] = await prisma.$queryRaw<Array<{ return_id: string }>>`SELECT return_id FROM order_returns WHERE order_id = ${orderId}::uuid AND state = 'requested'`;
      await expect(prisma.$executeRawUnsafe(photo(`rp-${'c'.repeat(32)}.jpg`, r.return_id))).resolves.toBe(1);
      await rejects(photo(`rp-${'c'.repeat(32)}.jpg`)); // trùng khoá
      await prisma.$executeRawUnsafe(`DELETE FROM orders WHERE order_id = '${orderId}'`);
      expect(await prisma.orderReturn.count({ where: { orderId } })).toBe(0);
      expect(await prisma.orderReturnItem.count({ where: { returnId: r.return_id } })).toBe(0);
      expect(await prisma.returnPhoto.count({ where: { returnId: r.return_id } })).toBe(0);
    });
  });
});
