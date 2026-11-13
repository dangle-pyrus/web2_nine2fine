import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedHomeContent } from '../prisma/seed-home-content';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { aGet, aPost, aPut, get, loginAdmin, loginStaff, post, prisma, put, freshIp, resetCheckout, resetState } from './helpers';

/** Slice 10, lát 10.3: T-MOM-01..03, T-CMS-01..04 (AC-MOM-01..03, AC-CMS-01..05). */

let admin: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let admin2: Awaited<ReturnType<typeof loginAdmin>>;

const A = () => admin.cookie;
const S = () => staff.cookie;
type Json = Record<string, any>;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-home@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  admin2 = await loginAdmin('admin-home2@nine2fine.test', { firstName: 'Hai', lastName: 'Quản' });
  staff = await loginStaff('staff-home@nine2fine.test');
});
beforeEach(async () => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
  await prisma.$executeRawUnsafe('DELETE FROM "home_content"');
  await prisma.$executeRawUnsafe(`UPDATE "products" SET "status" = 'ACTIVE' WHERE "status" = 'ARCHIVED'`);
});

const publicHome = () => get('/api/content/home', { ip: freshIp() });
const adminHome = async (cookie = A()): Promise<Json> => (await aGet('/content/home', cookie)).body;
/** Body PUT từ bản admin đọc được (như FE): bỏ trường chỉ đọc. */
const putBody = (d: Json, over: Json = {}): Json => ({ categories: d.categories, moments: d.moments, blocks: d.blocks, updatedAt: d.updatedAt, ...over });
const save = (b: Json, cookie = A()) => aPut('/content/home', b, cookie);
const dbRows = () => prisma.homeContent.count();

const campaign = (i: number, over: Json = {}): Json => ({
  kind: 'campaign', id: `blk-${i}`, eyebrow: 'e', title: 't', description: 'd', href: '/shop', mediaId: 'uniqlo-campaign-01', mobileMediaId: 'uniqlo-campaign-01', ...over,
});

describe('T-MOM-01..03 thẻ Moment (AC-MOM-02)', () => {
  it('4 thẻ theo thứ tự, count = số sản phẩm ACTIVE thật, href, lines <= 2 dòng', async () => {
    const r = await publicHome();
    expect(r.status).toBe(200);
    const counts = await prisma.$queryRawUnsafe<Array<{ m: string; n: number }>>(
      `SELECT m::text AS m, count(*)::int AS n FROM products p, unnest(p.moments) m WHERE p.status = 'ACTIVE' GROUP BY m`,
    );
    const want = new Map(counts.map((c) => [c.m, Number(c.n)]));
    const order = ['work', 'dinner', 'event', 'weekend'].filter((m) => (want.get(m) ?? 0) > 0);
    expect(r.body.moments.map((m: Json) => m.moment)).toEqual(order);
    for (const m of r.body.moments) {
      expect(m.count).toBe(want.get(m.moment));
      expect(m.href).toBe(`/shop?moment=${m.moment}`);
      expect(m.lines.length).toBeLessThanOrEqual(2);
      for (const l of m.lines) expect([...l].length).toBeLessThanOrEqual(60);
    }
  });

  it('thẻ có count 0 không được trả (đưa mọi sản phẩm của Moment về DRAFT)', async () => {
    const before = (await publicHome()).body.moments.map((m: Json) => m.moment);
    expect(before).toContain('weekend');
    await prisma.$executeRawUnsafe(`UPDATE "products" SET "status" = 'DRAFT' WHERE 'weekend' = ANY("moments")`);
    try {
      const after = (await publicHome()).body.moments.map((m: Json) => m.moment);
      expect(after).not.toContain('weekend');
      expect(after).toContain('work');
    } finally {
      await resetCheckout();
    }
  });

  it('GET công khai: không cookie, không Set-Cookie, cookie kèm theo bị bỏ qua, ghi -> 404', async () => {
    const r = await get('/api/content/home', { ip: freshIp(), cookie: A() });
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie']).toBeUndefined();
    for (const res of [await post('/api/content/home', {}, { ip: freshIp() }), await put('/api/content/home', {}, { ip: freshIp() })]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not-found');
    }
  });
});

