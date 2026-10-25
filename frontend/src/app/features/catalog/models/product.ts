export type Moment = 'work' | 'dinner' | 'event' | 'weekend';
export type Category = 'tops' | 'bottoms' | 'dresses' | 'outerwear';
/** Figma header navigation shops by Nam / Nữ; unisex pieces list both. */
export type Gender = 'nam' | 'nu';
export type SortOrder = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'bestselling';

export interface ProductVariant {
  id: string;
  sku: string;
  size: string;
  color: { name: string; hex: string };
  inventory: number;
}

export interface ProductFit {
  /** One-line fit statement shown near the size selector (Baymard apparel guideline). */
  summary: string;
  /** Model measurements and size worn. */
  model: string;
}

export interface StylingLook {
  time: string;
  moment: string;
  tip: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Product type line under the name, e.g. "Áo blazer · Dáng suông". */
  type: string;
  category: Category;
  moments: Moment[];
  genders: Gender[];
  price: number;
  compareAtPrice?: number;
  mediaId: string;
  /** Media IDs for the PDP gallery; the first image is the card cover. */
  gallery: string[];
  variants: ProductVariant[];
  badge?: string;
  /** Optional cover per colour name; cards fall back to the main cover when a colour has none. */
  colorMedia?: Partial<Record<string, string>>;
  /** Review summary for listing cards; omitted when the product has no reviews. */
  rating?: { average: number; count: number };
  description: string;
  material: string;
  care: string[];
  fit: ProductFit;
  /** "Wear it your way" looks (plan 11.4). */
  looks: StylingLook[];
  createdAt: string;
  salesRank: number;
}

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  /** -1 = runs small, 0 = true to size, 1 = runs large. */
  fit: -1 | 0 | 1;
  sizeBought: string;
  height: string;
  title: string;
  body: string;
  date: string;
  /** Written by a shopper whose order with this product was delivered. */
  verified?: boolean;
  /** Demo fixture, not a real customer's words; labelled as such on the page. */
  sample?: boolean;
  /** The shop's public answer, shown as "Phản hồi từ nine2fine". */
  reply?: { body: string; at: string };
}

/** What a shopper writes; author, date and verification come from the server. */
export type ReviewInput = Pick<
  ProductReview,
  'rating' | 'fit' | 'sizeBought' | 'height' | 'title' | 'body'
>;

/** Only shoppers who received the product may review it (once). */
export interface ReviewEligibility {
  status: 'sign-in' | 'not-purchased' | 'reviewed' | 'eligible';
  /** Size from the shopper's order, prefilled on the form. */
  sizeBought?: string;
}

export interface SizeChartRow {
  size: string;
  /** Measurement label → value in cm. */
  values: Record<string, string>;
}

export interface SizeChart {
  body: SizeChartRow[];
  garment: SizeChartRow[];
  bodyColumns: string[];
  garmentColumns: string[];
}

export interface CatalogQuery {
  gender: string;
  category: string;
  moment: string;
  size: string;
  color: string;
  maxPrice: number;
  available: boolean;
  search: string;
  sort: SortOrder;
}

export interface ProductPage {
  items: Product[];
  total: number;
}

export const DEFAULT_QUERY: CatalogQuery = {
  gender: '',
  category: '',
  moment: '',
  size: '',
  color: '',
  maxPrice: 0,
  available: false,
  search: '',
  sort: 'featured',
};

/** Colours the catalog filter offers. */
export const PRODUCT_COLORS = [
  { name: 'Đen', hex: '#242323' },
  { name: 'Trắng', hex: '#f5f4f0' },
  { name: 'Xám', hex: '#96958f' },
  { name: 'Đỏ', hex: '#a91e2c' },
] as const;

export const CATEGORIES = [
  { value: 'tops', label: 'Áo' },
  { value: 'bottoms', label: 'Quần & chân váy' },
  { value: 'dresses', label: 'Đầm' },
  { value: 'outerwear', label: 'Áo khoác' },
] as const;

export const GENDERS = [
  { value: 'nam', label: 'Nam' },
  { value: 'nu', label: 'Nữ' },
] as const;

export const MOMENTS = [
  { value: 'work', label: 'Work' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'event', label: 'Event' },
  { value: 'weekend', label: 'Weekend' },
] as const;

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Nổi bật' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price-asc', label: 'Giá tăng dần' },
  { value: 'price-desc', label: 'Giá giảm dần' },
  { value: 'bestselling', label: 'Bán chạy' },
] as const;
