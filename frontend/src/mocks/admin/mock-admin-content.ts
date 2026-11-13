import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AdminSession } from '../../app/admin/core/admin-session';
import { ADMIN_PRODUCTS_API } from '../../app/admin/data-access/admin-apis';
import {
  AdminCollection,
  AdminContentApi,
  AdminHomeContent,
  AdminReview,
  AdminReviewPage,
  AdminReviewQuery,
  AdminReviewsApi,
  AdminSalesApi,
  AdminSizeChart,
  BulkSaleInput,
  BulkSaleItem,
  BulkSaleResult,
  CollectionInput,
  ContentConflictError,
  HOME_MOMENTS,
  HomeBlock,
  HomeContentInput,
  SizeChartTables,
} from '../../app/admin/data-access/content-api';
import { AdminApiError } from '../../app/admin/data-access/models';
import { defaultMessage } from '../../app/admin/data-access/http-support';
import type { LandingContent } from '../../app/features/home/landing-content';
import { fail, respond } from '../mock-latency';
import { MockStorefrontContent } from '../mock-storefront-content';
import { clone, invalid, notFound } from './admin-mock-db';

/** Strictly increasing ISO time, like the server's `updatedAt`. */
let lastStamp = 0;
function stamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

function conflict<T>(current: T): ContentConflictError<T> {
  return new ContentConflictError(
    new AdminApiError('version-conflict', defaultMessage('version-conflict')),
    current,
  );
}

const HREF = /^\/[^/\\\s][^\\\s]*$|^\/$/;

// ---------- Reviews ----------

function review(
  n: number,
  partial: Partial<AdminReview> & Pick<AdminReview, 'rating' | 'title' | 'body'>,
): AdminReview {
  const createdAt = new Date(Date.UTC(2026, 10, 12 - n, 3)).toISOString();
  return {
    id: `r${n}`,
    productId: 'p01',
    productName: 'Áo blazer dáng suông',
    productSlug: 'ao-blazer-dang-suong',
    productImage: 'uniqlo-product-1-1-09',
    author: 'Nguyễn V.',
    fit: 0,
    sizeBought: 'M',
    height: '1m62',
    date: createdAt.slice(0, 10),
    createdAt,
    verified: true,
    status: 'visible',
    updatedAt: createdAt,
    ...partial,
  };
}

@Injectable({ providedIn: 'root' })
export class MockAdminReviewsApi implements AdminReviewsApi {
  private readonly session = inject(AdminSession);
  private rows: AdminReview[] = [
    review(1, { rating: 5, title: 'Mặc rất vừa', body: 'Form đẹp, vải mát, mặc đi làm rất ổn.' }),
    review(2, {
      rating: 2,
      title: 'Hơi chật vai',
      body: 'Mình mặc size M nhưng vai hơi chật, nên lấy lên một size.',
      fit: -1,
      author: 'Trần H.',
    }),
    review(3, {
      rating: 4,
      title: 'Đáng tiền',
      body: 'Chất vải tốt, giao nhanh.',
      reply: {
        body: 'Cảm ơn bạn đã ủng hộ nine2fine.',
        at: '2026-11-10T04:00:00.000Z',
        author: 'Admin',
      },
    }),
    review(4, {
      rating: 1,
      title: 'Không như mong đợi',
      body: 'Màu thực tế khác ảnh khá nhiều.',
      status: 'hidden',
      hiddenReason: 'Chứa lời lẽ không phù hợp',
      hiddenAt: '2026-11-09T04:00:00.000Z',
      hiddenBy: { name: 'Admin' },
      author: 'Lê K.',
    }),
    review(5, {
      rating: 5,
      title: 'Rất thích',
      body: 'Mặc thoải mái cả ngày dài.',
      author: 'Phạm M.',
    }),
  ];