describe('T-CMS-01 bản mặc định, seed idempotent (AC-CMS-01)', () => {
  it('chưa có dòng lưu: bản mặc định, public max-age=60, chỉ khối enabled; admin thấy cả khối tắt', async () => {
    expect(await dbRows()).toBe(0);
    const r = await publicHome();
    expect(r.headers['cache-control']).toBe('public, max-age=60');
    expect(r.body.categories).toHaveLength(4);
    expect(r.body.blocks).toHaveLength(15);
    expect(r.body.blocks.every((b: Json) => b.enabled === undefined)).toBe(true);
    const a = await adminHome();
    expect(a).toMatchObject({ isDefault: true, updatedAt: null, updatedBy: null });
    expect(a.blocks).toHaveLength(15);
    expect(Array.isArray(a.warnings)).toBe(true);
  });

  it('khối tắt không xuất hiện ở công khai nhưng admin vẫn đọc được', async () => {
    const a = await adminHome();
    const blocks = a.blocks.map((b: Json, i: number) => (i === 1 ? { ...b, enabled: false } : b));
    const s = await save(putBody(a, { blocks }));
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const pub = (await publicHome()).body;
    expect(pub.blocks).toHaveLength(14);
    expect(pub.blocks.some((b: Json) => b.id === a.blocks[1].id)).toBe(false);
    expect((await adminHome()).blocks).toHaveLength(15);
  });

  it('seed lần hai không đè bản admin đã sửa; seed lần đầu tạo dòng', async () => {
    expect((await seedHomeContent(prisma)).inserted).toBe(true);
    const a = await adminHome();
    expect(a.isDefault).toBe(true);
    const s = await save(putBody(a, { categories: a.categories.map((c: Json, i: number) => (i === 0 ? { ...c, label: 'Áo mới' } : c)) }));
    expect(s.status).toBe(200);
    expect((await seedHomeContent(prisma)).inserted).toBe(false);
    expect((await adminHome()).categories[0].label).toBe('Áo mới');
    expect((await publicHome()).body.categories[0].label).toBe('Áo mới');
  });
});

