/**
 * Slice 10 admin ports: kiểm duyệt đánh giá (`admin-reviews`), nội dung trang chủ + bảng size +
 * bộ sưu tập (`admin-content`, `admin-collections`) and giảm giá hàng loạt (`admin-sales`), as in
 * docs/api/openapi.yaml. Cookie `n2f_asid` and `X-Requested-With: n2f` come from
 * `core/api-interceptor.ts`. Mock and HTTP adapters return exactly these shapes.
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, map, Observable, OperatorFunction, throwError } from 'rxjs';
import type { SortOrder } from '../../features/catalog/models/product';
import { adminBase, adminErrors } from './http-support';
import { AdminApiError } from './models';

// ---------- Shared ----------

export interface StaffRef {
  name: string;
}

/**
 * `409 version-conflict` of the content endpoints: `current` is the server's copy (same type as the
 * `200` of the same operation) so the screen can show it and keep what the admin typed.
 */
export class ContentConflictError<T = unknown> extends AdminApiError {
  constructor(
    base: AdminApiError,
    readonly current: T | null,
  ) {
    super(base.code, base.message, base.fields, base.retryAfterSeconds, base.detail);
  }
}

/** `adminErrors()` plus `error.current` of a `409`; `fieldErrors` paths already arrive in `fields`. */
export function contentErrors<T>(): OperatorFunction<T, T> {
  return (source) =>
    source.pipe(
      catchError((error: unknown): Observable<never> => {
        const current =
          error instanceof HttpErrorResponse
            ? ((error.error as { error?: { current?: unknown } } | null)?.error?.current ?? null)
            : null;
        return throwError(() => error).pipe(
          adminErrors(),
          catchError((mapped: unknown) =>
            throwError(() =>
              mapped instanceof AdminApiError && mapped.code === 'version-conflict'
                ? new ContentConflictError(mapped, current)
                : mapped,
            ),
          ),
        ) as Observable<never>;
      }),
    );
}

// ---------- Reviews (10.5) ----------

export type AdminReviewView = 'all' | 'unanswered' | 'low' | 'hidden';
export type AdminReviewStatus = 'visible' | 'hidden';

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  /** Media id of the cover image. */
  productImage: string;
  author: string;
  rating: number;
  /** -1 = runs small, 0 = true to size, 1 = runs large. */
  fit: -1 | 0 | 1;
  sizeBought: string;
  height: string;
  title: string;
  body: string;
  /** `YYYY-MM-DD`, Vietnam time. */
  date: string;
  createdAt: string;
  verified: true;
  status: AdminReviewStatus;
  hiddenReason?: string;
  hiddenAt?: string;
  hiddenBy?: StaffRef;
  reply?: { body: string; at: string; author: string };
  /** Optimistic-lock key of hide / show / reply. */
  updatedAt: string;
}

export interface AdminReviewCounts {
  all: number;
  unanswered: number;
  low: number;
  hidden: number;
}

export interface AdminReviewPage {
  items: AdminReview[];
  total: number;
  page: number;
  limit: 20 | 50;
  counts: AdminReviewCounts;
  average: number | null;
}

export interface AdminReviewQuery {
  view: AdminReviewView;
  /** 0 = any rating. */
  rating: number;
  page: number;
  limit: 20 | 50;
}

export interface AdminReviewsApi {
  list(query: AdminReviewQuery): Observable<AdminReviewPage>;
  hide(id: string, reason: string, updatedAt: string): Observable<AdminReview>;
  show(id: string, updatedAt: string): Observable<AdminReview>;
  /** `null` removes the reply. */
  reply(id: string, body: string | null, updatedAt: string): Observable<AdminReview>;
}
export const ADMIN_REVIEWS_API = new InjectionToken<AdminReviewsApi>('ADMIN_REVIEWS_API');

// ---------- Home content, size charts, collections (10.3, 10.8) ----------

export type HomeMoment = 'work' | 'dinner' | 'event' | 'weekend';
export const HOME_MOMENTS: readonly HomeMoment[] = ['work', 'dinner', 'event', 'weekend'];

