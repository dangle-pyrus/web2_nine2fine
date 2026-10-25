import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CATEGORIES, Category } from '../../app/features/catalog/models/product';
import { RETURN_REASONS } from '../../app/admin/core/status';
import type { AdminReportsApi, AdminStorefrontApi } from '../../app/admin/data-access/admin-apis';
import type {
  AdminCollection,
  AdminReview,
  AdminSizeChart,
  CollectionInput,
  LandingContent,
  ReportRange,
  ReviewQuery,
  ReviewStats,
  ReviewStatus,
  SalesReport,
  SizeChart,
} from '../../app/admin/data-access/models';
import { MockCatalogApi } from '../mock-catalog-api';
import { fail, respond } from '../mock-latency';
import { MockStorefrontContent, StoredCollection } from '../mock-storefront-content';
import { PRODUCTS } from '../products';
import { AdminMockDb, invalid, matches, notFound, paginate } from './admin-mock-db';

const DAY = 86_400_000;
/** Storefront product id `01` ↔ admin product id `p01`. */
const adminId = (id: string) => `p${id}`;
const shopId = (id: string) => id.replace(/^p/, '');

/** Frontend-only storefront content (Đợt 3), backed by the storefront mocks of the same tab. */
@Injectable({ providedIn: 'root' })
export class MockAdminStorefrontApi implements AdminStorefrontApi {
  private readonly db = inject(AdminMockDb);
  private readonly content = inject(MockStorefrontContent);
  private readonly catalog = inject(MockCatalogApi);

  getHome() {
    return respond(this.content.home());
  }

  saveHome(content: LandingContent) {
    for (const block of content.blocks) {
      if (block.kind === 'campaign' && !block.title.trim())
        return fail(invalid('Banner nào cũng cần tiêu đề.', { [block.id]: 'Nhập tiêu đề.' }));
      if ((block.kind === 'shop' || block.kind === 'products') && !block.label.trim())
        return fail(invalid('Dải sản phẩm nào cũng cần tên.', { [block.id]: 'Nhập tên dải.' }));
    }
    this.content.saveHome(content);
    this.log('Cập nhật nội dung trang chủ');
    return respond(this.content.home());
  }

  resetHome() {
    this.content.saveHome(null);
    this.log('Khôi phục nội dung trang chủ mặc định');
    return respond(this.content.home());
  }

  reviews(query: ReviewQuery) {
    const items = this.allReviews().filter(
      (review) =>
        (query.view === 'all' ||
          (query.view === 'unanswered' && !review.reply && review.status === 'published') ||
          (query.view === 'low' && review.rating <= 3) ||
          (query.view === 'hidden' && review.status === 'hidden')) &&
        (!query.rating || review.rating === query.rating) &&
        matches(query.search, review.productName, review.author, review.title, review.body),
    );
    return respond(
      paginate(
        items,
        query,
        { date: (review) => review.date, rating: (review) => review.rating },
        'date',
      ),
    );
  }

  reviewStats(): Observable<ReviewStats> {
    const all = this.allReviews();
    const published = all.filter((review) => review.status === 'published');
    return respond({
      total: all.length,
      average: published.length
        ? Math.round(
            (published.reduce((sum, review) => sum + review.rating, 0) / published.length) * 10,
          ) / 10
        : 0,
      unanswered: published.filter((review) => !review.reply).length,
      low: all.filter((review) => review.rating <= 3).length,
      hidden: all.length - published.length,
    });
  }

  setReviewStatus(ids: string[], status: ReviewStatus) {
    for (const id of ids) {
      const entry = (this.content.moderation[id] ??= {});
      if (status === 'hidden') entry.hidden = true;
      else delete entry.hidden;
    }
    this.log(status === 'hidden' ? `Ẩn ${ids.length} đánh giá` : `Hiện ${ids.length} đánh giá`);
    return respond(undefined);
  }

  replyReview(id: string, body: string) {
    const target = this.allReviews().find((review) => review.id === id);
    if (!target) return fail(notFound('đánh giá'));
    if (body.trim().length > 1000)
      return fail(invalid('Phản hồi tối đa 1.000 ký tự.', { body: 'Rút gọn phản hồi.' }));
    const entry = (this.content.moderation[id] ??= {});
    if (body.trim())
      entry.reply = { body: body.trim(), at: new Date().toISOString(), author: this.db.actor() };
    else delete entry.reply;
    this.log(body.trim() ? 'Trả lời đánh giá' : 'Xóa phản hồi đánh giá', target.productName);
    return respond(this.allReviews().find((review) => review.id === id)!);
  }

  collections() {
    return respond(this.content.collections.map((item) => this.toCollection(item)));
  }