describe('T-CMS-02 lưu nguyên văn bản (AC-CMS-02)', () => {
  it('lưu nguyên bản mặc định (15 khối) lần đầu với updatedAt null; ghi người sửa; thứ tự mảng giữ nguyên', async () => {
    const a = await adminHome();
    const r = await save(putBody(a));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.isDefault).toBe(false);
    expect(r.body.updatedBy).toEqual({ name: 'Trị Quản' });
    expect(r.body.updatedAt).toEqual(expect.any(String));
    expect(r.body.blocks.map((b: Json) => b.id)).toEqual(a.blocks.map((b: Json) => b.id));
    expect(await dbRows()).toBe(1);
  });

  it('staff đọc được nhưng PUT -> 403, DB không đổi (kiểm trước khi đọc thân)', async () => {
    const a = await adminHome();
    expect((await adminHome(S())).blocks).toHaveLength(15);
    const r = await save(putBody(a), S());
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('forbidden');
    expect(await dbRows()).toBe(0);
    const bad = await aPut('/content/home', '{"not json', S());
    expect(bad.status).toBe(403);
  });

  it('không đăng nhập -> 401 no-store', async () => {
    const r = await aPut('/content/home', {}, undefined);
    expect(r.status).toBe(401);
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await aGet('/content/home', undefined)).status).toBe(401);
  });

  it('số khối: 16 hợp lệ, 17 -> 422 blocks (nâng từ 12 lên 16)', async () => {
    const a = await adminHome();
    const mk = (n: number) => Array.from({ length: n }, (_, i) => campaign(i));
    const ok = await save(putBody(a, { blocks: mk(16) }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const over = await save(putBody(ok.body, { blocks: mk(17) }));
    expect(over.status).toBe(422);
    expect(over.body.error.field).toBe('blocks');
    expect(over.body.error.fieldErrors.map((f: Json) => f.field)).toContain('blocks');
  });

  it('giới hạn chữ: title 80/81, description 200/201, eyebrow 40/41, products 6/7 thẻ', async () => {
    const a = await adminHome();
    const card = (i: number) => ({ title: `c${i}`, caption: 'x', href: '/shop', mediaId: 'uniqlo-campaign-01' });
    const good = [
      campaign(1, { title: 'a'.repeat(80), description: 'b'.repeat(200), eyebrow: 'c'.repeat(40) }),
      { kind: 'products', id: 'p', label: 'L', cards: Array.from({ length: 6 }, (_, i) => card(i)) },
    ];
    const ok = await save(putBody(a, { blocks: good }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const bad = [
      campaign(1, { title: 'a'.repeat(81), description: 'b'.repeat(201), eyebrow: 'c'.repeat(41) }),
      { kind: 'products', id: 'p', label: 'L', cards: Array.from({ length: 7 }, (_, i) => card(i)) },
    ];
    const r = await save(putBody(ok.body, { blocks: bad }));
    expect(r.status).toBe(422);
    const fields = r.body.error.fieldErrors.map((f: Json) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['blocks[0].title', 'blocks[0].description', 'blocks[0].eyebrow', 'blocks[1].cards']));
    expect(r.body.error.field).toBe(fields[0]);
  });

  it('href: /shop hợp lệ; //evil.com, https://x, javascript:alert(1), có khoảng trắng, ký tự \\ -> 422 theo đường dẫn', async () => {
    const a = await adminHome();
    const mk = (hrefs: string[]) => hrefs.map((h, i) => campaign(i, { href: h }));
    expect((await save(putBody(a, { blocks: mk(['/shop']) }))).status).toBe(200);
    const cur = await adminHome();
    const bads = ['//evil.com', 'https://x', 'javascript:alert(1)', '/a b', '/a\\b', ''];
    const r = await save(putBody(cur, { blocks: mk(bads) }));
    expect(r.status).toBe(422);
    expect(r.body.error.fieldErrors.map((f: Json) => f.field)).toEqual(bads.map((_, i) => `blocks[${i}].href`));
    const cat = await save(putBody(cur, { categories: [{ label: 'x', href: 'https://x', mediaId: 'uniqlo-category-05' }] }));
    expect(cat.body.error.fieldErrors[0].field).toBe('categories[0].href');
  });

  it('mediaId lạ, up- không tồn tại, id khối trùng, Moment sai thứ tự / thiếu / lines 3 dòng: mọi lỗi một lần', async () => {
    const a = await adminHome();
    const moments = [...a.moments];
    [moments[0], moments[1]] = [moments[1], moments[0]];
    const r = await save(
      putBody(a, {
        moments,
        blocks: [campaign(1, { mediaId: 'khong-co', mobileMediaId: 'up-00000000000000000000000000000000.jpg' }), campaign(1)],
      }),
    );
    expect(r.status).toBe(422);
    const fields = r.body.error.fieldErrors.map((f: Json) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['blocks[0].mediaId', 'blocks[0].mobileMediaId', 'blocks[1].id', 'moments[0].moment', 'moments[1].moment']));
    const m3 = a.moments.map((m: Json, i: number) => (i === 1 ? { ...m, lines: ['a', 'b', 'c'] } : m));
    const r3 = await save(putBody(a, { moments: m3 }));
    expect(r3.body.error.fieldErrors[0].field).toBe('moments[1].lines');
    const r4 = await save(putBody(a, { moments: a.moments.slice(0, 3) }));
    expect(r4.body.error.field).toBe('moments');
    const long = a.moments.map((m: Json, i: number) => (i === 0 ? { ...m, lines: ['x'.repeat(61)] } : m));
    expect((await save(putBody(a, { moments: long }))).body.error.fieldErrors[0].field).toBe('moments[0].lines[0]');
    expect(await dbRows()).toBe(0);
  });

  it('thân > 64 KB -> 422; thân JSON hỏng -> 422', async () => {
    const a = await adminHome();
    const big = await save(putBody(a, { blocks: [campaign(1, { description: 'x'.repeat(70_000) })] }));
    expect(big.status).toBe(422);
    expect((await aPut('/content/home', '{"x', A())).status).toBe(422);
  });

  it('updatedAt cũ -> 409 kèm error.current (bản hiện tại), không ghi; null khi đã có dòng cũng 409', async () => {
    const a = await adminHome();
    const first = await save(putBody(a, { categories: a.categories.map((c: Json, i: number) => (i === 0 ? { ...c, label: 'Một' } : c)) }));
    expect(first.status).toBe(200);
    const stale = await save(putBody(a, { categories: a.categories.map((c: Json, i: number) => (i === 0 ? { ...c, label: 'Hai' } : c)) }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version-conflict');
    expect(stale.body.error.current.categories[0].label).toBe('Một');
    expect(stale.body.error.current.updatedAt).toBe(first.body.updatedAt);
    expect((await adminHome()).categories[0].label).toBe('Một');
    // updatedAt tăng ngặt: hai lần lưu liên tiếp cho token khác nhau.
    const second = await save(putBody(first.body, { categories: first.body.categories }));
    expect(second.status).toBe(200);
    expect(new Date(second.body.updatedAt).getTime()).toBeGreaterThan(new Date(first.body.updatedAt).getTime());
  });

  it('hai admin lưu đồng thời cùng token: đúng 1 x 200, còn lại 409 (cả khi chưa có dòng)', async () => {
    const a = await adminHome();
    const mk = (label: string) => putBody(a, { categories: a.categories.map((c: Json, i: number) => (i === 0 ? { ...c, label } : c)) });
    const rs = await Promise.all([save(mk('A1'), A()), aPut('/content/home', mk('B1'), admin2.cookie)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await dbRows()).toBe(1);
    const cur = await adminHome();
    const rs2 = await Promise.all([save(putBody(cur, { updatedAt: cur.updatedAt }), A()), aPut('/content/home', putBody(cur, { updatedAt: cur.updatedAt }), admin2.cookie)]);
    expect(rs2.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('ký tự điều khiển trong title -> 422; description cho phép xuống dòng', async () => {
    const a = await adminHome();
    const r = await save(putBody(a, { blocks: [campaign(1, { title: 'a\u0007b' })] }));
    expect(r.status).toBe(422);
    const ok = await save(putBody(a, { blocks: [campaign(1, { description: 'một\nhai' })] }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});

describe('T-CMS-03 ảnh bị xoá không làm hỏng trang (AC-CMS-03)', () => {
  it('mediaId up- đã lưu, xoá khỏi media_assets: công khai vẫn trả nguyên mediaId', async () => {
    const id = 'up-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg';
    await prisma.mediaAsset.create({ data: { mediaId: id, storage: 'local', contentType: 'image/jpeg', byteSize: 100, width: 800, height: 800 } });
    const a = await adminHome();
    const ok = await save(putBody(a, { blocks: [campaign(1, { mediaId: id, mobileMediaId: id })] }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    await prisma.mediaAsset.delete({ where: { mediaId: id } });
    const r = await publicHome();
    expect(r.status).toBe(200);
    expect(r.body.blocks[0].mediaId).toBe(id);
    expect(r.body.moments.length).toBeGreaterThan(0);
  });
});

describe('T-CMS-04 bảng size (AC-CMS-04)', () => {
  const chart = async (cat = 'tops'): Promise<Json> => (await aGet('/size-charts', A())).body.items.find((i: Json) => i.category === cat);
  const sbody = (c: Json, over: Json = {}): Json => ({ ...c.chart, updatedAt: c.updatedAt, ...over });
  const rows = (n: number, cols: string[]) => Array.from({ length: n }, (_, i) => ({ size: `S${i}`, values: Object.fromEntries(cols.map((k) => [k, '1'])) }));

  it('danh sách: một phần tử mỗi danh mục (4), productCount, customised false; staff đọc được', async () => {
    const r = await aGet('/size-charts', S());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.items.map((i: Json) => i.category).sort()).toEqual(['bottoms', 'dresses', 'outerwear', 'tops']);
    const tops = r.body.items.find((i: Json) => i.category === 'tops');
    expect(tops).toMatchObject({ customised: false, updatedBy: null, label: expect.any(String) });
    expect(tops.productCount).toBe(await prisma.product.count({ where: { category: { slug: 'tops' } } }));
    expect(tops.chart.body.length).toBeGreaterThan(0);
  });

  it('lưu bảng: 12 hàng / 8 cột hợp lệ; GET công khai max-age=60 kèm updatedAt, bản mới', async () => {
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const c = await chart();
    const r = await aPut('/size-charts/tops', sbody(c, { body: rows(12, cols), garment: rows(1, ['x']), bodyColumns: cols, garmentColumns: ['x'] }), A());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ customised: true, updatedBy: { name: 'Trị Quản' } });
    const pub = await get('/api/size-charts/tops', { ip: freshIp() });
    expect(pub.headers['cache-control']).toBe('public, max-age=60');
    expect(pub.body.body).toHaveLength(12);
    expect(pub.body.bodyColumns).toEqual(cols);
    expect(pub.body.updatedAt).toBe(r.body.updatedAt);
    // danh mục chưa sửa: không có updatedAt
    expect((await get('/api/size-charts/bottoms', { ip: freshIp() })).body.updatedAt).toBeUndefined();
  });

  it('13 hàng, 9 cột, nhãn 11 ký tự, trùng nhãn, ô rỗng, ô 21 ký tự, thiếu / thừa cột: 422 theo đường dẫn, DB không đổi', async () => {
    const c = await chart('bottoms');
    const cols = ['Eo', 'Hông'];
    const base = { garment: c.chart.garment, garmentColumns: c.chart.garmentColumns, bodyColumns: cols };
    const r13 = await aPut('/size-charts/bottoms', sbody(c, { ...base, body: rows(13, cols) }), A());
    expect(r13.status).toBe(422);
    expect(r13.body.error.field).toBe('body');
    const c9 = Array.from({ length: 9 }, (_, i) => `c${i}`);
    const r9 = await aPut('/size-charts/bottoms', sbody(c, { ...base, bodyColumns: c9, body: rows(1, c9) }), A());
    expect(r9.body.error.field).toBe('bodyColumns');
    const bad = [
      { size: 'S'.repeat(11), values: { Eo: '1', Hông: '1' } },
      { size: 'M', values: { Eo: '1', Hông: '1' } },
      { size: 'M', values: { Eo: '', Hông: 'x'.repeat(21) } },
      { size: 'L', values: { Eo: '1' } },
      { size: 'XL', values: { Eo: '1', Hông: '1', Thừa: '2' } },
    ];
    const r = await aPut('/size-charts/bottoms', sbody(c, { ...base, body: bad }), A());
    expect(r.status).toBe(422);
    expect(r.body.error.fieldErrors.map((f: Json) => f.field)).toEqual([
      'body[0].size', 'body[2].size', 'body[2].values.Eo', 'body[2].values.Hông', 'body[3].values.Hông', 'body[4].values.Thừa',
    ]);
    const dupCol = await aPut('/size-charts/bottoms', sbody(c, { ...base, bodyColumns: ['Eo', 'Eo'], body: rows(1, ['Eo']) }), A());
    expect(dupCol.body.error.fieldErrors[0].field).toBe('bodyColumns[1]');
    expect((await chart('bottoms')).customised).toBe(false);
  });

  it('updatedAt cũ -> 409 kèm current; staff -> 403; danh mục lạ -> 404; đồng thời 1 x 200', async () => {
    const c = await chart('dresses');
    const ok = await aPut('/size-charts/dresses', sbody(c), A());
    expect(ok.status).toBe(200);
    const stale = await aPut('/size-charts/dresses', sbody(c), A());
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.category).toBe('dresses');
    expect(stale.body.error.current.updatedAt).toBe(ok.body.updatedAt);
    expect((await aPut('/size-charts/dresses', sbody(ok.body), S())).status).toBe(403);
    expect((await aPut('/size-charts/shoes', sbody(c), A())).status).toBe(404);
    const cur = (await chart('dresses'));
    const rs = await Promise.all([aPut('/size-charts/dresses', sbody(cur), A()), aPut('/size-charts/dresses', sbody(cur), admin2.cookie)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe('Should (10.8): khôi phục mặc định + cảnh báo href (AC-CMS-06)', () => {
  it('reset: isDefault true, updatedBy = người gọi, 409 khi lệch, staff 403', async () => {
    const a = await adminHome();
    const saved = await save(putBody(a, { categories: a.categories.map((c: Json, i: number) => (i === 0 ? { ...c, label: 'Đã sửa' } : c)) }));
    expect(saved.status).toBe(200);
    expect((await aPost('/content/home/reset', { updatedAt: saved.body.updatedAt }, S())).status).toBe(403);
    const stale = await aPost('/content/home/reset', { updatedAt: a.updatedAt }, A());
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.categories[0].label).toBe('Đã sửa');
    const r = await aPost('/content/home/reset', { updatedAt: saved.body.updatedAt }, admin2.cookie);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ isDefault: true, updatedBy: { name: 'Quản Hai' } });
    expect(r.body.categories[0].label).toBe('Áo');
    expect((await aPost('/content/home/reset', {}, A())).status).toBe(422);
  });

  it('cảnh báo (không chặn) khi href trỏ sản phẩm không ACTIVE', async () => {
    const draft = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    await prisma.product.update({ where: { product_id: draft.product_id }, data: { status: 'DRAFT' } });
    try {
      const a = await adminHome();
      const r = await save(putBody(a, { blocks: [campaign(1, { href: `/product/${draft.slug}` })] }));
      expect(r.status).toBe(200);
      expect(r.body.warnings).toEqual([{ path: 'blocks[0].href', message: expect.any(String) }]);
    } finally {
      await resetCheckout();
    }
  });
});
