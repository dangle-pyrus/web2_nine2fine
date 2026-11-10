import { Page, Request, Route } from '@playwright/test';

/**
 * A small stand-in for `/api/admin/{products,inventory,promotions,uploads}` (docs/api/openapi.yaml,
 * Slice 6) for the Playwright specs. The e2e build keeps the earlier mock back office by default;
 * `useCatalogApi` switches it to the real HTTP adapters (`adminCatalogMode = http`) and answers the
 * requests here, so the specs exercise the adapters, the mapping and the error handling.
 */
export const CATALOG_MODE_KEY = 'n2f.e2e.adminCatalogMode';
export const ORDERS_MODE_KEY = 'n2f.e2e.adminOrdersMode';

type Json = Record<string, unknown>;

export interface Failure {
  status: number;
  code: string;
  message?: string;
  extra?: Json;
}

const NOW = '2026-11-10T03:00:00.000Z';
const COLOR_BLACK = { name: 'Đen', hex: '#242323' };

function variant(id: string, sku: string, size: string, inventory: number, hasOrders = false) {
  return { id, sku, color: COLOR_BLACK, size, inventory, hasOrders };
}

function product(overrides: Json = {}): Json {
  return {
    id: 'p-live',
    slug: 'ao-blazer-linen',
    name: 'Áo blazer linen',
    type: 'Áo blazer · Dáng suông',
    description: 'Mô tả',
    status: 'active',
    category: 'outerwear',
    genders: ['nu'],
    moments: ['work'],
    price: 1290000,
    compareAtPrice: null,
    material: '',
    care: [],
    fitSummary: '',
    images: [{ id: 'catalog-placeholder', url: null, alt: '', color: '' }],
    colors: [COLOR_BLACK],
    sizes: ['S', 'M'],
    variants: [
      variant('v-live-s', 'BLZ-D-S', 'S', 10, true),
      variant('v-live-m', 'BLZ-D-M', 'M', 0),
    ],
    published: true,
    slugLocked: true,
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: { name: 'Admin' },
    ...overrides,
  };
}

function promotion(overrides: Json = {}): Json {
  return {
    id: 'pr-1',
    code: 'CHAOTHU10',
    title: 'Chào thu',
    type: 'percent',
    value: 10,
    maxDiscount: 200000,
    minSubtotal: 0,
    categories: [],
    usageLimit: null,
    perCustomerLimit: 1,
    audience: 'everyone',
    firstOrderOnly: false,
    excludeSaleItems: false,
    used: 0,
    hasRedemptions: false,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: null,
    enabled: true,
    state: 'running',
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: null,
    ...overrides,
  };
}

export class CatalogApi {
  products: Json[] = [
    product(),
    product({
      id: 'p-draft',
      slug: 'vay-nhap',
      name: 'Váy nháp',
      status: 'draft',
      published: false,
      slugLocked: false,
      publishedAt: null,
      images: [],
      category: 'dresses',
      variants: [variant('v-draft-s', 'VAY-D-S', 'S', 0), variant('v-draft-m', 'VAY-D-M', 'M', 0)],
      sizes: ['S', 'M'],
    }),
  ];
  promotions: Json[] = [
    promotion(),
    promotion({
      id: 'pr-used',
      code: 'DADUNG20',
      title: 'Đã dùng',
      used: 3,
      hasRedemptions: true,
      value: 20,
    }),
    promotion({
      id: 'pr-off',
      code: 'TAMTAT',
      title: 'Tạm tắt',
      enabled: false,
      state: 'disabled',
    }),
  ];
  inventory: Json[] = [
    {
      variantId: 'v-live-s',
      productId: 'p-live',
      productName: 'Áo blazer linen',
      productStatus: 'active',
      image: { id: 'catalog-placeholder', url: null },
      color: COLOR_BLACK,
      size: 'S',
      sku: 'BLZ-D-S',
      onHand: 13,
      reserved: 3,
      available: 10,
      lowStockThreshold: 5,
      thresholdCustom: false,
      category: 'outerwear',
      status: 'in',
    },
    {
      variantId: 'v-live-m',
      productId: 'p-live',
      productName: 'Áo blazer linen',
      productStatus: 'active',
      image: { id: 'catalog-placeholder', url: null },
      color: COLOR_BLACK,
      size: 'M',
      sku: 'BLZ-D-M',
      onHand: 0,
      reserved: 0,
      available: 0,
      lowStockThreshold: 5,
      thresholdCustom: false,
      category: 'outerwear',
      status: 'out',
    },
  ];
  /** Every request the page sent, in order: `METHOD /path?query`. */
  requests: {
    method: string;
    url: URL;
    body: unknown;
    headers: Record<string, string>;
    raw: Buffer | null;
  }[] = [];
  /** Answer the next request for `METHOD pathname` with an error, once. */
  failures = new Map<string, Failure>();
  /** Breaks the next request for `METHOD pathname` like a dropped connection. */
  aborts = new Set<string>();
  listDelayMs = 0;

