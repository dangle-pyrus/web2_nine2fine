import { z } from 'zod';
import { CATALOG_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { SLUG_RE } from '../../lib/slug';
import { cleanMultiline, cleanText } from '../../lib/text';
import { evaluateSale } from './sale-input';

export const BODY_MSG = 'Dữ liệu gửi lên không hợp lệ.';

/** Đường dẫn Zod -> `variants[2].sku`, `images`, `items[0].threshold`. */
export function fieldPath(path: ReadonlyArray<PropertyKey>): string | undefined {
  let out = '';
  const trimmed = [...path];
  while (trimmed.length > 0 && typeof trimmed[trimmed.length - 1] === 'number') trimmed.pop(); // genders[0] -> genders
  for (const p of trimmed) {
    if (typeof p === 'number') out += `[${p}]`;
    else out += out ? `.${String(p)}` : String(p);
  }
  return out || undefined;
}

/** Lỗi Zod đầu tiên -> 422 validation kèm `field` có chỉ số (khác `lib/validate.parseBody` vốn bỏ chỉ số). */
export function parseStrict<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw Errors.validation(BODY_MSG);
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  throw Errors.validation(issue.message || BODY_MSG, fieldPath(issue.path));
}

/** Chuỗi một dòng đã chuẩn hoá, độ dài sau chuẩn hoá trong [min, max]. */
export const line = (msg: string, min: number, max: number) =>
  z
    .string({ error: msg })
    .transform(cleanText)
    .refine((v) => v.length >= min && v.length <= max, { error: msg });

const { price: PRICE, image: IMG, variant: VAR } = CATALOG_ASSUMPTIONS;
const PRICE_MSG = 'Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng.';

const colorSchema = z.object(
  {
    name: line('Tên màu từ 1 đến 50 ký tự.', 1, 50),
    hex: z.string({ error: 'Mã màu dạng #RRGGBB.' }).regex(/^#[0-9A-Fa-f]{6}$/, { error: 'Mã màu dạng #RRGGBB.' }).transform((v) => v.toUpperCase()),
  },
  { error: 'Màu không hợp lệ.' },
);

export const variantInputSchema = z.object(
  {
    id: z.string({ error: 'Mã biến thể không hợp lệ.' }).optional(),
    sku: z
      .string({ error: 'SKU từ 3 đến 64 ký tự gồm chữ, số và dấu gạch ngang.' })
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => /^[A-Z0-9-]{3,64}$/.test(v), { error: 'SKU từ 3 đến 64 ký tự gồm chữ, số và dấu gạch ngang.' }),
    color: colorSchema,
    size: z.enum(VAR.sizes as [string, ...string[]], { error: 'Size không hợp lệ.' }),
    inventory: z
      .number({ error: 'Tồn ban đầu là số nguyên từ 0 đến 100.000.' })
      .int({ error: 'Tồn ban đầu là số nguyên từ 0 đến 100.000.' })
      .min(0, { error: 'Tồn ban đầu là số nguyên từ 0 đến 100.000.' })
      .max(CATALOG_ASSUMPTIONS.stock.maxQty, { error: 'Tồn ban đầu là số nguyên từ 0 đến 100.000.' })
      .optional(),
  },
  { error: 'Biến thể không hợp lệ.' },
);

const imageInputSchema = z.object(
  {
    id: z.string({ error: 'Ảnh không hợp lệ.' }).min(1, { error: 'Ảnh không hợp lệ.' }).max(100, { error: 'Ảnh không hợp lệ.' }),
    alt: z
      .string({ error: 'Mô tả ảnh tối đa 125 ký tự.' })
      .transform(cleanText)
      .refine((v) => v.length <= 125, { error: 'Mô tả ảnh tối đa 125 ký tự.' })
      .optional(),
    color: z
      .string({ error: 'Màu của ảnh không hợp lệ.' })
      .transform(cleanText)
      .refine((v) => v.length <= 50, { error: 'Màu của ảnh không hợp lệ.' })
      .optional(),
  },
  { error: 'Ảnh không hợp lệ.' },
);

