import { z } from 'zod';
import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';

const C = P1_ASSUMPTIONS.content;

/** `blocks[2].title`, `moments[1].lines[0]`: giữ MỌI chỉ số (khác `lib/validate.fieldOf`). */
export function pathOf(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out || 'body';
}

export interface FieldIssue {
  field: string;
  message: string;
}

/** Gom MỌI lỗi theo đường dẫn (trùng đường dẫn chỉ giữ lỗi đầu) -> `422 fieldErrors`. */
export function throwIssues(issues: FieldIssue[]): never {
  const seen = new Set<string>();
  const uniq = issues.filter((i) => (seen.has(i.field) ? false : (seen.add(i.field), true)));
  throw Errors.validationMany(uniq);
}

// eslint-disable-next-line no-control-regex
const CONTROL_ANY = /[\u0000-\u001F\u007F-\u009F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_NO_NL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
const len = (s: string): number => [...s].length;

/** NFC, cắt hai đầu; `multiline` cho phép xuống dòng (description / lines), còn lại không ký tự điều khiển nào. */
const str = (msg: string, min: number, max: number, multiline = false) =>
  z
    .string({ error: msg })
    .transform((v) => v.normalize('NFC').replace(/\r\n?/g, '\n').trim())
    .refine((v) => !(multiline ? CONTROL_NO_NL : CONTROL_ANY).test(v) && len(v) >= min && len(v) <= max, { error: msg });

const HREF_MSG = 'Liên kết chỉ là đường dẫn nội bộ bắt đầu bằng "/" (không "//", không khoảng trắng).';
const href = z
  .string({ error: HREF_MSG })
  .transform((v) => v.trim())
  .refine((v) => len(v) >= 1 && len(v) <= C.hrefMax && /^\/([^/\\\s][^\\\s]*)?$/.test(v) && !CONTROL_ANY.test(v), { error: HREF_MSG });

const MEDIA_MSG = 'Ảnh không hợp lệ.';
const mediaId = z
  .string({ error: MEDIA_MSG })
  .transform((v) => v.trim())
  .refine((v) => v.length >= 1 && v.length <= 100 && !CONTROL_ANY.test(v) && !/\s/.test(v), { error: MEDIA_MSG });

const BLOCK_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const blockId = z.string({ error: 'Mã khối gồm chữ thường, số, dấu gạch ngang (tối đa 40 ký tự).' }).refine((v) => BLOCK_ID_RE.test(v), {
  error: 'Mã khối gồm chữ thường, số, dấu gạch ngang (tối đa 40 ký tự).',
});
const enabled = z.boolean({ error: 'Giá trị bật / tắt không hợp lệ.' }).optional();

const SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'bestselling'] as const;
const QUERY_KEYS = ['sort', 'gender', 'category', 'moment', 'size', 'color', 'maxPrice', 'available', 'sale', 'q'];

const categoryItem = z.object({
  label: str('Tên danh mục từ 1 đến 40 ký tự.', 1, C.labelMax),
  href,
  mediaId,
});

const momentItem = z.object({
  moment: z.enum(C.moments, { error: 'Mã dịp mặc không hợp lệ.' }),
  label: str('Tên từ 1 đến 40 ký tự.', 1, C.labelMax),
  lines: z
    .array(str(`Mỗi dòng từ 1 đến ${C.momentLineMax} ký tự.`, 1, C.momentLineMax, true), { error: 'Cần 1 hoặc 2 dòng chữ.' })
    .min(1, { error: 'Cần 1 hoặc 2 dòng chữ.' })
    .max(C.momentLinesMax, { error: 'Tối đa 2 dòng chữ.' }),
  mediaId,
});

const campaign = z.object({
  kind: z.literal('campaign'),
  id: blockId,
  enabled,
  eyebrow: str('Dòng nhỏ tối đa 40 ký tự.', 0, C.eyebrowMax),
  title: str('Tiêu đề tối đa 80 ký tự.', 0, C.titleMax),
  description: str('Mô tả tối đa 200 ký tự.', 0, C.descriptionMax, true),
  href,
  mediaId,
  mobileMediaId: mediaId,
  titleLang: z.literal('en', { error: 'Ngôn ngữ tiêu đề không hợp lệ.' }).optional(),
  member: z
    .object({ description: str('Mô tả tối đa 200 ký tự.', 0, C.descriptionMax, true), href })
    .optional(),
});

