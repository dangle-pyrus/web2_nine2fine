import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import prisma from '../src/config/prisma';
import { assertLocalTestDb } from './guard';

const NEW_TABLES = [
  'store_settings', 'holidays', 'provinces', 'wards', 'carts', 'cart_lines', 'vouchers', 'voucher_redemptions',
  'orders', 'order_items', 'order_events', 'idempotency_keys', 'order_access_grants',
];

// T-MIG-01 (phần cấu trúc) và T-MIG-02 (CHECK): AC-CHK-28, AC-CHK-41.
describe('migration cart_checkout_schema', () => {
  it('chỉ cộng thêm: không DROP / TRUNCATE / DELETE / RENAME trong file migration', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../prisma/migrations/20261107000500_cart_checkout_schema/migration.sql'),
      'utf8',
    );
    // Bỏ mệnh đề FK `ON DELETE ...` (không phải câu lệnh xoá dữ liệu).
    const stripped = sql.replace(/ON DELETE (RESTRICT|CASCADE|SET NULL)/g, '');
    expect(stripped).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
  });

  it('mọi bảng mới bật RLS', async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${NEW_TABLES}) AND relkind = 'r'`;
    expect(rows.map((r) => r.relname).sort()).toEqual([...NEW_TABLES].sort());
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  describe('CHECK', () => {
    let variantId: string;
    beforeAll(async () => {
      assertLocalTestDb();
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "idempotency_keys","order_access_grants","order_events","voucher_redemptions","order_items","orders","cart_lines","carts","vouchers","wards","provinces","store_settings","product_variants","products","size_charts","categories","users" RESTART IDENTITY CASCADE',
      );
      await prisma.$executeRawUnsafe(`INSERT INTO provinces (province_code,name,name_search) VALUES ('01','Hà Nội','ha noi')`);
      await prisma.$executeRawUnsafe(`INSERT INTO wards (ward_code,province_code,name,name_search) VALUES ('0001','01','Phường A','phuong a')`);
      const cat = await prisma.category.create({ data: { slug: 'tops', name: 'Tops' } });
      const p = await prisma.product.create({
        data: {
          categoryId: cat.category_id, slug: 'mig-test', name: 'Mig', typeLabel: 'x', price: 100000, coverMediaId: 'a',
          galleryMediaIds: ['a'], moments: ['work'], genders: ['nam'], salesRank: 1, displayOrder: 1, searchText: 'mig', status: 'ACTIVE',
        },
      });
      const v = await prisma.productVariant.create({
        data: { productId: p.product_id, sku: 'MIG-1', size: 'S', colorName: 'Đen', colorHex: '#000000', inventoryQty: 3 },
      });
      variantId = v.variant_id;
    });

    const orderSql = (over: Record<string, string> = {}) => {
      const f: Record<string, string> = {
        code: `'N2F2611040001'`, status: `'to_ship'`, payment_method: `'cod'`, email: `'a@x.vn'`,
        recipient_name: `'Nguyen A'`, recipient_phone: `'0912345678'`, province_code: `'01'`, ward_code: `'0001'`,
        province_name: `'Hà Nội'`, ward_name: `'Phường A'`, street: `'12 Pho Hue'`, subtotal: '100000', discount: '0',
        shipping_fee: '30000', shipping_discount: '0', total: '130000', estimated_from: `'2026-11-10'`,
        estimated_to: `'2026-11-12'`, terms_accepted_at: `now()`, items_fingerprint: `repeat('a',64)`, ...over,
      };
      return `INSERT INTO orders (${Object.keys(f).join(',')}) VALUES (${Object.values(f).join(',')})`;
    };
    const rejects = (sql: string) => expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow();

    it('đơn hợp lệ chèn được; trạng thái / tổng / huỷ / hoàn kho sai bị từ chối', async () => {
      await expect(prisma.$executeRawUnsafe(orderSql())).resolves.toBe(1);
      await rejects(orderSql({ code: `'N2F2611040002'`, status: `'abc'` }));
      await rejects(orderSql({ code: `'N2F2611040003'`, total: '1' }));
      await rejects(orderSql({ code: `'N2F2611040004'`, status: `'cancelled'` }));
      await rejects(orderSql({ code: `'N2F2611040005'`, stock_restored_at: 'now()' }));
      await rejects(orderSql({ code: `'N2F2611040006'`, status: `'to_pay'` }));
      await rejects(orderSql({ code: `'bad'` }));
      await rejects(orderSql({ code: `'N2F2611040007'`, email: `'A@X.VN'` }));
      await rejects(orderSql({ code: `'N2F2611040008'`, recipient_phone: `'0112345678'` }));
      await rejects(orderSql({ code: `'N2F2611040009'`, invoice_company: `'Cty'` }));
    });

    it('line_discount > giá dòng, quantity 0 bị từ chối', async () => {
      const oid = (await prisma.order.findUniqueOrThrow({ where: { code: 'N2F2611040001' } })).order_id;
      const item = (ld: number, q = 1) =>
        `INSERT INTO order_items (order_id,line_no,variant_id,product_id,product_slug,name,color_name,size,sku,media_id,unit_price,quantity,line_discount)
         SELECT '${oid}',1,variant_id,product_id,'s','n','c','S','k','m',100000,${q},${ld} FROM product_variants WHERE variant_id='${variantId}'`;
      await rejects(item(100001));
      await rejects(item(0, 0));
      await expect(prisma.$executeRawUnsafe(item(100000))).resolves.toBe(1);
    });

    it('voucher percent 95, used_count > total_limit, store_settings thứ hai, cart_lines.quantity 0, tồn âm', async () => {
      await rejects(`INSERT INTO vouchers (code,name,kind,value,updated_at) VALUES ('BADPCT','x','percent',95,now())`);
      await rejects(`INSERT INTO vouchers (code,name,kind,value,total_limit,used_count,updated_at) VALUES ('OVERUSE','x','fixed',5,1,2,now())`);
      await rejects(`INSERT INTO vouchers (code,name,kind,value,updated_at) VALUES ('abc','x','fixed',5,now())`);
      await expect(
        prisma.$executeRawUnsafe(`INSERT INTO store_settings (id,updated_at) VALUES (1,now())`),
      ).resolves.toBe(1);
      await rejects(`INSERT INTO store_settings (id,updated_at) VALUES (2,now())`);
      const u = await prisma.user.create({
        data: { email: 'mig@x.vn', firstName: 'a', lastName: 'b', terms_accepted_at: new Date() },
      });
      const c = await prisma.cart.create({ data: { userId: u.user_id } });
      await rejects(`INSERT INTO cart_lines (cart_id,variant_id,quantity,updated_at) VALUES ('${c.cart_id}','${variantId}',0,now())`);
      await rejects(`UPDATE product_variants SET inventory_qty = -1 WHERE variant_id='${variantId}'`);
    });
  });
});