export interface HomeCategoryItem {
  label: string;
  href: string;
  mediaId: string;
}
export interface HomeMomentInput {
  moment: HomeMoment;
  label: string;
  lines: string[];
  mediaId: string;
}
export interface HomeCampaignBlock {
  kind: 'campaign';
  id: string;
  enabled?: boolean;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  mediaId: string;
  mobileMediaId: string;
  titleLang?: 'en';
  member?: { description: string; href: string };
}
export interface HomeProductsBlock {
  kind: 'products';
  id: string;
  enabled?: boolean;
  label: string;
  cards: { title: string; caption: string; href: string; mediaId: string }[];
}
export interface HomeShopBlock {
  kind: 'shop';
  id: string;
  enabled?: boolean;
  label: string;
  sort: SortOrder;
  href: string;
  queryParams?: Record<string, string>;
}
export interface HomeCategoriesBlock {
  kind: 'categories';
  id: string;
  enabled?: boolean;
}
export type HomeBlock = HomeCampaignBlock | HomeProductsBlock | HomeShopBlock | HomeCategoriesBlock;

export interface HomeContentInput {
  categories: HomeCategoryItem[];
  moments: HomeMomentInput[];
  blocks: HomeBlock[];
  /** `null` only while no row has been saved yet. */
  updatedAt: string | null;
}

export interface AdminHomeContent {
  categories: HomeCategoryItem[];
  moments: HomeMomentInput[];
  blocks: HomeBlock[];
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: StaffRef | null;
  /** Should (BR-CMS-06): never blocks saving. */
  warnings?: { path: string; message: string }[];
}

export interface SizeChartRow {
  size: string;
  values: Record<string, string>;
}
export interface SizeChartTables {
  body: SizeChartRow[];
  garment: SizeChartRow[];
  bodyColumns: string[];
  garmentColumns: string[];
}
export interface AdminSizeChart {
  category: string;
  label: string;
  productCount: number;
  customised: boolean;
  updatedAt: string | null;
  updatedBy: StaffRef | null;
  chart: SizeChartTables & { updatedAt?: string };
}

export type CollectionStatus = 'active' | 'draft';
export interface AdminCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: CollectionStatus;
  productIds: string[];
  slugLocked: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: StaffRef | null;
}
export interface CollectionInput {
  name: string;
  /** Empty = generated from the name. */
  slug?: string;
  description: string;
  status: CollectionStatus;
  productIds: string[];
}

export interface AdminContentApi {
  getHome(): Observable<AdminHomeContent>;
  saveHome(input: HomeContentInput): Observable<AdminHomeContent>;
  /** Should (BR-CMS-06). */
  resetHome(updatedAt: string | null): Observable<AdminHomeContent>;
  sizeCharts(): Observable<AdminSizeChart[]>;
  saveSizeChart(
    category: string,
    chart: SizeChartTables,
    updatedAt: string | null,
  ): Observable<AdminSizeChart>;
  collections(): Observable<AdminCollection[]>;
  createCollection(input: CollectionInput): Observable<AdminCollection>;
  updateCollection(
    id: string,
    input: CollectionInput,
    updatedAt: string,
  ): Observable<AdminCollection>;
  removeCollection(id: string): Observable<void>;
}
export const ADMIN_CONTENT_API = new InjectionToken<AdminContentApi>('ADMIN_CONTENT_API');

// ---------- Bulk sale (10.7, Should) ----------

export interface BulkSaleInput {
  category: string;
  /** 5..70. */
  percent: number;
  /** `YYYY-MM-DD`, Vietnam time. */
  startsOn: string;
  endsOn: string;
}
export interface BulkSaleItem {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  reason?: 'sale-running' | 'below-minimum' | 'not-reduced';
}
export interface BulkSaleResult {
  applicable: BulkSaleItem[];
  skipped: BulkSaleItem[];
  applied: number;
}
export interface AdminSalesApi {
  preview(input: BulkSaleInput): Observable<BulkSaleResult>;
  apply(input: BulkSaleInput): Observable<BulkSaleResult>;
}
export const ADMIN_SALES_API = new InjectionToken<AdminSalesApi>('ADMIN_SALES_API');

