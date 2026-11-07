import { describe, expect, it } from 'vitest';
import { foldVi, parseSearchTokens } from '../src/lib/text';

describe('T-CAT-60 foldVi', () => {
  it('bỏ dấu, đ -> d, hạ chữ thường, gộp khoảng trắng', () => {
    expect(foldVi('Đầm')).toBe('dam');
    expect(foldVi('ĐÀ NẴNG')).toBe('da nang');
    expect(foldVi('  Áo   sơ  mi ')).toBe('ao so mi');
  });
  it('NFD và NFC cho cùng kết quả', () => {
    const nfc = 'đầm'.normalize('NFC');
    const nfd = 'đầm'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(foldVi(nfd)).toBe(foldVi(nfc));
    expect(parseSearchTokens(nfd)).toEqual(['dam']);
  });
  it('tách từ; rỗng -> không có từ', () => {
    expect(parseSearchTokens('  Blazer   Everyday ')).toEqual(['blazer', 'everyday']);
    expect(parseSearchTokens('   ')).toEqual([]);
  });
});
