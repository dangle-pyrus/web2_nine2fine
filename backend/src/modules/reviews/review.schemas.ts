import { z } from 'zod';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { UUID_RE } from '../../lib/validate';

const R = P1_ASSUMPTIONS.reviews;

/** Ký tự điều khiển ngoài xuống dòng (\n). \r cũng bị loại (bản chuẩn hoá đổi \r\n -> \n trước khi kiểm). */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

/** NFC + cắt hai đầu (BR-REV-03). \r\n -> \n để không tính hai ký tự. */
export const normText = (s: string): string => s.normalize('NFC').replace(/\r\n?/g, '\n').trim();
export const lengthOf = (s: string): number => [...s].length;

/** Chuỗi bắt buộc kiểu text: chuẩn hoá, không ký tự điều khiển, độ dài [min, max] theo ký tự. */
const text = (msg: string, min: number, max: number) =>
  z
    .string({ error: msg })
    .transform(normText)
    .refine((v) => !CONTROL_RE.test(v) && lengthOf(v) >= min && lengthOf(v) <= max, { error: msg });

const uuid = (msg: string) => z.string({ error: msg }).regex(UUID_RE, { error: msg });

export const reviewCreateSchema = z.object({
  productId: uuid('Mã sản phẩm không hợp lệ.'),
  rating: z.number({ error: 'Chọn số sao từ 1 đến 5.' }).int({ error: 'Chọn số sao từ 1 đến 5.' }).min(1, { error: 'Chọn số sao từ 1 đến 5.' }).max(5, { error: 'Chọn số sao từ 1 đến 5.' }),
  fit: z.union([z.literal(-1), z.literal(0), z.literal(1)], { error: 'Chọn độ vừa: chật, vừa hoặc rộng.' }),
  height: text(`Chiều cao tối đa ${R.heightMax} ký tự.`, 0, R.heightMax).optional(),
  title: text(`Tiêu đề từ ${R.title.min} đến ${R.title.max} ký tự.`, R.title.min, R.title.max),
  body: text(`Nội dung từ ${R.body.min} đến ${R.body.max} ký tự.`, R.body.min, R.body.max),
});
export type ReviewCreateInput = z.output<typeof reviewCreateSchema>;

const intParam = (name: string, min: number, max: number, def: number) =>
  z
    .string({ error: `Tham số ${name} không hợp lệ.` })
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return def;
      const n = /^\d{1,9}$/.test(v) ? Number(v) : NaN;
      if (!(n >= min && n <= max)) {
        ctx.addIssue({ code: 'custom', message: `Tham số ${name} không hợp lệ.` });
        return z.NEVER;
      }
      return n;
    });
const optionalInt = (name: string, min: number, max: number) =>
  z
    .string({ error: `Tham số ${name} không hợp lệ.` })
    .optional()
    .transform((v, ctx): number | undefined => {
      if (v === undefined || v === '') return undefined;
      const n = /^\d{1,9}$/.test(v) ? Number(v) : NaN;
      if (!(n >= min && n <= max)) {
        ctx.addIssue({ code: 'custom', message: `Tham số ${name} không hợp lệ.` });
        return z.NEVER;
      }
      return n;
    });

/** Danh sách công khai: `limit` 1..20 (mặc định 10), `page` >= 1, `rating` 1..5 (Should). Lỗi đầu tiên -> 422 `field`. */
const publicQuery = z.object({
  limit: intParam('limit', 1, R.listLimit.max, R.listLimit.default),
  page: intParam('page', 1, 10000, 1),
  rating: optionalInt('rating', 1, 5),
});
export type PublicReviewQuery = z.output<typeof publicQuery>;

export function parsePublicQuery(query: Record<string, unknown>): PublicReviewQuery {
  const r = publicQuery.safeParse(query);
  if (r.success) return r.data;
  const field = String(r.error.issues[0]?.path[0] ?? 'query');
  throw Errors.validation(r.error.issues[0]?.message ?? 'Tham số không hợp lệ.', field);
}

const VIEWS = ['all', 'unanswered', 'low', 'hidden'] as const;
export type AdminReviewView = (typeof VIEWS)[number];

const adminQuery = z.object({
  view: z.enum(VIEWS, { error: 'Tab không hợp lệ.' }).optional(),
  rating: optionalInt('rating', 1, 5),
  productId: uuid('Mã sản phẩm không hợp lệ.').optional(),
  page: intParam('page', 1, 10000, 1),
  limit: z
    .string({ error: 'Tham số limit không hợp lệ.' })
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return R.adminLimit.default;
      if (v !== '20' && v !== '50') {
        ctx.addIssue({ code: 'custom', message: 'Tham số limit chỉ nhận 20 hoặc 50.' });
        return z.NEVER;
      }
      return Number(v);
    }),
});
export type AdminReviewQuery = Omit<z.output<typeof adminQuery>, 'view'> & { view: AdminReviewView };

export function parseAdminQuery(query: Record<string, unknown>): AdminReviewQuery {
  const q = { ...query };
  for (const k of Object.keys(q)) if (q[k] === '') delete q[k];
  const r = adminQuery.safeParse(q);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw Errors.validation(issue?.message ?? 'Tham số không hợp lệ.', String(issue?.path[0] ?? 'query'));
  }
  return { ...r.data, view: r.data.view ?? 'all' };
}

const updatedAt = z
  .string({ error: 'Thiếu updatedAt.' })
  .refine((v) => !Number.isNaN(Date.parse(v)), { error: 'updatedAt không hợp lệ.' });

export const hideSchema = z.object({
  reason: text(`Lý do từ ${R.hideReason.min} đến ${R.hideReason.max} ký tự.`, R.hideReason.min, R.hideReason.max),
  updatedAt,
});
export const showSchema = z.object({ updatedAt });
export const replySchema = z.object({
  body: z.union([text(`Câu trả lời từ ${R.reply.min} đến ${R.reply.max} ký tự.`, R.reply.min, R.reply.max), z.null()], {
    error: `Câu trả lời từ ${R.reply.min} đến ${R.reply.max} ký tự.`,
  }),
  updatedAt,
});
