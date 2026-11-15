import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { AdminProductsApi } from './admin-apis';
import { adminImageUrl, WireImageRef } from './catalog-media';
import { adminBase, adminErrors } from './http-support';
import type {
  AdminCategory,
  AdminProduct,
  AdminProductSummary,
  AdminVariant,
  Page,
  ProductImage,
  ProductInput,
  ProductQuery,
  ProductStatus,
  SaleState,
} from './models';

/** Vietnam is UTC+7 all year; the API sends instants, the form edits calendar days. */
const VN_OFFSET_MS = 7 * 3_600_000;
export function vnDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// ---------- Wire shapes (docs/api/openapi.yaml, tag admin-products / admin-media) ----------

interface WireColor {
  name: string;
  hex: string;
}

interface WireProductSummary {
  id: string;
  slug: string;
  name: string;
  coverImage: WireImageRef | null;
  status: ProductStatus;
  category: string;
  price: number;
  compareAtPrice: number | null;
  saleState?: SaleState;
  inventory: number;
  variantCount: number;
  outOfStockVariants?: number;
  lowStockVariants?: number;
  updatedAt: string;
}

/** ADM-PRD-13: list order on the API (`sort`). */
const WIRE_SORT: Record<string, string> = {
  'updatedAt:desc': 'updated',
  'createdAt:desc': 'created',
  'name:asc': 'name',
  'inventory:asc': 'stock-asc',
};

interface WireProductPage {
  items: WireProductSummary[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

interface WireProduct {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  status: ProductStatus;
  category: string;
  genders: string[];
  moments: string[];
  price: number;
  compareAtPrice: number | null;
  salePrice?: number | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  saleState?: SaleState;
  material: string;
  care: string[];
  fitSummary: string;
  images: { id: string; url: string | null; alt: string; color: string }[];
  colors: WireColor[];
  sizes: string[];
  variants: {
    id: string;
    sku: string;
    color: WireColor;
    size: string;
    inventory: number;
    hasOrders: boolean;
  }[];
  published: boolean;
  slugLocked: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: { name: string } | null;
}

interface WireUploadedImage {
  id: string;
  url: string;
  alt: string;
  color: string;
}

/** A row the form added and the server has not seen yet (`new-...`, see the product form). */
export function isNewVariant(id: string): boolean {
  return id.startsWith('new-');
}

export function toProduct(wire: WireProduct): AdminProduct {
  return {
    id: wire.id,
    slug: wire.slug,
    name: wire.name,
    type: wire.type,
    description: wire.description,
    status: wire.status,
    category: wire.category,
    genders: wire.genders,
    moments: wire.moments,
    // Won't (S6-Q7): the screen hides these, the API has no column for them.
    tags: [],
    cost: null,
    seoTitle: '',
    seoDescription: '',
    price: wire.price,
    compareAtPrice: wire.compareAtPrice,
    salePrice: wire.salePrice ?? null,
    saleStartsAt: vnDate(wire.saleStartsAt),
    saleEndsAt: vnDate(wire.saleEndsAt),
    saleState: wire.saleState ?? 'none',
    material: wire.material,
    care: wire.care,
    fitSummary: wire.fitSummary,
    images: wire.images.map((image): ProductImage => ({
      id: image.id,
      url: adminImageUrl(image),
      alt: image.alt,
      color: image.color,
    })),
    colors: wire.colors,
    sizes: wire.sizes,
    variants: wire.variants.map((variant): AdminVariant => ({
      id: variant.id,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: null,
      inventory: variant.inventory,
      hasOrders: variant.hasOrders,
    })),
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    updatedBy: wire.updatedBy?.name ?? null,
    published: wire.published,
    slugLocked: wire.slugLocked,
  };
}

/** `AdminProductInput` / `AdminProductUpdate`: only what the contract accepts. */
export function toWireProduct(input: ProductInput): Record<string, unknown> {
  return {
    ...(input.slug ? { slug: input.slug } : {}),
    name: input.name,
    type: input.type,
    description: input.description,
    status: input.status,
    category: input.category,
    genders: input.genders,
    moments: input.moments,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    // Absent key = keep the sale as it is (and no `promotions.write` needed); all `null` = remove it.
    ...(input.salePrice === undefined
      ? {}
      : {
          salePrice: input.salePrice,
          saleStartsAt: input.saleStartsAt ?? null,
          saleEndsAt: input.saleEndsAt ?? null,
        }),
    material: input.material,
    care: input.care,
    fitSummary: input.fitSummary,
    images: input.images.map((image) => ({ id: image.id, alt: image.alt, color: image.color })),
    variants: input.variants.map((variant) =>
      isNewVariant(variant.id)
        ? {
            sku: variant.sku,
            color: variant.color,
            size: variant.size,
            inventory: variant.inventory,
          }
        : { id: variant.id, sku: variant.sku, color: variant.color, size: variant.size },
    ),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

@Injectable()
export class HttpAdminProductsApi implements AdminProductsApi {
  private readonly http = inject(HttpClient);
  private readonly root = adminBase();
  private readonly base = `${this.root}/products`;

  list(query: ProductQuery) {
    const params: Record<string, string> = {
      page: String(query.page),
      limit: String(query.pageSize),
      view: query.view,
      sort: WIRE_SORT[`${query.sort}:${query.dir ?? 'desc'}`] ?? 'updated',
    };
    if (query.search) params['q'] = query.search;
    if (query.category) params['category'] = query.category;
    return this.http.get<WireProductPage>(this.base, { params }).pipe(
      adminErrors(),
      map((wire): Page<AdminProductSummary> => ({
        items: wire.items.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          image: adminImageUrl(item.coverImage),
          status: item.status,
          category: item.category,
          price: item.price,
          compareAtPrice: item.compareAtPrice,
          saleState: item.saleState,
          inventory: item.inventory,
          variantCount: item.variantCount,
          outOfStockVariants: item.outOfStockVariants,
          lowStockVariants: item.lowStockVariants,
          updatedAt: item.updatedAt,
        })),
        total: wire.total,
        page: wire.page,
        pageSize: wire.limit,
        counts: wire.counts,
      })),
    );
  }
  get(id: string) {
    return this.http.get<WireProduct>(`${this.base}/${id}`).pipe(adminErrors(), map(toProduct));
  }
  create(input: ProductInput) {
    return this.http
      .post<WireProduct>(this.base, toWireProduct(input))
      .pipe(adminErrors(), map(toProduct));
  }
  update(id: string, input: ProductInput) {
    return this.http
      .put<WireProduct>(`${this.base}/${id}`, toWireProduct(input))
      .pipe(adminErrors(), map(toProduct));
  }
  setStatus(ids: string[], status: ProductStatus) {
    return this.http.post<{ updated: number }>(`${this.base}/bulk-status`, { ids, status }).pipe(
      adminErrors(),
      map(() => undefined),
    );
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(adminErrors());
  }
  categories() {
    return this.http
      .get<{ id: string; slug: string; name: string }[]>(`${this.root}/categories`)
      .pipe(
        adminErrors(),
        map((items): AdminCategory[] =>
          items.map((item) => ({ value: item.slug, label: item.name })),
        ),
      );
  }
  /** The file itself is the request body (BR-INV-24): no multipart. */
  uploadImage(file: File) {
    return this.http
      .post<WireUploadedImage>(`${this.root}/uploads/product-images`, file, {
        headers: new HttpHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
      })
      .pipe(
        adminErrors(),
        map((image): ProductImage => ({
          id: image.id,
          url: image.url,
          alt: image.alt,
          color: image.color,
        })),
      );
  }
}
