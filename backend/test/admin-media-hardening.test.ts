import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sniffImage } from '../src/lib/image-info';
import { stripImageMetadata } from '../src/lib/image-strip';
import { resetCheckoutRateLimits } from '../src/middleware/rate-limit';
import { freshIp, get, loginAdmin, makeJpeg, makePng, makeWebp, resetCheckout, resetState, uploadRaw } from './helpers';

const GPS = 'GPSLatitude=10.7769;GPSLongitude=106.7009';
let cookie: string;

beforeAll(async () => {
  await resetState();
  await resetCheckout();
  cookie = (await loginAdmin('admin-h@nine2fine.test', { firstName: 'Quản', lastName: 'Trị' })).cookie;
});
beforeEach(() => {
  vi.useRealTimers();
  resetCheckoutRateLimits();
});

const seg = (marker: number, payload: Buffer) => {
  const h = Buffer.from([0xff, marker, 0, 0]);
  h.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([h, payload]);
};
const pngChunk = (type: string, data: Buffer) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'latin1');
  data.copy(b, 8);
  return b;
};
const riffChunk = (id: string, data: Buffer) => {
  const b = Buffer.alloc(8 + data.length + (data.length & 1));
  b.write(id, 0, 'latin1');
  b.writeUInt32LE(data.length, 4);
  data.copy(b, 8);
  return b;
};

function jpegWithExif(): Buffer {
  const base = makeJpeg(800, 1000);
  return Buffer.concat([
    base.subarray(0, 2),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from(`Exif\0\0${GPS}`)),
    seg(0xe1, Buffer.from(`http://ns.adobe.com/xap/1.0/\0${GPS}`)),
    seg(0xe2, Buffer.from('ICC_PROFILE\0data')),
    seg(0xed, Buffer.from(`Photoshop 3.0\0${GPS}`)),
    seg(0xfe, Buffer.from(GPS)),
    base.subarray(2),
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xff, 0xd9]),
  ]);
}
function pngWithMeta(): Buffer {
  const p = makePng(900, 1200);
  return Buffer.concat([
    p,
    pngChunk('eXIf', Buffer.from(GPS)),
    pngChunk('tEXt', Buffer.from(`Comment\0${GPS}`)),
    pngChunk('zTXt', Buffer.from(`x\0\0${GPS}`)),
    pngChunk('iTXt', Buffer.from(`x\0\0\0\0\0${GPS}`)),
    pngChunk('tIME', Buffer.alloc(7)),
    pngChunk('IDAT', Buffer.from([1, 2, 3])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function webpWithMeta(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x2c; // EXIF(0x08) + XMP(0x04) + bit khác 0x20
  vp8x.writeUIntLE(1199, 4, 3);
  vp8x.writeUIntLE(1599, 7, 3);
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    riffChunk('VP8X', vp8x),
    riffChunk('EXIF', Buffer.from(GPS)),
    riffChunk('XMP ', Buffer.from(GPS + 'x')),
    riffChunk('VP8 ', Buffer.from([1, 2, 3])),
  ]);
  const h = Buffer.alloc(8);
  h.write('RIFF', 0, 'latin1');
  h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}

describe('m-4 gỡ metadata ảnh tải lên', () => {
  it.each([
    ['jpeg', jpegWithExif(), 'image/jpeg', 800, 1000],
    ['png', pngWithMeta(), 'image/png', 900, 1200],
    ['webp', webpWithMeta(), 'image/webp', 1200, 1600],
  ] as const)('%s: byte lưu không còn chuỗi GPS, ảnh vẫn đọc được', async (_n, src, type, w, h) => {
    expect(src.includes(GPS)).toBe(true);
    const up = await uploadRaw(cookie, src);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const file = await get(up.body.url, { ip: freshIp() });
    expect(file.status).toBe(200);
    const stored: Buffer = file.body;
    expect(stored.includes('GPSLatitude')).toBe(false);
    expect(stored.includes('GPSLongitude')).toBe(false);
    expect(sniffImage(stored)).toMatchObject({ type, width: w, height: h });
    expect(up.body.size).toBe(stored.length);
    expect(stored.length).toBeLessThan(src.length);
  });

  it('JPEG giữ APP0, ICC (APP2) và dữ liệu quét; WebP cập nhật cờ VP8X và kích thước RIFF', () => {
    const j = stripImageMetadata(jpegWithExif(), 'image/jpeg');
    expect(j.includes('JFIF')).toBe(true);
    expect(j.includes('ICC_PROFILE')).toBe(true);
    expect(j.subarray(j.length - 8).equals(Buffer.from([0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xff, 0xd9]))).toBe(true);
    const w = stripImageMetadata(webpWithMeta(), 'image/webp');
    expect(w.readUInt32LE(4)).toBe(w.length - 8);
    expect(w[20] & 0x0c).toBe(0);
    expect(w[20]).toBe(0x20); // giữ cờ khác
    expect(w.includes('EXIF')).toBe(false);
    expect(w.includes('VP8 ')).toBe(true);
  });

  it('ảnh không có metadata giữ nguyên từng byte', () => {
    for (const [b, t] of [[makeJpeg(700, 900), 'image/jpeg'], [makePng(700, 900), 'image/png'], [makeWebp(700, 900), 'image/webp']] as const) {
      expect(stripImageMetadata(b, t).equals(b)).toBe(true);
    }
  });
});

describe('M-1 bộ đếm /api/media riêng', () => {
  it('121 GET /media không làm 429 catalog; vượt ngưỡng riêng thì 429', async () => {
    const ip = freshIp();
    const id = `up-${'0'.repeat(32)}.png`;
    for (let i = 0; i < 121; i++) expect((await get(`/api/media/${id}`, { ip })).status).toBe(404);
    expect((await get('/api/products', { ip })).status).toBe(200);
    for (let i = 122; i <= 600; i++) await get(`/api/media/${id}`, { ip });
    const limited = await get(`/api/media/${id}`, { ip });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate-limited');
    expect((await get('/api/products', { ip })).status).toBe(200); // bộ đếm catalog không bị media tiêu
  });
});