  saveCollection(id: string | null, input: CollectionInput) {
    const name = input.name.trim();
    const slug = input.slug.trim();
    const fields: Record<string, string> = {};
    if (!name) fields['name'] = 'Nhập tên bộ sưu tập.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      fields['slug'] = 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';
    else if (this.content.collections.some((item) => item.slug === slug && item.id !== id))
      fields['slug'] = 'Đường dẫn này đã được dùng.';
    if (Object.keys(fields).length) return fail(invalid('Kiểm tra lại bộ sưu tập.', fields));
    const value: StoredCollection = {
      id: id ?? `c${Date.now().toString(36)}`,
      name,
      slug,
      description: input.description.trim(),
      status: input.status,
      productIds: [...new Set(input.productIds.map(shopId))],
      updatedAt: new Date().toISOString(),
    };
    const index = this.content.collections.findIndex((item) => item.id === id);
    if (id && index < 0) return fail(notFound('bộ sưu tập'));
    if (index < 0) this.content.collections.unshift(value);
    else this.content.collections[index] = value;
    this.log(id ? 'Sửa bộ sưu tập' : 'Tạo bộ sưu tập', name);
    return respond(this.toCollection(value));
  }

  removeCollection(id: string) {
    const index = this.content.collections.findIndex((item) => item.id === id);
    if (index < 0) return fail(notFound('bộ sưu tập'));
    const [removed] = this.content.collections.splice(index, 1);
    this.log('Xóa bộ sưu tập', removed.name);
    return respond(undefined);
  }

  setProductCollections(productId: string, collectionIds: string[]) {
    const id = shopId(productId);
    for (const item of this.content.collections) {
      const has = item.productIds.includes(id);
      const wanted = collectionIds.includes(item.id);
      if (has === wanted) continue;
      item.productIds = wanted
        ? [...item.productIds, id]
        : item.productIds.filter((value) => value !== id);
      item.updatedAt = new Date().toISOString();
    }
    return this.collections();
  }

  sizeCharts() {
    return respond(CATEGORIES.map((category) => this.toSizeChart(category.value)));
  }

  saveSizeChart(category: string, chart: SizeChart) {
    if (!isCategory(category)) return fail(notFound('bảng size'));
    const sizes = chart.body.map((row) => row.size.trim());
    if (sizes.some((size) => !size) || new Set(sizes).size !== sizes.length)
      return fail(invalid('Mỗi dòng cần một size, không trùng nhau.'));
    this.content.sizeCharts[category] = structuredClone(chart);
    this.log('Sửa bảng size', CATEGORIES.find((item) => item.value === category)?.label);
    return respond(this.toSizeChart(category));
  }

  resetSizeChart(category: string) {
    if (!isCategory(category)) return fail(notFound('bảng size'));
    delete this.content.sizeCharts[category];
    this.log('Khôi phục bảng size mặc định', category);
    return respond(this.toSizeChart(category));
  }

  private allReviews(): AdminReview[] {
    return PRODUCTS.flatMap((product) => {
      const admin = this.db.data.products.find((item) => item.id === adminId(product.id));
      return this.catalog.allReviews(product.id).map((review): AdminReview => {
        const moderation = this.content.moderation[review.id];
        return {
          id: review.id,
          productId: adminId(product.id),
          productName: admin?.name ?? product.name,
          productImage: admin?.images[0]?.url ?? '',
          author: review.author,
          rating: review.rating,
          fit: review.fit,
          sizeBought: review.sizeBought,
          title: review.title,
          body: review.body,
          date: review.date,
          verified: !!review.verified,
          sample: !!review.sample,
          status: moderation?.hidden ? 'hidden' : 'published',
          reply: moderation?.reply,
        };
      });
    });
  }

  private toCollection(item: StoredCollection): AdminCollection {
    return { ...structuredClone(item), productIds: item.productIds.map(adminId) };
  }

  private toSizeChart(category: Category): AdminSizeChart {
    return {
      category,
      label: CATEGORIES.find((item) => item.value === category)?.label ?? category,
      chart: this.content.sizeChart(category),
      productCount: this.db.data.products.filter((product) => product.category === category).length,
      customised: !!this.content.sizeCharts[category],
    };
  }

  private log(action: string, label = 'Trang chủ'): void {
    this.db.log({ action, target: { type: 'settings', id: 'storefront', label } });
  }
}

function isCategory(value: string): value is Category {
  return CATEGORIES.some((item) => item.value === value);
}