const productsBlock = z.object({
  kind: z.literal('products'),
  id: blockId,
  enabled,
  label: str('Nhãn tối đa 80 ký tự.', 0, C.titleMax),
  cards: z
    .array(
      z.object({
        title: str('Tiêu đề tối đa 80 ký tự.', 0, C.titleMax),
        caption: str('Chú thích tối đa 40 ký tự.', 0, C.captionMax),
        href,
        mediaId,
      }),
      { error: 'Danh sách thẻ không hợp lệ.' },
    )
    .max(C.productCardsMax, { error: 'Tối đa 6 thẻ.' }),
});

const shopBlock = z.object({
  kind: z.literal('shop'),
  id: blockId,
  enabled,
  label: str('Nhãn tối đa 80 ký tự.', 0, C.titleMax),
  sort: z.enum(SORTS, { error: 'Cách sắp xếp không hợp lệ.' }),
  href,
  queryParams: z
    .record(z.string(), z.string({ error: 'Giá trị tối đa 60 ký tự.' }).refine((v) => len(v) <= 60 && !CONTROL_ANY.test(v), { error: 'Giá trị tối đa 60 ký tự.' }), {
      error: 'Tham số lọc không hợp lệ.',
    })
    .refine((o) => Object.keys(o).length <= 8 && Object.keys(o).every((k) => QUERY_KEYS.includes(k)), { error: 'Tham số lọc không hợp lệ (tối đa 8, đúng tên).' })
    .optional(),
});

const categoriesBlock = z.object({ kind: z.literal('categories'), id: blockId, enabled });

const block = z.discriminatedUnion('kind', [campaign, productsBlock, shopBlock, categoriesBlock], { error: 'Loại khối không hợp lệ.' });

const updatedAt = z
  .union([z.string(), z.null()], { error: 'updatedAt không hợp lệ.' })
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { error: 'updatedAt không hợp lệ.' });

export const homeContentSchema = z.object({
  categories: z
    .array(categoryItem, { error: 'Danh mục không hợp lệ.' })
    .min(1, { error: 'Cần ít nhất 1 danh mục.' })
    .max(C.maxCategories, { error: 'Tối đa 8 danh mục.' }),
  moments: z.array(momentItem, { error: 'Dịp mặc không hợp lệ.' }).length(4, { error: 'Cần đúng 4 dịp mặc.' }),
  blocks: z.array(block, { error: 'Danh sách khối không hợp lệ.' }).max(C.maxBlocks, { error: `Tối đa ${C.maxBlocks} khối.` }),
  updatedAt,
});
export type HomeContentInput = z.output<typeof homeContentSchema>;

/** Kiểm cấu trúc + thứ tự Moment + `id` khối duy nhất. Trả giá trị chuẩn hoá hoặc danh sách lỗi theo đường dẫn. */
export function parseHomeContent(raw: unknown): { ok: true; value: HomeContentInput } | { ok: false; issues: FieldIssue[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, issues: [{ field: 'body', message: 'Dữ liệu gửi lên không hợp lệ.' }] };
  const r = homeContentSchema.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      issues: r.error.issues.map((i) => ({ field: pathOf(i.path), message: i.message })),
    };
  }
  const issues: FieldIssue[] = [];
  r.data.moments.forEach((m, i) => {
    if (m.moment !== C.moments[i]) issues.push({ field: `moments[${i}].moment`, message: 'Thứ tự dịp mặc phải là work, dinner, event, weekend.' });
  });
  const seen = new Set<string>();
  r.data.blocks.forEach((b, i) => {
    if (seen.has(b.id)) issues.push({ field: `blocks[${i}].id`, message: 'Mã khối bị trùng.' });
    seen.add(b.id);
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: r.data };
}

/** Mọi `mediaId` trong thân THÔ (best-effort, không phụ thuộc kết quả Zod) kèm đường dẫn: để báo ảnh lạ cùng lượt với lỗi khác. */
export function collectMediaIds(raw: unknown): Array<{ field: string; id: string }> {
  const out: Array<{ field: string; id: string }> = [];
  const o = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const add = (field: string, v: unknown): void => {
    if (typeof v === 'string' && v.trim() !== '') out.push({ field, id: v.trim() });
  };
  const root = o(raw);
  if (!root) return out;
  (Array.isArray(root.categories) ? root.categories : []).forEach((c, i) => add(`categories[${i}].mediaId`, o(c)?.mediaId));
  (Array.isArray(root.moments) ? root.moments : []).forEach((m, i) => add(`moments[${i}].mediaId`, o(m)?.mediaId));
  (Array.isArray(root.blocks) ? root.blocks : []).forEach((b, i) => {
    const bo = o(b);
    if (!bo) return;
    add(`blocks[${i}].mediaId`, bo.mediaId);
    add(`blocks[${i}].mobileMediaId`, bo.mobileMediaId);
    (Array.isArray(bo.cards) ? bo.cards : []).forEach((c, j) => add(`blocks[${i}].cards[${j}].mediaId`, o(c)?.mediaId));
  });
  return out;
}

