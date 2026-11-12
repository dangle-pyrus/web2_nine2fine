import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { getConfig } from '../../config/env';
import { Errors } from '../../lib/errors';

/**
 * Số tài khoản nhận hoàn (plan mục 7). AES-256-GCM, `base64(iv(12) || tag(16) || ciphertext)`, AAD = `return_id`
 * (đổi chỗ bản mã không giải được). Khoá = `RETURN_ACCOUNT_KEY` (32 byte, base64). Thiếu khoá -> `unavailable`
 * (không ghi tài khoản sai chỗ). KHÔNG bao giờ log số tài khoản hay bản mã.
 */

function key(): Buffer {
  const k = getConfig().returns.accountKey;
  if (!k) throw Errors.unavailable();
  return k;
}

export const hasAccountKey = (): boolean => getConfig().returns.accountKey !== null;

export function encryptAccountNumber(plain: string, returnId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(returnId, 'utf8'));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

/** Giải mã; sai khoá / sai AAD / bản mã hỏng -> ném `Error` (không lộ nội dung). */
export function decryptAccountNumber(enc: string, returnId: string): string {
  const raw = Buffer.from(enc, 'base64');
  if (raw.length < 29) throw new Error('account-cipher-invalid');
  const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAAD(Buffer.from(returnId, 'utf8'));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

export const last4Of = (accountNumber: string): string => accountNumber.slice(-4);

/**
 * HMAC của số tài khoản để đưa vào `request_hash` của idempotency (số 6..19 chữ số có thể dò ngược nếu chỉ SHA-256).
 * Thiếu `RETURN_ACCOUNT_KEY` (đơn không phải COD không cần khoá) thì dẫn xuất từ bí mật OTP: vẫn không đảo ngược được.
 */
export function hmacForHash(accountNumber: string): string {
  const cfg = getConfig();
  const k = cfg.returns.accountKey ?? createHash('sha256').update(`return-hash|${cfg.otpHmacSecret}`).digest();
  return createHmac('sha256', k).update(accountNumber).digest('hex');
}
