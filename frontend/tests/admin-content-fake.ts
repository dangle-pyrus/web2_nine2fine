import { Page, Route } from '@playwright/test';

/**
 * Stand-in for the Slice 10 admin endpoints of docs/api/openapi.yaml: `/api/admin/reviews*`,
 * `/api/admin/content/home*`, `/api/admin/size-charts*`, `/api/admin/collections*` and
 * `/api/admin/sales/bulk*`. `useContentApi` switches the e2e build to the HTTP adapters
 * (`reviewsMode`, `contentMode`, `promotionsMode`) and answers the requests here.
 */
type Json = Record<string, unknown>;

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json | null;
}

const BASE = Date.parse('2026-11-12T03:00:00.000Z');

export class ContentApi {
  calls: Call[] = [];
  private tick = 0;
  /** Next write of the named kind answers `409 version-conflict` (once). */
  conflictOnce = new Set<'review' | 'home' | 'size-chart' | 'collection'>();
  /** Next `PUT /content/home` answers `422` with these field errors (once). */
  homeFieldErrors: { field: string; message: string }[] | null = null;
  chartFieldErrors: { field: string; message: string }[] | null = null;

  private stamp(): string {
    return new Date(BASE + ++this.tick * 1000).toISOString();
  }

  reviews: Json[] = [
    this.review('r1', 5, 'Mặc rất vừa', null),
    this.review('r2', 2, 'Hơi chật vai', null),
    this.review('r3', 4, 'Đáng tiền', { body: 'Cảm ơn bạn.', at: BASE, author: 'Admin' }),
  ];

  private review(
    id: string,
    rating: number,
    title: string,
    reply: { body: string; at: number; author: string } | null,
  ): Json {
    return {
      id,
      productId: '11111111-1111-4111-8111-111111111111',
      productName: 'Áo blazer linen',
      productSlug: 'ao-blazer-linen',
      productImage: 'catalog-placeholder',
      author: 'Nguyễn V.',
      rating,
      fit: 0,
      sizeBought: 'M',
      height: '1m62',
      title,
      body: 'Nội dung đánh giá đủ dài để đọc.',
      date: '2026-11-10',
      createdAt: new Date(BASE - Number(id.slice(1)) * 86_400_000).toISOString(),
      verified: true,
      status: 'visible',
      ...(reply ? { reply: { ...reply, at: new Date(reply.at).toISOString() } } : {}),
      updatedAt: new Date(BASE - 1000).toISOString(),
    };
  }

  home: Json = {
    categories: [{ label: 'Áo', href: '/shop/tops', mediaId: 'uniqlo-category-01' }],
    moments: [
      { moment: 'work', label: 'Đi làm', lines: ['Gọn gàng'], mediaId: 'editorial-story-0900' },
      { moment: 'dinner', label: 'Hẹn tối', lines: ['Cuộc hẹn'], mediaId: 'editorial-home-hero' },
      { moment: 'event', label: 'Sự kiện', lines: ['Nổi bật'], mediaId: 'editorial-new-drop' },
      {
        moment: 'weekend',
        label: 'Cuối tuần',
        lines: ['Thoải mái'],
        mediaId: 'editorial-home-hero',
      },
    ],
    blocks: [
      {
        kind: 'campaign',
        id: 'hero',
        eyebrow: 'Mới',
        title: 'From Nine to Fine.',
        description: 'Mô tả',
        href: '/new-in',
        mediaId: 'uniqlo-campaign-01',
        mobileMediaId: 'uniqlo-campaign-01',
      },
    ],
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
  };

  charts: Json[] = ['tops', 'bottoms', 'dresses', 'outerwear'].map((category, index) => ({
    category,
    label: ['Áo', 'Quần', 'Váy', 'Áo khoác'][index],
    productCount: 3,
    customised: false,
    updatedAt: null,
    updatedBy: null,
    chart: {
      body: [{ size: 'S', values: { Ngực: '82' } }],
      garment: [{ size: 'S', values: { Dài: '60' } }],
      bodyColumns: ['Ngực'],
      garmentColumns: ['Dài'],
    },
  }));

