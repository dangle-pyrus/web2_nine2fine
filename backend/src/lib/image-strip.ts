/**
 * Gỡ metadata ảnh (EXIF / XMP / bình luận / thời gian) trước khi lưu, không dùng thư viện (m-4, BR-INV-24).
 * Giữ mọi dữ liệu ảnh; cấu trúc không đọc được -> trả nguyên buffer (sniffImage ở trên đã chặn ảnh hỏng).
 */
import type { ImageType } from './image-info';

function stripJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return b;
    let j = i;
    while (j < b.length && b[j] === 0xff) j++;
    if (j >= b.length) return b;
    const m = b[j];
    if (m === 0xda) {
      out.push(b.subarray(i)); // SOS: phần còn lại là dữ liệu ảnh nén, giữ nguyên
      return Buffer.concat(out);
    }
    if (m === 0xd9) {
      out.push(b.subarray(i));
      return Buffer.concat(out);
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      out.push(b.subarray(i, j + 1));
      i = j + 1;
      continue;
    }
    if (j + 3 > b.length) return b;
    const end = j + 1 + b.readUInt16BE(j + 1);
    if (end > b.length || end < j + 3) return b;
    if (!(m === 0xe1 || m === 0xed || m === 0xfe)) out.push(b.subarray(i, end)); // bỏ APP1, APP13, COM
    i = end;
  }
  return Buffer.concat([...out, b.subarray(i)]);
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const end = i + 12 + b.readUInt32BE(i);
    if (end > b.length) return b;
    if (!PNG_DROP.has(b.toString('latin1', i + 4, i + 8))) out.push(b.subarray(i, end));
    i = end;
  }
  if (i !== b.length) out.push(b.subarray(i));
  return Buffer.concat(out);
}

function stripWebp(b: Buffer): Buffer {
  if (b.length < 20) return b;
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = b.readUInt32LE(i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > b.length) return b;
    const id = b.toString('latin1', i, i + 4);
    if (id !== 'EXIF' && id !== 'XMP ') chunks.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  const body = Buffer.concat(chunks);
  if (body.length >= 18 && body.toString('latin1', 0, 4) === 'VP8X') {
    body[8] &= ~0x0c; // bit EXIF (0x08) và XMP (0x04)
  }
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(4 + body.length, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

export function stripImageMetadata(buf: Buffer, type: ImageType): Buffer {
  try {
    if (type === 'image/jpeg') return stripJpeg(buf);
    if (type === 'image/png') return stripPng(buf);
    return stripWebp(buf);
  } catch {
    return buf;
  }
}
