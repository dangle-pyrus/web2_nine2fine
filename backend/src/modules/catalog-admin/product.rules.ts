import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { foldVi } from '../../lib/text';
import type { VariantInput } from './catalog-admin.schemas';

export interface NormVariant {
  id?: string;
  sku: string;
  colorName: string;
  colorHex: string;
  size: string;
  /** Tồn ban đầu (chỉ biến thể MỚI dùng). */
  inventory: number;
}

/**
 * Kiểm thuần (không DB) trạng thái cuối mong muốn của biến thể (plan 6.3, BR-INV-19). Lỗi đầu tiên -> 422 kèm `field`
 * có chỉ số. Zod đã kiểm hình dạng từng phần tử (size, hex, SKU, độ dài tên màu, tồn).
 */
export function normalizeVariants(list: VariantInput[]): NormVariant[] {
  const ids = new Set<string>();
  const skus = new Set<string>();
  const keys = new Set<string>();
  const hexByName = new Map<string, string>(); // tên màu (đúng chuỗi) -> hex
  const nameByFold = new Map<string, string>(); // foldVi(tên) -> tên đúng chuỗi
  const out: NormVariant[] = [];
  list.forEach((v, i) => {
    if (v.id !== undefined) {
      if (ids.has(v.id)) throw Errors.validation('Biến thể bị lặp.', `variants[${i}].id`);
      ids.add(v.id);
    }
    const name = v.color.name;
    const fold = foldVi(name);
    const known = nameByFold.get(fold);
    if (known !== undefined && known !== name) {
      throw Errors.validation('Tên màu không được trùng nhau (không phân biệt hoa thường, dấu).', `variants[${i}].color.name`);
    }
    if (known === undefined) {
      if (hexByName.size >= CATALOG_ASSUMPTIONS.variant.maxColors) {
        throw Errors.validation('Tối đa 8 màu.', `variants[${i}].color.name`);
      }
      nameByFold.set(fold, name);
      hexByName.set(name, v.color.hex);
    } else if (hexByName.get(name) !== v.color.hex) {
      throw Errors.validation('Cùng một màu phải dùng cùng một mã màu.', `variants[${i}].color.hex`);
    }
    const key = `${name}\u0000${v.size}`;
    if (keys.has(key)) throw Errors.validation('Tổ hợp màu và size bị lặp.', `variants[${i}].size`);
    keys.add(key);
    if (skus.has(v.sku)) throw Errors.validation('SKU bị lặp trong sản phẩm.', `variants[${i}].sku`);
    skus.add(v.sku);
    out.push({ id: v.id, sku: v.sku, colorName: name, colorHex: v.color.hex, size: v.size, inventory: v.inventory ?? 0 });
  });
  return out;
}

export interface PublishFacts {
  name: string;
  type: string;
  hasCategory: boolean;
  price: number;
  imageCount: number;
  variantCount: number;
}

/** Điều kiện vào `active` (BR-INV-14, 21), theo thứ tự name, type, category, price, images, variants. Không yêu cầu tồn > 0. */
export function publishMissing(f: PublishFacts): string[] {
  const { min, max } = CATALOG_ASSUMPTIONS.price;
  const missing: string[] = [];
  if (f.name.trim() === '') missing.push('name');
  if (f.type.trim() === '') missing.push('type');
  if (!f.hasCategory) missing.push('category');
  if (!Number.isInteger(f.price) || f.price < min || f.price > max) missing.push('price');
  if (f.imageCount < 1) missing.push('images');
  if (f.variantCount < 1) missing.push('variants');
  return missing;
}

export interface FinalImage {
  id: string;
  alt: string;
  color: string;
}

/** Cover, gallery, color_media, image_meta từ danh sách ảnh cuối (plan 6.5). `color_media[màu]` = ảnh đầu tiên gắn màu đó. */
export function buildImageColumns(images: FinalImage[]) {
  const colorMedia: Record<string, string> = {};
  const imageMeta: Record<string, { alt: string; color: string }> = {};
  for (const im of images) {
    if (im.color && colorMedia[im.color] === undefined) colorMedia[im.color] = im.id;
    imageMeta[im.id] = { alt: im.alt, color: im.color };
  }
  return {
    coverMediaId: images[0]?.id ?? '',
    galleryMediaIds: images.map((i) => i.id),
    colorMedia,
    imageMeta,
  };
}
