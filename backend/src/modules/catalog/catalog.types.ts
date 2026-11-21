import type { Prisma } from '@prisma/client';

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'bestselling';

export interface ListQuery {
  gender?: string;
  category?: string;
  moment?: string;
  size?: string;
  color?: string;
  maxPrice?: number;
  available: boolean;
  /** Các từ khoá đã foldVi (rỗng = không tìm). */
  tokens: string[];
  sort: SortKey;
  page: number;
  limit: number;
  /** undefined = không lọc theo ids; mảng rỗng = có ids nhưng không hợp lệ -> trang rỗng. */
  ids?: string[];
  /** Slice 10 (Should): chỉ sản phẩm đang CHẠY đợt giảm. */
  sale: boolean;
}

export type ProductWithVariants = Prisma.ProductGetPayload<{ include: { variants: true } }>;

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface ProductVariantDto {
  id: string;
  sku: string;
  size: string;
  color: { name: string; hex: string };
  inventory: number;
  stockStatus: StockStatus;
}

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  type: string;
  category: string;
  moments: string[];
  genders: string[];
  price: number;
  compareAtPrice?: number;
  mediaId: string;
  gallery: string[];
  colorMedia?: Record<string, string>;
  /** 2026-11-21: ảnh gallery -> tên màu (từ `image_meta`), để trang sản phẩm chỉ hiện ảnh của màu đang chọn. Bỏ khi không có. */
  galleryColors?: Record<string, string>;
  variants: ProductVariantDto[];
  badge?: string;
  description: string;
  material: string;
  care: string[];
  fit: { summary: string; model: string };
  looks: unknown[];
  createdAt: string;
  salesRank: number;
  rating?: { average: number; count: number };
  discountPercent?: number;
  saleEndsAt?: string;
}

export interface ProductPageDto {
  items: ProductDto[];
  total: number;
  page: number;
  limit: number;
}
