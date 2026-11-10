import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { AdminInventoryApi } from './admin-apis';
import { adminImageUrl, WireImageRef } from './catalog-media';
import { adminBase, adminErrors } from './http-support';
import type {
  InventoryAdjustment,
  InventoryFacets,
  InventoryItem,
  InventoryMovement,
  InventoryQuery,
  Page,
  ProductStatus,
  StockStatus,
} from './models';

interface WireInventoryItem {
  variantId: string;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  image: WireImageRef | null;
  color: { name: string; hex: string };
  size: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  thresholdCustom: boolean;
  category: string;
  status: StockStatus;
}

interface WireInventoryPage {
  items: WireInventoryItem[];
  total: number;
  page: number;
  limit: number;
}

type InventoryFilters = Partial<Pick<InventoryQuery, 'search' | 'category' | 'color' | 'size'>>;

function filterParams(query: InventoryFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.search) params['q'] = query.search;
  if (query.category) params['category'] = query.category;
  if (query.color) params['color'] = query.color;
  if (query.size) params['size'] = query.size;
  return params;
}

function toItem(wire: WireInventoryItem): InventoryItem {
  return { ...wire, image: adminImageUrl(wire.image) };
}

/** 32 hex characters: fits `^[A-Za-z0-9-]{16,64}$`. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

@Injectable()
export class HttpAdminInventoryApi implements AdminInventoryApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/inventory`;

  list(query: InventoryQuery) {
    return this.http
      .get<WireInventoryPage>(this.base, {
        params: {
          ...filterParams(query),
          view: query.view,
          page: String(query.page),
          limit: String(query.pageSize),
        },
      })
      .pipe(
        adminErrors(),
        map((wire): Page<InventoryItem> => ({
          items: wire.items.map(toItem),
          total: wire.total,
          page: wire.page,
          pageSize: wire.limit,
        })),
      );
  }

  /** Counts follow the search / category / colour / size filters but not the status tab. */
  facets(query: InventoryFilters = {}) {
    return this.http
      .get<InventoryFacets>(`${this.base}/facets`, { params: filterParams(query) })
      .pipe(adminErrors());
  }

  /** One `Idempotency-Key` per intent: the drawer keeps `input.idempotencyKey` across retries. */
  adjust(variantId: string, input: InventoryAdjustment) {
    const { idempotencyKey, ...body } = input;
    return this.http
      .post<WireInventoryItem>(`${this.base}/${variantId}/adjustments`, body, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey ?? newIdempotencyKey() }),
      })
      .pipe(adminErrors(), map(toItem));
  }

  history(variantId: string) {
    return this.http
      .get<InventoryMovement[]>(`${this.base}/${variantId}/movements`)
      .pipe(adminErrors());
  }

  setThreshold(variantIds: string[], value: number | null) {
    return this.http
      .put(`${this.base}/thresholds`, {
        items: variantIds.map((variantId) => ({ variantId, threshold: value })),
      })
      .pipe(
        adminErrors(),
        map(() => undefined),
      );
  }

  setDefaultThreshold(value: number, resetCustom: boolean) {
    return this.http
      .put(`${this.base}/thresholds`, {
        defaultThreshold: value,
        ...(resetCustom ? { clearCustom: true } : {}),
      })
      .pipe(
        adminErrors(),
        map(() => undefined),
      );
  }
}