  find(method: string, pattern: RegExp) {
    return this.requests.filter(
      (item) => item.method === method && pattern.test(item.url.pathname),
    );
  }

  private reply(
    route: Route,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store', ...headers },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  }

  private error(route: Route, status: number, code: string, message: string, extra: Json = {}) {
    return this.reply(route, status, { error: { code, message, ...extra } });
  }

  private page<T>(items: T[], url: URL, counts?: Record<string, number>) {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const page = Number(url.searchParams.get('page') ?? 1);
    return {
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
      ...(counts ? { counts } : {}),
    };
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const raw = request.postDataBuffer();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw.toString('utf-8')) : null;
    } catch {
      body = null;
    }
    this.requests.push({ method, url, body, headers: request.headers(), raw });

    const key = `${method} ${path}`;
    if (this.aborts.delete(key)) return route.abort('connectionreset');
    const failure = this.failures.get(key);
    if (failure) {
      this.failures.delete(key);
      return this.error(
        route,
        failure.status,
        failure.code,
        failure.message ?? 'Lỗi',
        failure.extra,
      );
    }
    if (this.listDelayMs && method === 'GET')
      await new Promise((r) => setTimeout(r, this.listDelayMs));

    let match: RegExpMatchArray | null;
    if (path === '/products' && method === 'GET') return this.listProducts(route, url);
    if (path === '/products' && method === 'POST') return this.createProduct(route, body as Json);
    if (path === '/products/bulk-status' && method === 'POST')
      return this.bulkStatus(route, body as Json);
    if ((match = path.match(/^\/products\/([^/]+)$/))) {
      const found = this.products.find((item) => item['id'] === match![1]);
      if (!found) return this.error(route, 404, 'not-found', 'Không tìm thấy.');
      if (method === 'GET') return this.reply(route, 200, found);
      if (method === 'PUT') return this.updateProduct(route, found, body as Json);
      if (method === 'DELETE') {
        if (found['published'])
          return this.error(
            route,
            409,
            'product-in-use',
            'Sản phẩm đã từng hiển thị hoặc đã có đơn; hãy Ẩn thay vì xoá.',
          );
        this.products = this.products.filter((item) => item !== found);
        return this.reply(route, 204);
      }
    }
    if (path === '/uploads/product-images' && method === 'POST') return this.upload(route, raw);
    if (path === '/inventory' && method === 'GET')
      return this.reply(route, 200, this.page(this.filteredInventory(url), url));
    if (path === '/inventory/facets') return this.facets(route, url);
    if (path === '/inventory/thresholds' && method === 'PUT') {
      const input = body as Json;
      return this.reply(route, 200, {
        defaultThreshold: (input['defaultThreshold'] as number | undefined) ?? 5,
        customCount: 0,
      });
    }
    if ((match = path.match(/^\/inventory\/([^/]+)\/adjustments$/)) && method === 'POST')
      return this.adjust(route, match[1], body as Json, request);
    if ((match = path.match(/^\/inventory\/([^/]+)\/movements$/)))
      return this.reply(route, 200, [
        {
          id: 'm1',
          at: NOW,
          change: 13,
          after: 13,
          reason: 'received',
          note: 'Tồn ban đầu',
          author: 'Admin',
          authorRole: 'admin',
        },
        {
          id: 'o-1',
          at: NOW,
          change: -3,
          after: null,
          reason: 'order',
          note: 'Bán theo đơn N2F-1',
          author: 'Khách',
          authorRole: null,
        },
      ]);
    if (path === '/promotions' && method === 'GET') return this.listPromotions(route, url);
    if (path === '/promotions' && method === 'POST')
      return this.createPromotion(route, body as Json);
    if ((match = path.match(/^\/promotions\/([^/]+)$/))) {
      const found = this.promotions.find((item) => item['id'] === match![1]);
      if (!found) return this.error(route, 404, 'not-found', 'Không tìm thấy.');
      if (method === 'GET') return this.reply(route, 200, found);
      if (method === 'PUT') return this.updatePromotion(route, found, body as Json);
      if (method === 'PATCH') {
        found['enabled'] = (body as Json)['enabled'];
        found['state'] = found['enabled'] ? 'running' : 'disabled';
        found['updatedAt'] = new Date().toISOString();
        return this.reply(route, 200, found);
      }
      if (method === 'DELETE') {
        if (found['hasRedemptions'])
          return this.error(route, 409, 'voucher-in-use', 'Mã đã được dùng; hãy tắt thay vì xoá.');
        this.promotions = this.promotions.filter((item) => item !== found);
        return this.reply(route, 204);
      }
    }
    return this.error(route, 404, 'not-found', `Không có route ${key}`);
  }

  // ---------- products ----------

  private summary(item: Json): Json {
    const variants = item['variants'] as { inventory: number }[];
    const images = item['images'] as { id: string; url: string | null }[];
    return {
      id: item['id'],
      slug: item['slug'],
      name: item['name'],
      coverImage: images[0] ? { id: images[0].id, url: images[0].url } : null,
      status: item['status'],
      category: item['category'],
      categoryName: item['category'],
      price: item['price'],
      compareAtPrice: item['compareAtPrice'],
      inventory: variants.reduce((sum, row) => sum + row.inventory, 0),
      variantCount: variants.length,
      updatedAt: item['updatedAt'],
    };
  }

  private listProducts(route: Route, url: URL) {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const view = url.searchParams.get('view') ?? 'all';
    const matches = this.products.filter((item) => {
      if (q && !String(item['name']).toLowerCase().includes(q)) return false;
      return true;
    });
    const count = (status: string) => matches.filter((item) => item['status'] === status).length;
    const visible = matches.filter((item) => {
      if (view === 'out-of-stock')
        return (item['variants'] as { inventory: number }[]).some((row) => row.inventory === 0);
      return view === 'all' || item['status'] === view;
    });
    return this.reply(
      route,
      200,
      this.page(
        visible.map((item) => this.summary(item)),
        url,
        {
          all: matches.length,
          active: count('active'),
          draft: count('draft'),
          hidden: count('hidden'),
          'out-of-stock': matches.filter((item) =>
            (item['variants'] as { inventory: number }[]).some((row) => row.inventory === 0),
          ).length,
        },
      ),
    );
  }

  private missing(input: Json): string[] {
    const missing: string[] = [];
    if (!String(input['name'] ?? '').trim()) missing.push('name');
    if (!(input['images'] as unknown[] | undefined)?.length) missing.push('images');
    if (!(input['variants'] as unknown[] | undefined)?.length) missing.push('variants');
    return missing;
  }

  private build(input: Json, base: Json): Json {
    const variants = ((input['variants'] as Json[]) ?? []).map((row, index) => ({
      id: (row['id'] as string | undefined) ?? `v-new-${index}`,
      sku: String(row['sku']).toUpperCase(),
      color: row['color'],
      size: row['size'],
      inventory: row['id']
        ? this.currentStock(String(row['id']))
        : ((row['inventory'] as number) ?? 0),
      hasOrders: this.hasOrders(String(row['id'] ?? '')),
    }));
    const colors: Json[] = [];
    for (const row of variants) {
      const color = row.color as { name: string };
      if (!colors.some((item) => (item['name'] as string) === color.name)) colors.push(color);
    }
    const published = Boolean(base['published']) || input['status'] === 'active';
    return {
      ...base,
      slug:
        (input['slug'] as string) ||
        base['slug'] ||
        String(input['name']).toLowerCase().replace(/\W+/g, '-'),
      name: input['name'],
      type: input['type'],
      description: input['description'] ?? '',
      status: input['status'] ?? 'draft',
      category: input['category'],
      genders: input['genders'] ?? [],
      moments: input['moments'] ?? [],
      price: input['price'],
      compareAtPrice: input['compareAtPrice'] ?? null,
      material: input['material'] ?? '',
      care: input['care'] ?? [],
      fitSummary: input['fitSummary'] ?? '',
      images: ((input['images'] as Json[]) ?? []).map((image) => ({
        id: image['id'],
        url: String(image['id']).startsWith('up-') ? `/api/media/${image['id']}` : null,
        alt: image['alt'] ?? '',
        color: image['color'] ?? '',
      })),
      colors,
      sizes: [...new Set(variants.map((row) => row.size as string))],
      variants,
      published,
      slugLocked: published,
      publishedAt: published ? NOW : null,
      updatedAt: new Date(Date.parse(String(base['updatedAt'] ?? NOW)) + 1000).toISOString(),
    };
  }

  private currentStock(variantId: string): number {
    for (const item of this.products)
      for (const row of item['variants'] as { id: string; inventory: number }[])
        if (row.id === variantId) return row.inventory;
    return 0;
  }

  private hasOrders(variantId: string): boolean {
    for (const item of this.products)
      for (const row of item['variants'] as { id: string; hasOrders: boolean }[])
        if (row.id === variantId) return row.hasOrders;
    return false;
  }

  private createProduct(route: Route, input: Json) {
    if (input['status'] === 'active') {
      const missing = this.missing(input);
      if (missing.length)
        return this.error(route, 422, 'publish-incomplete', 'Chưa đủ điều kiện công khai.', {
          missing,
        });
    }
    if (input['slug'] && this.products.some((item) => item['slug'] === input['slug']))
      return this.error(route, 409, 'duplicate', 'Đường dẫn đã được dùng.', { field: 'slug' });
    const variants = (input['variants'] as Json[]) ?? [];
    const taken = this.products.flatMap((item) =>
      (item['variants'] as { sku: string }[]).map((row) => row.sku),
    );
    const index = variants.findIndex((row) => taken.includes(String(row['sku']).toUpperCase()));
    if (index >= 0)
      return this.error(route, 409, 'duplicate', 'SKU đã được dùng.', {
        field: `variants[${index}].sku`,
      });
    const created = this.build(input, {
      id: `p-new-${this.products.length}`,
      createdAt: NOW,
      updatedBy: { name: 'Admin' },
    });
    this.products.unshift(created);
    return this.reply(route, 201, created);
  }

  private updateProduct(route: Route, found: Json, input: Json) {
    if (input['updatedAt'] !== found['updatedAt'])
      return this.error(route, 409, 'version-conflict', 'Dữ liệu đã đổi.');
    if (input['status'] === 'active') {
      const missing = this.missing(input);
      if (missing.length)
        return this.error(route, 422, 'publish-incomplete', 'Chưa đủ điều kiện công khai.', {
          missing,
        });
    }
    if (input['slug'] && input['slug'] !== found['slug'] && found['slugLocked'])
      return this.error(
        route,
        422,
        'validation',
        'Không đổi đường dẫn của sản phẩm đã từng hiển thị.',
        { field: 'slug' },
      );
    const kept = new Set(((input['variants'] as Json[]) ?? []).map((row) => row['id']));
    const dropped = (found['variants'] as { id: string; sku: string; hasOrders: boolean }[]).find(
      (row) => !kept.has(row.id) && row.hasOrders,
    );
    if (dropped)
      return this.error(route, 409, 'variant-in-use', 'Biến thể đã có đơn.', { sku: dropped.sku });
    const updated = this.build(input, found);
    this.products[this.products.indexOf(found)] = updated;
    return this.reply(route, 200, updated);
  }

  private bulkStatus(route: Route, input: Json) {
    const ids = input['ids'] as string[];
    const targets = ids.map((id) => this.products.find((item) => item['id'] === id));
    if (targets.some((item) => !item))
      return this.error(route, 404, 'not-found', 'Không tìm thấy.');
    if (input['status'] === 'active') {
      const bad = (targets as Json[]).find((item) => !(item['images'] as unknown[]).length);
      if (bad)
        return this.error(route, 422, 'publish-incomplete', 'Chưa đủ điều kiện.', {
          productId: bad['id'],
          missing: ['images'],
        });
    }
    let updated = 0;
    for (const item of targets as Json[]) {
      if (item['status'] !== input['status']) {
        item['status'] = input['status'];
        updated += 1;
      }
    }
    return this.reply(route, 200, { updated });
  }

  private upload(route: Route, raw: Buffer | null) {
    const head = raw?.subarray(0, 8).toString('hex') ?? '';
    if (head !== '89504e470d0a1a0a')
      return this.error(route, 422, 'invalid-image', 'Tệp không phải ảnh.', { reason: 'format' });
    // A PNG header says the width and height at bytes 16-23.
    const width = raw!.readUInt32BE(16);
    const height = raw!.readUInt32BE(20);
    if (Math.min(width, height) < 600)
      return this.error(route, 422, 'invalid-image', 'Ảnh quá nhỏ.', { reason: 'dimensions' });
    const id = `up-${'0123456789abcdef'.repeat(2)}.png`;
    return this.reply(route, 201, {
      id,
      url: `/api/media/${id}`,
      alt: '',
      color: '',
      width,
      height,
      size: raw!.length,
      contentType: 'image/png',
    });
  }

  // ---------- inventory ----------

  private filteredInventory(url: URL): Json[] {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const view = url.searchParams.get('view') ?? 'all';
    return this.inventory.filter(
      (item) =>
        (!q || String(item['sku']).toLowerCase().includes(q)) &&
        (view === 'all' || item['status'] === view),
    );
  }

  private facets(route: Route, url: URL) {
    const scoped = this.inventory.filter(
      (item) =>
        !url.searchParams.get('q') ||
        String(item['sku'])
          .toLowerCase()
          .includes(String(url.searchParams.get('q')).toLowerCase()),
    );
    const count = (status: string) => scoped.filter((item) => item['status'] === status).length;
    return this.reply(route, 200, {
      categories: [{ value: 'outerwear', label: 'Áo khoác' }],
      colors: [COLOR_BLACK],
      sizes: ['S', 'M', 'L', 'XL'],
      counts: { all: scoped.length, in: count('in'), low: count('low'), out: count('out') },
      defaultThreshold: 5,
      customCount: 0,
    });
  }

  private adjust(route: Route, variantId: string, input: Json, request: Request) {
    const key = request.headers()['idempotency-key'];
    if (!key)
      return this.error(route, 422, 'validation', 'Thiếu Idempotency-Key.', {
        field: 'Idempotency-Key',
      });
    const item = this.inventory.find((row) => row['variantId'] === variantId);
    if (!item) return this.error(route, 404, 'not-found', 'Không tìm thấy.');
    if (input['mode'] === 'set' && input['expectedAvailable'] !== item['available'])
      return this.error(route, 409, 'stock-changed', 'Tồn kho đã đổi.', {
        available: item['available'],
        reserved: item['reserved'],
      });
    const quantity = input['quantity'] as number;
    const reserved = item['reserved'] as number;
    const available =
      input['mode'] === 'set' ? quantity - reserved : (item['available'] as number) + quantity;
    item['available'] = available;
    item['onHand'] = available + reserved;
    item['status'] = available === 0 ? 'out' : available <= 5 ? 'low' : 'in';
    return this.reply(route, 200, item);
  }

  // ---------- promotions ----------

  private listPromotions(route: Route, url: URL) {
    const state = url.searchParams.get('state');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const matches = this.promotions.filter(
      (item) => !q || String(item['code']).toLowerCase().includes(q),
    );
    const count = (value: string) => matches.filter((item) => item['state'] === value).length;
    return this.reply(
      route,
      200,
      this.page(
        matches.filter((item) => !state || item['state'] === state),
        url,
        {
          all: matches.length,
          running: count('running'),
          scheduled: count('scheduled'),
          expired: count('expired'),
          disabled: count('disabled'),
        },
      ),
    );
  }

  private createPromotion(route: Route, input: Json) {
    if (this.promotions.some((item) => item['code'] === input['code']))
      return this.error(route, 409, 'duplicate', 'Mã đã tồn tại.', { field: 'code' });
    const created = promotion({
      ...input,
      id: `pr-new-${this.promotions.length}`,
      used: 0,
      hasRedemptions: false,
      state: 'running',
    });
    this.promotions.unshift(created);
    return this.reply(route, 201, created);
  }

  private updatePromotion(route: Route, found: Json, input: Json) {
    if (input['updatedAt'] !== found['updatedAt'])
      return this.error(route, 409, 'version-conflict', 'Dữ liệu đã đổi.');
    if (
      found['hasRedemptions'] &&
      (input['value'] !== found['value'] || input['type'] !== found['type'])
    )
      return this.error(route, 409, 'voucher-in-use', 'Mã đã được dùng; hãy tạo mã mới.');
    Object.assign(found, input, {
      updatedAt: new Date(Date.parse(String(found['updatedAt'])) + 1000).toISOString(),
    });
    return this.reply(route, 200, found);
  }
}

/** Switches the e2e build to the HTTP adapters and answers `/api/admin/**` with `api`. */
export async function useCatalogApi(page: Page, api = new CatalogApi()): Promise<CatalogApi> {
  await page.addInitScript(
    ([catalogKey, ordersKey]) => {
      localStorage.setItem(catalogKey, 'http');
      localStorage.setItem(ordersKey, 'contract-mock');
    },
    [CATALOG_MODE_KEY, ORDERS_MODE_KEY],
  );
  await page.route(/\/api\/admin\/(products|inventory|promotions|uploads)/, (route) =>
    api.handle(route),
  );
  return api;
}

/** Smallest PNG the fake accepts: the 8-byte signature and an IHDR with the given size. */
export function pngBytes(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
