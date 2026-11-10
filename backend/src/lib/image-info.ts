/**
 * Nhận dạng ảnh theo nội dung tệp (magic bytes) và đọc kích thước từ header, không dùng thư viện (BR-INV-24).
 * Không tôn trọng EXIF xoay. Thiếu byte / cấu trúc hỏng -> null (xử lý như sai định dạng).
 */
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ImageInfo {
  type: ImageType;
  ext: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (b: Buffer, sig: number[], at = 0): boolean => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, at: number, len: number): string => (b.length >= at + len ? b.toString('latin1', at, at + len) : '');

function pngSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++; // byte đệm 0xFF
    if (i >= b.length) return null;
    const m = b[i++];
    if (m === 0xd9 || m === 0xda) return null; // EOI / SOS trước SOF: hỏng
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) continue; // marker không có độ dài
    if (i + 2 > b.length) return null;
    const len = b.readUInt16BE(i);
    if (len < 2) return null;
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) {
      if (i + 7 > b.length) return null;
      return { height: b.readUInt16BE(i + 3), width: b.readUInt16BE(i + 5) };
    }
    i += len;
  }
  return null;
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const fourcc = ascii(b, 12, 4);
  if (fourcc === 'VP8 ') {
    if (b.length < 30 || !startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    return { width: (b0 | ((b1 & 0x3f) << 8)) + 1, height: ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1 };
  }
  if (fourcc === 'VP8X') {
    if (b.length < 30) return null;
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

export function sniffImage(buf: Buffer): ImageInfo | null {
  let type: ImageType;
  let size: { width: number; height: number } | null;
  let ext: ImageInfo['ext'];
  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    type = 'image/jpeg';
    ext = 'jpg';
    size = jpegSize(buf);
  } else if (startsWith(buf, PNG_SIG)) {
    type = 'image/png';
    ext = 'png';
    size = pngSize(buf);
  } else if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    type = 'image/webp';
    ext = 'webp';
    size = webpSize(buf);
  } else {
    return null;
  }
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return { type, ext, width: size.width, height: size.height };
}
