import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { aDel, aGet, aPost, aPut, freshIp, get, loginAdmin, loginStaff, makeProduct, post, prisma, resetCheckout, resetState } from './helpers';

/** Slice 10, lát 10.8 (Should): T-CMS-07 (AC-CMS-07). */

type Json = Record<string, any>;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let admin2: Awaited<ReturnType<typeof loginAdmin>>;
let staff: Awaited<ReturnType<typeof loginStaff>>;
let ids: string[] = [];

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  admin = await loginAdmin('admin-col@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' });
  admin2 = await loginAdmin('admin-col2@nine2fine.test', { firstName: 'Hai', lastName: 'Quản' });
  staff = await loginStaff('staff-col@nine2fine.test');
});
beforeEach(async () => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
  await prisma.$executeRawUnsafe('DELETE FROM "collections"');
  ids = (await prisma.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayOrder: 'asc' }, select: { product_id: true } })).map((p) => p.product_id);
});

const A = () => admin.cookie;
const create = (over: Json = {}, cookie = A()) => aPost('/collections', { name: 'Hè 2027', slug: 'he-2027', ...over }, cookie);
const pub = (path: string) => get(`/api/collections${path}`, { ip: freshIp() });

describe('T-CMS-07 bộ sưu tập (AC-CMS-07)', () => {
  it('slug: "Hè 2027" / 1 ký tự / hoa -> 422; he-2027 và 2 ký tự hợp lệ; trùng -> 409 duplicate; vắng sinh từ tên', async () => {
    for (const slug of ['Hè 2027', 'a', 'HE-2027', 'he 2027', 'x'.repeat(51)]) {
      const r = await create({ slug });
      expect(r.status, slug).toBe(422);
      expect(r.body.error.field).toBe('slug');
    }
    const ok = await create();
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.body).toMatchObject({ name: 'Hè 2027', slug: 'he-2027', status: 'draft', slugLocked: false, description: '', productIds: [], updatedBy: { name: 'Trị Quản' } });
    const dup = await create();
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'duplicate', field: 'slug' });
    expect((await create({ slug: 'ab' })).status).toBe(201);
    const gen = await aPost('/collections', { name: 'Bộ Sưu Tập Thu Đông' }, A());
    expect(gen.body.slug).toBe('bo-suu-tap-thu-dong');
    const gen2 = await aPost('/collections', { name: 'Bộ Sưu Tập Thu Đông' }, A());
    expect(gen2.body.slug).toBe('bo-suu-tap-thu-dong-2');
  });

  it('name 0 / 81, description 301, status lạ, productIds trùng / sai dạng / không tồn tại: mọi lỗi một lần', async () => {
    const r = await aPost('/collections', { name: '', slug: 'a', description: 'd'.repeat(301), status: 'x', productIds: ['abc'] }, A());
    expect(r.status).toBe(422);
    expect(r.body.error.fieldErrors.map((f: Json) => f.field)).toEqual(['name', 'slug', 'description', 'status', 'productIds']);
    expect((await create({ name: 'n'.repeat(81) })).body.error.field).toBe('name');
    expect((await create({ name: 'n'.repeat(80), slug: 'name-80' })).status).toBe(201);
    expect((await create({ slug: 'dup-ids', productIds: [ids[0], ids[0]] })).body.error.field).toBe('productIds');
    expect((await create({ slug: 'no-prod', productIds: ['00000000-0000-4000-8000-000000000000'] })).body.error.field).toBe('productIds');
    expect(await prisma.collection.count()).toBe(1);
  });

  it('200 sản phẩm hợp lệ, 201 -> 422; thứ tự mảng = thứ tự; thay nguyên khi sửa', async () => {
    const many: string[] = [...ids];
    for (let i = 0; many.length < 201; i++) many.push((await makeProduct({ status: 'DRAFT' })).id);
    const ok = await create({ slug: 'two-hundred', productIds: many.slice(0, 200) });
    expect(ok.status, JSON.stringify(ok.body).slice(0, 200)).toBe(201);
    expect(ok.body.productIds).toEqual(many.slice(0, 200));
    const over = await create({ slug: 'two-hundred-one', productIds: many.slice(0, 201) });
    expect(over.status).toBe(422);
    expect(over.body.error.field).toBe('productIds');
    const rev = await aPut(`/collections/${ok.body.id}`, { name: 'Đổi', slug: 'two-hundred', productIds: [ids[2], ids[0], ids[1]], updatedAt: ok.body.updatedAt }, A());
    expect(rev.status, JSON.stringify(rev.body)).toBe(200);
    expect(rev.body.productIds).toEqual([ids[2], ids[0], ids[1]]);
    expect(await prisma.collectionProduct.count({ where: { collectionId: ok.body.id } })).toBe(3);
  });

  it('active đầu khoá slug: đổi slug -> 422 slug; draft đổi được; sửa tăng ngặt updatedAt; updatedAt cũ -> 409 kèm current', async () => {
    const draft = await create({ slug: 'bst-draft' });
    const renamed = await aPut(`/collections/${draft.body.id}`, { name: 'Tên mới', slug: 'bst-doi-slug', updatedAt: draft.body.updatedAt }, A());
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body.slug).toBe('bst-doi-slug');
    expect(new Date(renamed.body.updatedAt).getTime()).toBeGreaterThan(new Date(draft.body.updatedAt).getTime());
    const active = await aPut(`/collections/${draft.body.id}`, { name: 'Tên mới', status: 'active', updatedAt: renamed.body.updatedAt }, A());
    expect(active.body).toMatchObject({ status: 'active', slug: 'bst-doi-slug', slugLocked: true });
    const locked = await aPut(`/collections/${draft.body.id}`, { name: 'Tên mới', slug: 'khac', status: 'active', updatedAt: active.body.updatedAt }, A());
    expect(locked.status).toBe(422);
    expect(locked.body.error.field).toBe('slug');
    // về draft: slug vẫn khoá
    const back = await aPut(`/collections/${draft.body.id}`, { name: 'Tên mới', status: 'draft', updatedAt: active.body.updatedAt }, A());
    expect(back.body).toMatchObject({ status: 'draft', slugLocked: true });
    const stale = await aPut(`/collections/${draft.body.id}`, { name: 'Cũ', updatedAt: draft.body.updatedAt }, A());
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version-conflict');
    expect(stale.body.error.current).toMatchObject({ id: draft.body.id, name: 'Tên mới' });
    const sameSlug = await create({ slug: 'dang-co' });
    const clash = await aPut(`/collections/${sameSlug.body.id}`, { name: 'x', slug: 'bst-doi-slug', updatedAt: sameSlug.body.updatedAt }, A());
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatchObject({ code: 'duplicate', field: 'slug' });
    // đồng thời: 1 x 200
    const cur = (await aGet(`/collections/${sameSlug.body.id}`, A())).body;
    const rs = await Promise.all([
      aPut(`/collections/${cur.id}`, { name: 'A', updatedAt: cur.updatedAt }, A()),
      aPut(`/collections/${cur.id}`, { name: 'B', updatedAt: cur.updatedAt }, admin2.cookie),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('phân quyền: staff đọc được, ghi 403; không cookie 401; id sai dạng / lạ 404', async () => {
    const c = await create({ slug: 'perm-col' });
    expect((await aGet('/collections', staff.cookie)).status).toBe(200);
    expect((await aGet(`/collections/${c.body.id}`, staff.cookie)).status).toBe(200);
    expect((await create({ slug: 'staff-col' }, staff.cookie)).status).toBe(403);
    expect((await aPut(`/collections/${c.body.id}`, { name: 'x', updatedAt: c.body.updatedAt }, staff.cookie)).status).toBe(403);
    expect((await aDel(`/collections/${c.body.id}`, staff.cookie)).status).toBe(403);
    expect((await aGet('/collections', undefined)).status).toBe(401);
    expect((await aGet('/collections/abc', A())).status).toBe(404);
    expect((await aGet('/collections/00000000-0000-4000-8000-000000000000', A())).status).toBe(404);
    expect((await aPut('/collections/abc', { name: 'x', updatedAt: c.body.updatedAt }, A())).status).toBe(404);
    expect((await aDel('/collections/00000000-0000-4000-8000-000000000000', A())).status).toBe(404);
    expect(await prisma.collection.count()).toBe(1);
  });

  it('xoá bộ sưu tập không xoá sản phẩm; admin list sắp updatedAt giảm', async () => {
    const a = await create({ slug: 'col-a', productIds: ids.slice(0, 2) });
    const b = await create({ slug: 'col-b' });
    const list = await aGet('/collections', A());
    expect(list.body.items.map((i: Json) => i.slug)).toEqual(['col-b', 'col-a']);
    const before = await prisma.product.count();
    const d = await aDel(`/collections/${a.body.id}`, A());
    expect(d.status).toBe(204);
    expect(await prisma.product.count()).toBe(before);
    expect(await prisma.collectionProduct.count()).toBe(0);
    expect((await aGet(`/collections/${a.body.id}`, A())).status).toBe(404);
    void b;
  });

  it('công khai: draft 404; active -> trang + chỉ sản phẩm ACTIVE theo thứ tự, giá hiệu lực; danh sách chỉ active; max-age=60', async () => {
    const draftProduct = await makeProduct({ status: 'DRAFT' });
    const created = await create({ slug: 'he-2027', status: 'draft', productIds: [ids[1], draftProduct.id, ids[0]] });
    expect((await pub('/he-2027')).status).toBe(404);
    expect((await pub('')).body.items).toEqual([]);
    await aPut(`/collections/${created.body.id}`, { name: 'Hè 2027', status: 'active', productIds: [ids[1], draftProduct.id, ids[0]], updatedAt: created.body.updatedAt }, A());
    const list = await pub('');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('public, max-age=60');
    expect(list.headers['set-cookie']).toBeUndefined();
    expect(list.body.items).toEqual([{ slug: 'he-2027', name: 'Hè 2027', description: '', productCount: 2 }]);
    const r = await pub('/he-2027');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=60');
    expect(r.body.products.map((p: Json) => p.id)).toEqual([ids[1], ids[0]]);
    expect(r.body.products[0]).toMatchObject({ slug: expect.any(String), price: expect.any(Number), variants: expect.any(Array) });
    expect((await pub('/%20He-2027%20')).status).toBe(200); // trim + chữ thường
    expect((await pub('/khong-co')).status).toBe(404);
    expect((await pub('/a')).status).toBe(404);
    expect((await pub('/he%202027')).status).toBe(404);
    expect((await post('/api/collections', {}, { ip: freshIp() })).status).toBe(404);
    // bộ sưu tập không còn sản phẩm ACTIVE vẫn trả với productCount 0
    await prisma.product.updateMany({ where: { product_id: { in: [ids[0], ids[1]] } }, data: { status: 'DRAFT' } });
    expect((await pub('')).body.items[0].productCount).toBe(0);
    expect((await pub('/he-2027')).body.products).toEqual([]);
    await resetCheckout();
  });

  it('cảnh báo trang chủ: href /collections/<slug> trỏ bộ sưu tập không active', async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "home_content"');
    await create({ slug: 'hidden-col' });
    const home = (await aGet('/content/home', A())).body;
    const blocks = [{ kind: 'campaign', id: 'c1', eyebrow: 'e', title: 't', description: 'd', href: '/collections/hidden-col', mediaId: 'uniqlo-campaign-01', mobileMediaId: 'uniqlo-campaign-01' }];
    const saved = await aPut('/content/home', { categories: home.categories, moments: home.moments, blocks, updatedAt: home.updatedAt }, A());
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.warnings).toEqual([{ path: 'blocks[0].href', message: expect.any(String) }]);
    await prisma.$executeRawUnsafe('DELETE FROM "home_content"');
  });
});