const careSchema = z
  .array(z.string({ error: 'Mỗi dòng bảo quản từ 1 đến 200 ký tự.' }), { error: 'Bảo quản không hợp lệ.' })
  .transform((a) => a.map(cleanText).filter((s) => s !== ''))
  .refine((a) => a.length <= 10, { error: 'Bảo quản tối đa 10 dòng.' })
  .refine((a) => a.every((s) => s.length <= 200), { error: 'Mỗi dòng bảo quản từ 1 đến 200 ký tự.' });

const slugField = z
  .string({ error: 'Đường dẫn không hợp lệ.' })
  .transform((v) => v.trim())
  .refine((v) => v === '' || (v.length >= 3 && v.length <= 80 && SLUG_RE.test(v)), {
    error: 'Đường dẫn gồm chữ thường a-z, số 0-9 và dấu gạch ngang, 3 đến 80 ký tự.',
  });

const optionalText = (max: number, msg: string, multiline = false) =>
  z
    .string({ error: msg })
    .transform(multiline ? cleanMultiline : cleanText)
    .refine((v) => v.length <= max, { error: msg })
    .optional();

const productShape = {
  slug: slugField.optional(),
  name: line('Tên sản phẩm từ 1 đến 120 ký tự.', 1, 120),
  type: line('Loại sản phẩm từ 1 đến 120 ký tự.', 1, 120),
  description: optionalText(5000, 'Mô tả tối đa 5.000 ký tự.', true),
  status: z.enum(['active', 'draft', 'hidden'], { error: 'Trạng thái không hợp lệ.' }).optional(),
  category: z.string({ error: 'Chọn danh mục.' }).transform((v) => v.trim()).refine((v) => v !== '', { error: 'Chọn danh mục.' }),
  genders: z.array(z.enum(['nam', 'nu'], { error: 'Giới tính không hợp lệ.' }), { error: 'Giới tính không hợp lệ.' }).min(1, { error: 'Chọn ít nhất một giới tính.' }).optional(),
  moments: z.array(z.enum(['work', 'dinner', 'event', 'weekend'], { error: 'Dịp mặc không hợp lệ.' }), { error: 'Dịp mặc không hợp lệ.' }).min(1, { error: 'Chọn ít nhất một dịp mặc.' }).optional(),
  price: z
    .number({ error: PRICE_MSG })
    .int({ error: PRICE_MSG })
    .min(PRICE.min, { error: PRICE_MSG })
    .max(PRICE.max, { error: PRICE_MSG }),
  compareAtPrice: z
    .number({ error: 'Giá gốc phải là số nguyên lớn hơn giá bán.' })
    .int({ error: 'Giá gốc phải là số nguyên lớn hơn giá bán.' })
    .nullable()
    .optional(),
  // Slice 10 (BR-PROMO-01): kiểm chi tiết ở `refineProduct` bằng `evaluateSale`.
  salePrice: z.number({ error: 'Giá giảm phải là số nguyên.' }).nullable().optional(),
  saleStartsAt: z.string({ error: 'Ngày bắt đầu không hợp lệ.' }).nullable().optional(),
  saleEndsAt: z.string({ error: 'Ngày kết thúc không hợp lệ.' }).nullable().optional(),
  material: optionalText(500, 'Chất liệu tối đa 500 ký tự.'),
  care: careSchema.optional(),
  fitSummary: optionalText(500, 'Mô tả dáng tối đa 500 ký tự.'),
  images: z
    .array(imageInputSchema, { error: 'Ảnh không hợp lệ.' })
    .max(IMG.maxPerProduct, { error: `Tối đa ${IMG.maxPerProduct} ảnh.` })
    .optional(),
  variants: z
    .array(variantInputSchema, { error: 'Biến thể không hợp lệ.' })
    .max(VAR.maxVariants, { error: 'Tối đa 32 biến thể.' }),
};

const uniq = <T>(a: T[] | undefined): T[] | undefined => (a ? [...new Set(a)] : a);

