/**
 * Chuẩn hoá tiếng Việt để tìm kiếm không dấu (BR-CAT-13): NFC -> NFD, bỏ dấu, hạ chữ thường,
 * đ -> d, gộp khoảng trắng, trim. Cùng thuật toán với normalize() của mock FE.
 */
export function foldVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Từ khoá tìm kiếm: trim + gộp khoảng trắng + NFC, foldVi, tách theo khoảng trắng. */
export function parseSearchTokens(q: string): string[] {
  const folded = foldVi(q.normalize('NFC'));
  return folded === '' ? [] : folded.split(' ');
}

/** Chuỗi nhập của admin (BR-INV-11): NFC, gộp mọi khoảng trắng (kể cả xuống dòng) thành 1, trim. */
export const cleanText = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Như `cleanText` nhưng giữ xuống dòng (mô tả): mỗi dòng gộp khoảng trắng ngang + trim, rồi trim cả chuỗi. */
export const cleanMultiline = (s: string): string =>
  s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim();
