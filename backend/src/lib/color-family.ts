import { foldVi } from './text';

/**
 * Nhóm màu cho bộ lọc storefront (2026-11-21). Dữ liệu thật có ~40 tên màu ("Xanh navy", "Trắng ngọc trai", ...),
 * bộ lọc hiện ~11 nhóm. Tên màu -> nhóm theo bảng tường minh trước, rồi theo tiền tố (màu admin mới thêm vẫn vào nhóm).
 * Khớp `PRODUCT_COLORS` ở FE (features/catalog/models/product.ts).
 */
/** 2026-11-21 (Thắng, hướng minimalist): không có nhóm "Nhiều màu"; màu ghép / hoạ tiết không vào nhóm nào (không lọc được). */
export const COLOR_FAMILIES = ['Đen', 'Trắng', 'Be', 'Xám', 'Nâu', 'Xanh dương', 'Xanh lá', 'Đỏ', 'Tím', 'Vàng'] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];
/** Ô màu đại diện cho nhóm (bộ lọc). */
export const COLOR_FAMILY_HEX: Record<ColorFamily, string> = {
  Đen: '#1a1a1a', Trắng: '#f7f5ef', Be: '#d8c3a5', Xám: '#8a8a8a', Nâu: '#6f4e37', 'Xanh dương': '#2e4a7d',
  'Xanh lá': '#7fb8a4', Đỏ: '#8e2a33', Tím: '#b79fcb', Vàng: '#e2bd48',
};

const EXPLICIT: Record<string, ColorFamily> = {
  kem: 'Trắng',
  'trang kem - be': 'Be',
  'vang camel nhat': 'Be',
  kaki: 'Be',
  'kaki dam': 'Be',
  ghi: 'Xám',
  'ghi xam': 'Xám',
  'man chin dam': 'Đỏ',
  'xanh luc/nau nhat': 'Xanh lá',
  'xanh bac ha': 'Xanh lá',
  'xanh mint': 'Xanh lá',
  white: 'Trắng',
  black: 'Đen',
};
/** Tiền tố (đã bỏ dấu, chữ thường) -> nhóm; thứ tự quan trọng: "xanh la" / "xanh luc" trước "xanh". */
const PREFIX: Array<[string, ColorFamily]> = [
  ['den', 'Đen'],
  ['trang', 'Trắng'],
  ['be', 'Be'],
  ['xam', 'Xám'],
  ['nau', 'Nâu'],
  ['xanh la', 'Xanh lá'],
  ['xanh luc', 'Xanh lá'],
  ['xanh reu', 'Xanh lá'],
  ['xanh', 'Xanh dương'],
  ['do', 'Đỏ'],
  ['hong', 'Đỏ'],
  ['tim', 'Tím'],
  ['vang', 'Vàng'],
  ['cam', 'Vàng'],
];

export function colorFamilyOf(colorName: string): ColorFamily | null {
  const k = foldVi(colorName).trim().replace(/\s+/g, ' ');
  if (EXPLICIT[k]) return EXPLICIT[k];
  return PREFIX.find(([p]) => k === p || k.startsWith(`${p} `) || k.startsWith(`${p}/`) || k.startsWith(`${p}-`))?.[1] ?? null;
}

/** Tên nhóm từ query (không phân biệt hoa thường / dấu) -> nhóm, hoặc null nếu không phải tên nhóm. */
export function parseColorFamily(q: string): ColorFamily | null {
  const k = foldVi(q).trim();
  return COLOR_FAMILIES.find((f) => foldVi(f) === k) ?? null;
}