function refineProduct(
  v: { price: number; compareAtPrice?: number | null | undefined; salePrice?: number | null | undefined; saleStartsAt?: string | null | undefined; saleEndsAt?: string | null | undefined },
  ctx: z.RefinementCtx,
): void {
  for (const i of evaluateSale(v).issues) ctx.addIssue({ code: 'custom', path: [i.path], message: i.message });
  if (v.compareAtPrice !== null && v.compareAtPrice !== undefined && (v.compareAtPrice <= v.price || v.compareAtPrice > PRICE.max)) {
    ctx.addIssue({ code: 'custom', path: ['compareAtPrice'], message: 'Giá gốc phải lớn hơn giá bán và không quá 100.000.000 đồng.' });
  }
}

export const productCreateSchema = z
  .object(productShape)
  .superRefine(refineProduct)
  .transform((v) => ({ ...v, genders: uniq(v.genders), moments: uniq(v.moments) }));

export const productUpdateSchema = z
  .object({
    ...productShape,
    updatedAt: z
      .string({ error: 'Thiếu updatedAt.' })
      .refine((v) => !Number.isNaN(Date.parse(v)), { error: 'updatedAt không hợp lệ.' }),
  })
  .superRefine(refineProduct)
  .transform((v) => ({ ...v, genders: uniq(v.genders), moments: uniq(v.moments) }));

export type ProductCreateInput = z.output<typeof productCreateSchema>;
export type ProductUpdateInput = z.output<typeof productUpdateSchema>;
export type VariantInput = z.output<typeof variantInputSchema>;

export const bulkStatusSchema = z.object({
  ids: z
    .array(z.string({ error: 'Danh sách mã sản phẩm không hợp lệ.' }), { error: 'Danh sách mã sản phẩm không hợp lệ.' })
    .transform((a) => [...new Set(a)])
    .refine((a) => a.length >= 1 && a.length <= 50, { error: 'Chọn từ 1 đến 50 sản phẩm.' }),
  status: z.enum(['active', 'draft', 'hidden'], { error: 'Trạng thái không hợp lệ.' }),
});

/** Query danh sách sản phẩm: `q` <= 100 sau trim; `limit` 1..100; `page` >= 1; `view` thuộc 5 tab. */
export const intQuery = (msg: string, min: number, max: number, def: number) =>
  z
    .union([z.string(), z.undefined()], { error: msg })
    .transform((v, ctx) => {
      if (v === undefined || v === '') return def;
      if (!/^-?\d+$/.test(v)) {
        ctx.addIssue({ code: 'custom', message: msg });
        return z.NEVER;
      }
      const n = Number(v);
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: msg });
        return z.NEVER;
      }
      return n;
    });

export const single = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const productListQuerySchema = z.object({
  q: z.preprocess(single, z.string({ error: 'Từ khoá tìm kiếm không hợp lệ.' }).transform(cleanText).refine((v) => v.length <= 100, { error: 'Từ khoá tối đa 100 ký tự.' }).optional()),
  view: z.preprocess(
    single,
    z.enum(['all', 'active', 'draft', 'hidden', 'out-of-stock'], { error: 'Tab không hợp lệ.' }).optional().default('all'),
  ),
  category: z.preprocess(single, z.string().optional()),
  /** ADM-PRD-13: Mới cập nhật (mặc định), Mới tạo, Tên A–Z, Tồn kho thấp nhất. */
  sort: z.preprocess(
    single,
    z.enum(['updated', 'created', 'name', 'stock-asc'], { error: 'Cách sắp xếp không hợp lệ.' }).optional().default('updated'),
  ),
  page: z.preprocess(single, intQuery('Trang phải là số nguyên từ 1 trở lên.', 1, 1_000_000, 1)),
  limit: z.preprocess(single, intQuery('Số dòng mỗi trang từ 1 đến 100.', 1, 100, 20)),
});
export type ProductListQuery = z.output<typeof productListQuerySchema>;
