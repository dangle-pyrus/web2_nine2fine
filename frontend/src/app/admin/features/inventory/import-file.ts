/**
 * Reads the first sheet of a CSV or Excel (.xlsx) file into rows of text, in the browser and without
 * a library: an .xlsx file is a zip of XML parts, unpacked here with `DecompressionStream`.
 */

export type SheetRows = string[][];

export async function readSheet(file: File): Promise<SheetRows> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls'))
    throw new Error('File .xls (Excel 97-2003) chưa hỗ trợ. Hãy lưu lại thành .xlsx hoặc .csv.');
  return parseCsv(await file.text());
}

// ---------- CSV ----------

export function parseCsv(text: string): SheetRows {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce(
    (best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best),
    ',',
  );
  const rows: SheetRows = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

// ---------- XLSX ----------

interface ZipEntry {
  method: number;
  size: number;
  offset: number;
}

async function readXlsx(buffer: ArrayBuffer): Promise<SheetRows> {
  const view = new DataView(buffer);
  const entries = zipEntries(view);
  const text = async (path: string): Promise<string | null> => {
    const entry = entries.get(path);
    return entry ? unzip(buffer, view, entry) : null;
  };

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const firstSheet = byTag(xml(workbook), 'sheet')[0];
    const relId =
      firstSheet?.getAttribute('r:id') ??
      firstSheet?.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
    const rel = byTag(xml(rels), 'Relationship').find((el) => el.getAttribute('Id') === relId);
    const target = rel?.getAttribute('Target');
    if (target)
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  const shared = await text('xl/sharedStrings.xml');
  const strings = shared ? byTag(xml(shared), 'si').map((si) => allText(si)) : [];
  const sheet = await text(sheetPath);
  if (!sheet) throw new Error('Không đọc được trang tính đầu tiên trong file Excel.');

  const rows: SheetRows = [];
  for (const rowEl of byTag(xml(sheet), 'row')) {
    const row: string[] = [];
    let next = 0;
    for (const c of byTag(rowEl, 'c')) {
      const ref = c.getAttribute('r');
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let value: string;
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = allText(byTag(c, 'is')[0] ?? c);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v;
      row[index] = value;
    }
    rows.push(Array.from(row, (value) => value ?? ''));
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

function zipEntries(view: DataView): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('File Excel bị hỏng hoặc không phải định dạng .xlsx.');
  const total = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < total; n++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const size = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const offset = view.getUint32(pos + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, pos + 46, nameLen));
    entries.set(name, { method, size, offset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function unzip(buffer: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buffer, start, entry.size);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('File Excel dùng kiểu nén chưa hỗ trợ.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function byTag(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local));
}

/** Text of an `<si>` / `<is>`: every `<t>` run, skipping phonetic hints (`<rPh>`). */
function allText(el: Element): string {
  return byTag(el, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

// ---------- Column mapping ----------

export type ImportField = 'sku' | 'product_name' | 'color' | 'size' | 'quantity';

export const IMPORT_FIELDS: { key: ImportField; label: string; required: boolean }[] = [
  { key: 'product_name', label: 'Tên sản phẩm', required: true },
  { key: 'color', label: 'Màu', required: true },
  { key: 'size', label: 'Size', required: true },
  { key: 'quantity', label: 'Số lượng nhập', required: true },
  { key: 'sku', label: 'SKU (không bắt buộc)', required: false },
];

const SYNONYMS: Record<ImportField, string[]> = {
  sku: ['sku', 'masku', 'skucode', 'mabienthe', 'variantsku'],
  product_name: [
    'productname',
    'product',
    'name',
    'tensanpham',
    'sanpham',
    'ten',
    'tensp',
    'itemname',
    'title',
  ],
  color: ['color', 'colour', 'mau', 'mausac', 'colorname', 'tenmau'],
  size: ['size', 'kichco', 'kichthuoc', 'co', 'sizename'],
  quantity: [
    'quantity',
    'qty',
    'soluong',
    'sl',
    'soluongnhap',
    'slnhap',
    'nhap',
    'amount',
    'count',
    'stock',
    'receivedqty',
  ],
};

/** Lower case, no Vietnamese marks, no spaces or punctuation: "Số lượng" → "soluong". */
export function normalizeKey(text: string): string {
  return fold(text).replace(/[^a-z0-9]/g, '');
}

/** Lower case, no Vietnamese marks, single spaces: for matching names and colours. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Column index per field, guessed from the header names (-1 when no column fits). */
export function detectMapping(header: string[]): Record<ImportField, number> {
  const keys = header.map(normalizeKey);
  const mapping = {} as Record<ImportField, number>;
  const used = new Set<number>();
  // Exact names first, then names that start with a synonym (e.g. "quantity_received").
  for (const pass of ['exact', 'prefix'] as const) {
    for (const field of IMPORT_FIELDS.map((f) => f.key)) {
      if (mapping[field] !== undefined && mapping[field] >= 0) continue;
      const index = keys.findIndex(
        (key, i) =>
          !used.has(i) &&
          !!key &&
          SYNONYMS[field].some((syn) =>
            pass === 'exact' ? key === syn : syn.length > 2 && key.startsWith(syn),
          ),
      );
      mapping[field] = index;
      if (index >= 0) used.add(index);
    }
  }
  return mapping;
}