  collections: Json[] = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Thu Đông 2026',
      slug: 'thu-dong-2026',
      description: '',
      status: 'active',
      productIds: [],
      slugLocked: true,
      createdAt: '2026-10-01T03:00:00.000Z',
      updatedAt: '2026-10-20T03:00:00.000Z',
      updatedBy: { name: 'Admin' },
    },
  ];

  find(method: string, pattern: RegExp): Call[] {
    return this.calls.filter((call) => call.method === method && pattern.test(call.path));
  }

  async handle(route: Route, role: 'admin' | 'staff'): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const method = request.method();
    const body = request.postDataJSON() as Json | null;
    this.calls.push({ method, path, query: url.searchParams, body });
    const json = (status: number, data?: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: data === undefined ? '' : JSON.stringify(data),
      });
    const error = (status: number, code: string, extra: Json = {}) =>
      json(status, { error: { code, message: '', ...extra } });
    const write = method !== 'GET';
    // Only admins write content (BR-P1-03); a staff write is refused before the body is read.
    const adminOnly =
      /^\/(content|size-charts|collections|sales)/.test(path) && write && role !== 'admin';
    if (adminOnly) return error(403, 'forbidden');

    if (path === '/reviews' && method === 'GET') return json(200, this.reviewPage(url));
    let match = /^\/reviews\/([^/]+)\/(hide|show|reply)$/.exec(path);
    if (match) {
      const item = this.reviews.find((review) => review['id'] === match![1]);
      if (!item) return error(404, 'not-found');
      if (this.conflictOnce.delete('review') || body?.['updatedAt'] !== item['updatedAt'])
        return error(409, 'version-conflict');
      if (match[2] === 'hide') {
        const reason = String(body?.['reason'] ?? '').trim();
        if (reason.length < 5) return error(422, 'validation', { field: 'reason' });
        Object.assign(item, {
          status: 'hidden',
          hiddenReason: reason,
          hiddenAt: this.stamp(),
          hiddenBy: { name: 'Admin' },
        });
      } else if (match[2] === 'show') {
        item['status'] = 'visible';
        delete item['hiddenReason'];
        delete item['hiddenAt'];
        delete item['hiddenBy'];
      } else if (body?.['body'] === null) delete item['reply'];
      else item['reply'] = { body: body?.['body'], at: this.stamp(), author: 'Admin' };
      item['updatedAt'] = this.stamp();
      return json(200, item);
    }

    if (path === '/content/home' && method === 'GET') return json(200, this.home);
    if (path === '/content/home' && method === 'PUT') {
      if (this.homeFieldErrors) {
        const fieldErrors = this.homeFieldErrors;
        this.homeFieldErrors = null;
        return error(422, 'validation', { fieldErrors });
      }
      if (this.conflictOnce.delete('home') || body?.['updatedAt'] !== this.home['updatedAt']) {
        this.home = {
          ...this.home,
          blocks: [{ ...(this.home['blocks'] as Json[])[0], title: 'Bản từ máy chủ' }],
          isDefault: false,
          updatedAt: this.stamp(),
          updatedBy: { name: 'Admin khác' },
        };
        return error(409, 'version-conflict', { current: this.home });
      }
      this.home = {
        categories: body?.['categories'],
        moments: body?.['moments'],
        blocks: body?.['blocks'],
        isDefault: false,
        updatedAt: this.stamp(),
        updatedBy: { name: 'Admin' },
      };
      return json(200, this.home);
    }
    if (path === '/content/home/reset' && method === 'POST') {
      this.home = {
        ...this.home,
        isDefault: true,
        updatedAt: this.stamp(),
        updatedBy: { name: 'Admin' },
      };
      return json(200, this.home);
    }

    if (path === '/size-charts' && method === 'GET') return json(200, { items: this.charts });
    match = /^\/size-charts\/([^/]+)$/.exec(path);
    if (match && method === 'PUT') {
      const chart = this.charts.find((item) => item['category'] === match![1]);
      if (!chart) return error(404, 'not-found');
      if (this.chartFieldErrors) {
        const fieldErrors = this.chartFieldErrors;
        this.chartFieldErrors = null;
        return error(422, 'validation', { fieldErrors });
      }
      if (this.conflictOnce.delete('size-chart') || body?.['updatedAt'] !== chart['updatedAt'])
        return error(409, 'version-conflict', { current: chart });
      Object.assign(chart, {
        chart: {
          body: body?.['body'],
          garment: body?.['garment'],
          bodyColumns: body?.['bodyColumns'],
          garmentColumns: body?.['garmentColumns'],
        },
        customised: true,
        updatedAt: this.stamp(),
        updatedBy: { name: 'Admin' },
      });
      return json(200, chart);
    }

    if (path === '/collections' && method === 'GET') return json(200, { items: this.collections });
    if (path === '/collections' && method === 'POST') {
      const slug = String(body?.['slug'] ?? '');
      if (this.collections.some((item) => item['slug'] === slug))
        return error(409, 'duplicate', { field: 'slug' });
      const now = this.stamp();
      const created = {
        id: `33333333-3333-4333-8333-${String(this.collections.length).padStart(12, '0')}`,
        name: body?.['name'],
        slug,
        description: body?.['description'] ?? '',
        status: body?.['status'] ?? 'draft',
        productIds: body?.['productIds'] ?? [],
        slugLocked: body?.['status'] === 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: { name: 'Admin' },
      };
      this.collections.push(created);
      return json(201, created);
    }

    if (path === '/sales/bulk/preview' || path === '/sales/bulk') {
      const result = {
        applicable: [
          {
            productId: 'a1',
            name: 'Áo thun trắng',
            slug: 'ao-thun-trang',
            price: 300000,
            salePrice: 240000,
          },
        ],
        skipped: [
          {
            productId: 'a2',
            name: 'Áo blazer',
            slug: 'ao-blazer',
            price: 1000000,
            salePrice: 800000,
            reason: 'sale-running',
          },
        ],
        applied: path === '/sales/bulk' ? 1 : 0,
      };
      return json(200, result);
    }
    return error(404, 'not-found');
  }

  private reviewPage(url: URL): Json {
    const view = url.searchParams.get('view') ?? 'all';
    const rating = Number(url.searchParams.get('rating') ?? 0);
    const visible = this.reviews.filter((item) => item['status'] === 'visible');
    const unanswered = (item: Json) => item['status'] === 'visible' && !item['reply'];
    const items = this.reviews.filter(
      (item) =>
        (view === 'all' ||
          (view === 'unanswered' && unanswered(item)) ||
          (view === 'low' && (item['rating'] as number) <= 2) ||
          (view === 'hidden' && item['status'] === 'hidden')) &&
        (!rating || item['rating'] === rating),
    );
    return {
      items,
      total: items.length,
      page: 1,
      limit: Number(url.searchParams.get('limit') ?? 20),
      counts: {
        all: this.reviews.length,
        unanswered: this.reviews.filter(unanswered).length,
        low: this.reviews.filter((item) => (item['rating'] as number) <= 2).length,
        hidden: this.reviews.length - visible.length,
      },
      average: visible.length
        ? visible.reduce((sum, item) => sum + (item['rating'] as number), 0) / visible.length
        : null,
    };
  }
}

/** Switches the e2e build to the HTTP adapters of Slice 10 (admin side) and answers with `api`. */
export async function useContentApi(
  page: Page,
  role: 'admin' | 'staff',
  api = new ContentApi(),
): Promise<ContentApi> {
  await page.addInitScript(() => {
    for (const flag of ['reviewsMode', 'contentMode', 'promotionsMode'])
      localStorage.setItem(`n2f.e2e.${flag}`, 'http');
    localStorage.setItem('n2f.e2e.adminOrdersMode', 'contract-mock');
  });
  await page.route(/\/api\/admin\/(reviews|content|size-charts|collections|sales)/, (route) =>
    api.handle(route, role),
  );
  return api;
}