// ---------- HTTP adapters ----------

@Injectable()
export class HttpAdminReviewsApi implements AdminReviewsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/reviews`;

  list(query: AdminReviewQuery) {
    const params: Record<string, string> = {
      view: query.view,
      page: String(query.page),
      limit: String(query.limit),
    };
    if (query.rating) params['rating'] = String(query.rating);
    return this.http.get<AdminReviewPage>(this.base, { params }).pipe(adminErrors());
  }
  hide(id: string, reason: string, updatedAt: string) {
    return this.http
      .post<AdminReview>(`${this.base}/${id}/hide`, { reason, updatedAt })
      .pipe(adminErrors());
  }
  show(id: string, updatedAt: string) {
    return this.http
      .post<AdminReview>(`${this.base}/${id}/show`, { updatedAt })
      .pipe(adminErrors());
  }
  reply(id: string, body: string | null, updatedAt: string) {
    return this.http
      .put<AdminReview>(`${this.base}/${id}/reply`, { body, updatedAt })
      .pipe(adminErrors());
  }
}

@Injectable()
export class HttpAdminContentApi implements AdminContentApi {
  private readonly http = inject(HttpClient);
  private readonly root = adminBase();

  getHome() {
    return this.http.get<AdminHomeContent>(`${this.root}/content/home`).pipe(adminErrors());
  }
  saveHome(input: HomeContentInput) {
    return this.http
      .put<AdminHomeContent>(`${this.root}/content/home`, input)
      .pipe(contentErrors());
  }
  resetHome(updatedAt: string | null) {
    return this.http
      .post<AdminHomeContent>(`${this.root}/content/home/reset`, { updatedAt })
      .pipe(contentErrors());
  }
  sizeCharts() {
    return this.http.get<{ items: AdminSizeChart[] }>(`${this.root}/size-charts`).pipe(
      adminErrors(),
      map((page) => page.items),
    );
  }
  saveSizeChart(category: string, chart: SizeChartTables, updatedAt: string | null) {
    return this.http
      .put<AdminSizeChart>(`${this.root}/size-charts/${encodeURIComponent(category)}`, {
        body: chart.body,
        garment: chart.garment,
        bodyColumns: chart.bodyColumns,
        garmentColumns: chart.garmentColumns,
        updatedAt,
      })
      .pipe(contentErrors());
  }
  collections() {
    return this.http.get<{ items: AdminCollection[] }>(`${this.root}/collections`).pipe(
      adminErrors(),
      map((page) => page.items),
    );
  }
  createCollection(input: CollectionInput) {
    return this.http
      .post<AdminCollection>(`${this.root}/collections`, collectionBody(input))
      .pipe(contentErrors());
  }
  updateCollection(id: string, input: CollectionInput, updatedAt: string) {
    return this.http
      .put<AdminCollection>(`${this.root}/collections/${id}`, {
        ...collectionBody(input),
        updatedAt,
      })
      .pipe(contentErrors());
  }
  removeCollection(id: string) {
    return this.http.delete<void>(`${this.root}/collections/${id}`).pipe(adminErrors());
  }
}

function collectionBody(input: CollectionInput): Record<string, unknown> {
  return {
    name: input.name,
    ...(input.slug ? { slug: input.slug } : {}),
    description: input.description,
    status: input.status,
    productIds: input.productIds,
  };
}

@Injectable()
export class HttpAdminSalesApi implements AdminSalesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/sales/bulk`;

  preview(input: BulkSaleInput) {
    return this.http.post<BulkSaleResult>(`${this.base}/preview`, input).pipe(adminErrors());
  }
  apply(input: BulkSaleInput) {
    return this.http.post<BulkSaleResult>(this.base, input).pipe(adminErrors());
  }
}
