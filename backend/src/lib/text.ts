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