  list(query: AdminReviewQuery) {
    const low = (row: AdminReview) => row.rating <= 2;
    const unanswered = (row: AdminReview) => row.status === 'visible' && !row.reply;
    const matchView = (row: AdminReview) =>
      query.view === 'all' ||
      (query.view === 'unanswered' && unanswered(row)) ||
      (query.view === 'low' && low(row)) ||
      (query.view === 'hidden' && row.status === 'hidden');
    const matched = this.rows
      .filter((row) => matchView(row) && (!query.rating || row.rating === query.rating))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const visible = this.rows.filter((row) => row.status === 'visible');
    const page: AdminReviewPage = {
      items: clone(matched.slice((query.page - 1) * query.limit, query.page * query.limit)),
      total: matched.length,
      page: query.page,
      limit: query.limit,
      counts: {
        all: this.rows.length,
        unanswered: this.rows.filter(unanswered).length,
        low: this.rows.filter(low).length,
        hidden: this.rows.length - visible.length,
      },
      average: visible.length
        ? Math.round((visible.reduce((sum, row) => sum + row.rating, 0) / visible.length) * 10) / 10
        : null,
    };
    return respond(page);
  }

  hide(id: string, reason: string, updatedAt: string) {
    const text = reason.trim();
    if (text.length < 5 || text.length > 250)
      return fail(invalid('', { reason: 'Lý do từ 5 đến 250 ký tự.' }));
    return this.write(id, updatedAt, (row) => {
      if (row.status === 'hidden') return;
      row.status = 'hidden';
      row.hiddenReason = text;
      row.hiddenAt = stamp();
      row.hiddenBy = { name: this.actor() };
    });
  }

  show(id: string, updatedAt: string) {
    return this.write(id, updatedAt, (row) => {
      if (row.status === 'visible') return;
      row.status = 'visible';
      delete row.hiddenReason;
      delete row.hiddenAt;
      delete row.hiddenBy;
    });
  }

  reply(id: string, body: string | null, updatedAt: string) {
    const text = body?.trim() ?? null;
    if (text !== null && (text.length < 5 || text.length > 500))
      return fail(invalid('', { body: 'Phản hồi từ 5 đến 500 ký tự.' }));
    return this.write(id, updatedAt, (row) => {
      if (text === null) delete row.reply;
      else row.reply = { body: text, at: stamp(), author: this.actor() };
    });
  }

  private actor(): string {
    return this.session.user()?.name ?? 'Nhân viên';
  }

  private write(id: string, updatedAt: string, change: (row: AdminReview) => void) {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return fail(notFound('đánh giá'));
    if (row.updatedAt !== updatedAt) return fail(conflict(clone(row)));
    const before = JSON.stringify(row);
    change(row);
    if (JSON.stringify(row) !== before) row.updatedAt = stamp();
    return respond(clone(row));
  }
}

// ---------- Content ----------

/** The storefront mock keeps the shop's home page; the admin mock reads and writes it. */
function fromLanding(
  landing: LandingContent,
): Pick<AdminHomeContent, 'categories' | 'moments' | 'blocks'> {
  return {
    categories: landing.categories,
    moments: HOME_MOMENTS.map((moment, index) => {
      const card = landing.moments[index];
      return {
        moment,
        label: card?.label ?? moment,
        lines: card?.lines?.length ? card.lines : [card?.label ?? moment],
        mediaId: card?.mediaId ?? landing.categories[0]?.mediaId ?? 'catalog-placeholder',
      };
    }),
    blocks: landing.blocks as unknown as HomeBlock[],
  };
}

function toLanding(input: HomeContentInput): LandingContent {
  return {
    categories: input.categories,
    moments: input.moments.map((item) => ({
      label: item.label,
      href: `/shop-by-moment/${item.moment}`,
      moment: item.moment,
      lines: item.lines,
      mediaId: item.mediaId,
    })),
    blocks: input.blocks as unknown as LandingContent['blocks'],
  };
}