/* ---------------------------------- bảng size ---------------------------------- */

const SC = C.sizeChart;
const cellOk = (v: unknown): v is string => typeof v === 'string';

export interface SizeChartData {
  body: Array<{ size: string; values: Record<string, string> }>;
  garment: Array<{ size: string; values: Record<string, string> }>;
  bodyColumns: string[];
  garmentColumns: string[];
}

const clean = (v: string): string => v.normalize('NFC').replace(/\r\n?/g, '\n').trim();

/** Kiểm nguyên bảng (BR-CMS-03), MỌI lỗi theo đường dẫn. `updatedAt` kiểm riêng ở service. */
export function parseSizeChart(raw: unknown): { ok: true; value: SizeChartData; updatedAt: string | null } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const root = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!root) return { ok: false, issues: [{ field: 'body', message: 'Dữ liệu gửi lên không hợp lệ.' }] };

  const columnsOf = (key: 'bodyColumns' | 'garmentColumns'): string[] => {
    const v = root[key];
    if (!Array.isArray(v) || v.length < 1 || v.length > SC.maxCols) {
      issues.push({ field: key, message: `Cần từ 1 đến ${SC.maxCols} cột.` });
      return [];
    }
    const out: string[] = [];
    const seen = new Set<string>();
    v.forEach((c, i) => {
      const name = typeof c === 'string' ? clean(c) : '';
      if (typeof c !== 'string' || len(name) < 1 || len(name) > SC.columnMax || CONTROL_ANY.test(name)) {
        issues.push({ field: `${key}[${i}]`, message: `Tên cột từ 1 đến ${SC.columnMax} ký tự.` });
      } else if (seen.has(name)) {
        issues.push({ field: `${key}[${i}]`, message: 'Tên cột bị trùng.' });
      } else seen.add(name);
      out.push(name);
    });
    return out;
  };
  const bodyColumns = columnsOf('bodyColumns');
  const garmentColumns = columnsOf('garmentColumns');

  const rowsOf = (key: 'body' | 'garment', cols: string[]): SizeChartData['body'] => {
    const v = root[key];
    if (!Array.isArray(v) || v.length < 1 || v.length > SC.maxRows) {
      issues.push({ field: key, message: `Cần từ 1 đến ${SC.maxRows} hàng.` });
      return [];
    }
    const sizes = new Set<string>();
    return v.map((row, i) => {
      const ro = row !== null && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
      const size = ro && typeof ro.size === 'string' ? clean(ro.size) : '';
      if (!ro || len(size) < SC.sizeLabel.min || len(size) > SC.sizeLabel.max || CONTROL_ANY.test(size)) {
        issues.push({ field: `${key}[${i}].size`, message: `Nhãn size từ ${SC.sizeLabel.min} đến ${SC.sizeLabel.max} ký tự.` });
      } else if (sizes.has(size)) {
        issues.push({ field: `${key}[${i}].size`, message: 'Nhãn size bị trùng.' });
      } else sizes.add(size);
      const vo = ro && ro.values !== null && typeof ro.values === 'object' && !Array.isArray(ro.values) ? (ro.values as Record<string, unknown>) : null;
      const values: Record<string, string> = {};
      if (!vo) {
        issues.push({ field: `${key}[${i}].values`, message: 'Thiếu số đo.' });
        return { size, values };
      }
      for (const c of cols) {
        if (c === '') continue;
        const cell = vo[c];
        if (cell === undefined) {
          issues.push({ field: `${key}[${i}].values.${c}`, message: 'Thiếu số đo cho cột này.' });
        } else {
          const t = cellOk(cell) ? clean(cell) : '';
          if (!cellOk(cell) || t === '' || len(t) > SC.cellMax || CONTROL_ANY.test(t)) {
            issues.push({ field: `${key}[${i}].values.${c}`, message: `Ô từ 1 đến ${SC.cellMax} ký tự.` });
          } else values[c] = t;
        }
      }
      for (const k of Object.keys(vo)) {
        if (!cols.includes(k)) issues.push({ field: `${key}[${i}].values.${k}`, message: 'Cột này không có trong danh sách cột.' });
      }
      return { size, values };
    });
  };
  const body = rowsOf('body', bodyColumns);
  const garment = rowsOf('garment', garmentColumns);

  const u = root.updatedAt;
  if (u !== null && (typeof u !== 'string' || Number.isNaN(Date.parse(u)))) issues.push({ field: 'updatedAt', message: 'updatedAt không hợp lệ.' });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { body, garment, bodyColumns, garmentColumns }, updatedAt: u as string | null };
}
