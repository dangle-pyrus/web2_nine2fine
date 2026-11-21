import { foldVi } from './text';

/**
 * `search_text` của sản phẩm (BR-INV-22): ĐÚNG công thức của `prisma/seed-zara.ts` (foldVi(tên + loại)).
 * Chỉ `modules/catalog-admin/product.write.ts` được ghi cột này (T-INV-33 quét tĩnh).
 */
export const buildSearchText = (name: string, typeLabel: string): string => foldVi(`${name} ${typeLabel}`);