function homeErrors(input: HomeContentInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const href = (path: string, value: string) => {
    if (!HREF.test(value)) errors[path] = 'Chỉ nhận đường dẫn nội bộ, bắt đầu bằng "/".';
  };
  if (input.blocks.length > 16) errors['blocks'] = 'Tối đa 16 khối.';
  const ids = new Set<string>();
  input.blocks.forEach((block: HomeBlock, i) => {
    const at = `blocks[${i}]`;
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(block.id)) errors[`${at}.id`] = 'Mã khối không hợp lệ.';
    if (ids.has(block.id)) errors[`${at}.id`] = 'Mã khối bị trùng.';
    ids.add(block.id);
    if (block.kind === 'campaign') {
      if (!block.title.trim()) errors[`${at}.title`] = 'Nhập tiêu đề.';
      else if (block.title.length > 80) errors[`${at}.title`] = 'Tối đa 80 ký tự.';
      if (block.description.length > 200) errors[`${at}.description`] = 'Tối đa 200 ký tự.';
      if (block.eyebrow.length > 40) errors[`${at}.eyebrow`] = 'Tối đa 40 ký tự.';
      href(`${at}.href`, block.href);
    } else if (block.kind === 'shop') {
      if (!block.label.trim()) errors[`${at}.label`] = 'Nhập tên dải.';
      href(`${at}.href`, block.href);
    } else if (block.kind === 'products') {
      if (!block.label.trim()) errors[`${at}.label`] = 'Nhập tên khối.';
      if (block.cards.length > 6) errors[`${at}.cards`] = 'Tối đa 6 thẻ.';
      block.cards.forEach((card, j) => href(`${at}.cards[${j}].href`, card.href));
    }
  });
  if (!input.categories.length || input.categories.length > 8)
    errors['categories'] = 'Cần từ 1 đến 8 danh mục.';
  input.categories.forEach((item, i) => {
    if (!item.label.trim() || item.label.length > 40)
      errors[`categories[${i}].label`] = 'Tên từ 1 đến 40 ký tự.';
    href(`categories[${i}].href`, item.href);
  });
  if (
    input.moments.length !== 4 ||
    input.moments.some((item, i) => item.moment !== HOME_MOMENTS[i])
  )
    errors['moments'] = 'Cần đúng 4 thẻ theo thứ tự Đi làm, Hẹn tối, Sự kiện, Cuối tuần.';
  input.moments.forEach((item, i) => {
    if (!item.label.trim() || item.label.length > 40)
      errors[`moments[${i}].label`] = 'Tên từ 1 đến 40 ký tự.';
    if (!item.lines.length || item.lines.length > 2)
      errors[`moments[${i}].lines`] = 'Cần 1 hoặc 2 dòng chữ.';
    item.lines.forEach((line, j) => {
      if (!line.trim() || line.length > 60)
        errors[`moments[${i}].lines[${j}]`] = 'Từ 1 đến 60 ký tự.';
    });
  });
  return errors;
}

const SIZE_CATEGORIES: Record<string, string> = {
  tops: 'Áo',
  bottoms: 'Quần',
  dresses: 'Váy',
  outerwear: 'Áo khoác',
};

function sizeChart(category: string): AdminSizeChart {
  const columns = ['Ngực', 'Eo'];
  const row = (size: string, a: string, b: string) => ({ size, values: { Ngực: a, Eo: b } });
  return {
    category,
    label: SIZE_CATEGORIES[category],
    productCount: 6,
    customised: false,
    updatedAt: null,
    updatedBy: null,
    chart: {
      body: [row('S', '82–86', '64–68'), row('M', '86–90', '68–72')],
      garment: [row('S', '92', '70'), row('M', '96', '74')],
      bodyColumns: [...columns],
      garmentColumns: [...columns],
    },
  };
}

function chartErrors(chart: SizeChartTables): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [table, columnsKey] of [
    ['body', 'bodyColumns'],
    ['garment', 'garmentColumns'],
  ] as const) {
    const rows = chart[table];
    const columns = chart[columnsKey];
    if (!rows.length || rows.length > 12) errors[table] = 'Cần từ 1 đến 12 hàng.';
    if (!columns.length || columns.length > 8) errors[columnsKey] = 'Cần từ 1 đến 8 cột.';
    columns.forEach((name, c) => {
      if (!name.trim() || name.length > 20)
        errors[`${columnsKey}[${c}]`] = 'Tên cột từ 1 đến 20 ký tự.';
      else if (columns.indexOf(name) !== c) errors[`${columnsKey}[${c}]`] = 'Tên cột bị trùng.';
    });
    rows.forEach((row, r) => {
      if (!row.size.trim() || row.size.length > 10)
        errors[`${table}[${r}].size`] = 'Size từ 1 đến 10 ký tự.';
      for (const name of columns)
        if (!(row.values[name] ?? '').trim())
          errors[`${table}[${r}].values.${name}`] = 'Nhập số đo.';
    });
  }
  return errors;
}