const SOLD = new Set([
  'processing',
  'shipping',
  'delivering',
  'delivery-failed',
  'completed',
  'return-requested',
  'returned',
]);
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Reports (Đợt 3) computed from the mock orders, products and promotions. */
@Injectable({ providedIn: 'root' })
export class MockAdminReportsApi implements AdminReportsApi {
  private readonly db = inject(AdminMockDb);

  sales(range: ReportRange): Observable<SalesReport> {
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const now = Date.now();
    const since = now - days * DAY;
    const { orders, products, promotions } = this.db.data;
    const sold = orders.filter((order) => SOLD.has(order.status));
    const inRange = sold.filter((order) => Date.parse(order.placedAt) >= since);

    const bySize = new Map<string, SalesReport['bySize'][number]>();
    const byColor = new Map<string, SalesReport['byColor'][number]>();
    const byProduct = new Map<string, SalesReport['returnsByProduct'][number]>();
    for (const order of inRange) {
      const returned = order.returnRequest?.lines ?? [];
      order.items.forEach((item, index) => {
        const revenue = item.unitPrice * item.quantity;
        const back = returned.find((line) => line.index === index)?.quantity ?? 0;
        const size = bySize.get(item.size) ?? {
          size: item.size,
          units: 0,
          revenue: 0,
          returned: 0,
        };
        size.units += item.quantity;
        size.revenue += revenue;
        size.returned += back;
        bySize.set(item.size, size);
        const hex =
          products
            .find((product) => product.id === item.productId)
            ?.variants.find((variant) => variant.id === item.variantId)?.color.hex ?? '#999999';
        const color = byColor.get(item.color) ?? { color: item.color, hex, units: 0, revenue: 0 };
        color.units += item.quantity;
        color.revenue += revenue;
        byColor.set(item.color, color);
        const product = byProduct.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          sold: 0,
          returned: 0,
          reasons: [],
        };
        product.sold += item.quantity;
        if (back && order.returnRequest) {
          product.returned += back;
          const label = RETURN_REASONS[order.returnRequest.reason];
          const reason = product.reasons.find((entry) => entry.reason === label);
          if (reason) reason.count += back;
          else product.reasons.push({ reason: label, count: back });
        }
        byProduct.set(item.productId, product);
      });
    }

    const lastSold = new Map<string, number>();
    for (const order of sold)
      for (const item of order.items)
        lastSold.set(
          item.variantId,
          Math.max(lastSold.get(item.variantId) ?? 0, Date.parse(order.placedAt)),
        );
    const agingStock = products
      .filter((product) => product.status === 'active')
      .flatMap((product) =>
        product.variants
          .filter((variant) => variant.inventory > 0)
          .map((variant) => {
            const last = lastSold.get(variant.id);
            return {
              variantId: variant.id,
              productId: product.id,
              sku: variant.sku,
              name: product.name,
              variant: `${variant.color.name} / ${variant.size}`,
              onHand: variant.inventory,
              lastSoldAt: last ? new Date(last).toISOString() : null,
              stockValue: variant.inventory * (product.cost ?? Math.round(product.price * 0.42)),
            };
          }),
      )
      .filter((row) => !row.lastSoldAt || now - Date.parse(row.lastSoldAt) > 30 * DAY)
      .sort((a, b) => (a.lastSoldAt ?? '').localeCompare(b.lastSoldAt ?? '') || b.onHand - a.onHand)
      .slice(0, 20);

    const byCode = new Map<string, SalesReport['promotions'][number]>();
    for (const order of inRange) {
      if (!order.voucherCode) continue;
      const row = byCode.get(order.voucherCode) ?? {
        code: order.voucherCode,
        title: promotions.find((promo) => promo.code === order.voucherCode)?.title ?? '',
        orders: 0,
        discount: 0,
        revenue: 0,
        averageOrder: 0,
      };
      row.orders += 1;
      row.discount += order.pricing.discount;
      row.revenue += order.pricing.total;
      row.averageOrder = Math.round(row.revenue / row.orders);
      byCode.set(order.voucherCode, row);
    }

    return respond({
      range,
      bySize: [...bySize.values()].sort(
        (a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size),
      ),
      byColor: [...byColor.values()].sort((a, b) => b.units - a.units),
      returnsByProduct: [...byProduct.values()]
        .filter((row) => row.returned > 0)
        .map((row) => ({ ...row, reasons: row.reasons.sort((a, b) => b.count - a.count) }))
        .sort((a, b) => b.returned / b.sold - a.returned / a.sold),
      agingStock,
      promotions: [...byCode.values()].sort((a, b) => b.orders - a.orders),
    });
  }
}

function rank(size: string): number {
  const index = SIZE_ORDER.indexOf(size);
  return index < 0 ? SIZE_ORDER.length + Number(size) || 99 : index;
}