@Injectable({ providedIn: 'root' })
export class MockAdminContentApi implements AdminContentApi {
  private readonly session = inject(AdminSession);
  private readonly storefront = inject(MockStorefrontContent);
  private meta: Pick<AdminHomeContent, 'isDefault' | 'updatedAt' | 'updatedBy'> = {
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
  };
  private charts = Object.keys(SIZE_CATEGORIES).map(sizeChart);
  private collectionRows: AdminCollection[] = [
    {
      id: 'c1',
      name: 'Thu Đông 2026',
      slug: 'thu-dong-2026',
      description: 'Lớp khoác và áo len cho mùa lạnh.',
      status: 'active',
      productIds: ['p01', 'p02'],
      slugLocked: true,
      createdAt: '2026-10-01T03:00:00.000Z',
      updatedAt: '2026-10-20T03:00:00.000Z',
      updatedBy: { name: 'Admin' },
    },
  ];

  private actor(): { name: string } {
    return { name: this.session.user()?.name ?? 'Quản trị viên' };
  }

  private get home(): AdminHomeContent {
    return { ...fromLanding(this.storefront.home()), ...this.meta };
  }

  getHome() {
    return respond(clone(this.home));
  }

  saveHome(input: HomeContentInput) {
    if (input.updatedAt !== this.meta.updatedAt) return fail(conflict(clone(this.home)));
    const errors = homeErrors(input);
    if (Object.keys(errors).length) return fail(invalid('', errors));
    this.storefront.saveHome(toLanding(input));
    this.meta = { isDefault: false, updatedAt: stamp(), updatedBy: this.actor() };
    return respond(clone(this.home));
  }

  resetHome(updatedAt: string | null) {
    if (updatedAt !== this.meta.updatedAt) return fail(conflict(clone(this.home)));
    this.storefront.saveHome(null);
    this.meta = { isDefault: true, updatedAt: stamp(), updatedBy: this.actor() };
    return respond(clone(this.home));
  }

  sizeCharts() {
    return respond(clone(this.charts));
  }

  saveSizeChart(category: string, chart: SizeChartTables, updatedAt: string | null) {
    const current = this.charts.find((item) => item.category === category);
    if (!current) return fail(notFound('bảng size'));
    if (current.updatedAt !== updatedAt) return fail(conflict(clone(current)));
    const errors = chartErrors(chart);
    if (Object.keys(errors).length) return fail(invalid('', errors));
    current.chart = clone(chart);
    current.customised = true;
    current.updatedAt = stamp();
    current.updatedBy = this.actor();
    return respond(clone(current));
  }

  collections() {
    return respond(
      clone([...this.collectionRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );
  }

  createCollection(input: CollectionInput) {
    const checked = this.check(input, null);
    if (checked) return fail(checked);
    const now = stamp();
    const row: AdminCollection = {
      id: `c${Date.now().toString(36)}`,
      name: input.name.trim(),
      slug: input.slug || slugOf(input.name),
      description: input.description,
      status: input.status,
      productIds: [...input.productIds],
      slugLocked: input.status === 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: this.actor(),
    };
    this.collectionRows.push(row);
    return respond(clone(row));
  }

  updateCollection(id: string, input: CollectionInput, updatedAt: string) {
    const row = this.collectionRows.find((item) => item.id === id);
    if (!row) return fail(notFound('bộ sưu tập'));
    if (row.updatedAt !== updatedAt) return fail(conflict(clone(row)));
    const checked = this.check(input, row);
    if (checked) return fail(checked);
    row.name = input.name.trim();
    row.slug = row.slugLocked ? row.slug : input.slug || slugOf(input.name);
    row.description = input.description;
    row.status = input.status;
    row.productIds = [...input.productIds];
    if (input.status === 'active') row.slugLocked = true;
    row.updatedAt = stamp();
    row.updatedBy = this.actor();
    return respond(clone(row));
  }

  removeCollection(id: string) {
    if (!this.collectionRows.some((item) => item.id === id)) return fail(notFound('bộ sưu tập'));
    this.collectionRows = this.collectionRows.filter((item) => item.id !== id);
    return respond(undefined);
  }

  private check(input: CollectionInput, existing: AdminCollection | null): AdminApiError | null {
    const errors: Record<string, string> = {};
    const name = input.name.trim();
    if (!name || name.length > 80) errors['name'] = 'Tên từ 1 đến 80 ký tự.';
    const slug = input.slug || slugOf(name);
    if (!/^[a-z0-9-]{2,50}$/.test(slug))
      errors['slug'] = 'Đường dẫn từ 2 đến 50 ký tự a-z, 0-9 và "-".';
    if (existing?.slugLocked && slug !== existing.slug)
      errors['slug'] = 'Đường dẫn đã hiển thị nên không đổi được.';
    if (input.description.length > 300) errors['description'] = 'Tối đa 300 ký tự.';
    if (input.productIds.length > 200) errors['productIds'] = 'Tối đa 200 sản phẩm.';
    if (Object.keys(errors).length) return invalid('', errors);
    if (this.collectionRows.some((item) => item.slug === slug && item.id !== existing?.id))
      return new AdminApiError('duplicate', 'Đường dẫn này đã có bộ sưu tập khác dùng.', {
        slug: 'Đường dẫn này đã có bộ sưu tập khác dùng.',
      });
    return null;
  }
}

function slugOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// ---------- Bulk sale ----------

@Injectable({ providedIn: 'root' })
export class MockAdminSalesApi implements AdminSalesApi {
  private readonly products = inject(ADMIN_PRODUCTS_API);

  preview(input: BulkSaleInput) {
    return this.compute(input, false);
  }

  apply(input: BulkSaleInput) {
    return this.compute(input, true);
  }

  private compute(input: BulkSaleInput, apply: boolean): Observable<BulkSaleResult> {
    const errors: Record<string, string> = {};
    if (!SIZE_CATEGORIES[input.category]) errors['category'] = 'Chọn danh mục.';
    if (!Number.isInteger(input.percent) || input.percent < 5 || input.percent > 70)
      errors['percent'] = 'Phần trăm từ 5 đến 70.';
    const days = (Date.parse(input.endsOn) - Date.parse(input.startsOn)) / 86_400_000;
    if (!input.startsOn) errors['startsOn'] = 'Chọn ngày bắt đầu.';
    if (!input.endsOn) errors['endsOn'] = 'Chọn ngày kết thúc.';
    else if (days < 0 || days > 89)
      errors['endsOn'] = 'Ngày kết thúc từ ngày bắt đầu, tối đa 90 ngày.';
    if (Object.keys(errors).length) return fail(invalid('', errors));
    return this.products
      .list({
        view: 'active',
        category: input.category,
        page: 1,
        pageSize: 200,
        search: '',
        sort: 'name',
        dir: 'asc',
      })
      .pipe(
        map((page) => {
          const applicable: BulkSaleItem[] = [];
          const skipped: BulkSaleItem[] = [];
          for (const product of page.items) {
            const salePrice =
              Math.floor((product.price * (100 - input.percent)) / 100 / 1000) * 1000;
            const item: BulkSaleItem = {
              productId: product.id,
              name: product.name,
              slug: product.slug ?? product.id,
              price: product.price,
              salePrice,
            };
            if (salePrice < 1000) skipped.push({ ...item, reason: 'below-minimum' });
            else if (salePrice >= product.price) skipped.push({ ...item, reason: 'not-reduced' });
            else applicable.push(item);
          }
          return { applicable, skipped, applied: apply ? applicable.length : 0 };
        }),
      );
  }
}
