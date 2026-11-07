import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getConfig } from '../config/env';

export const generateOtp = (): string => String(randomInt(0, 100_000_000)).padStart(8, '0');

/** HMAC-SHA256(secret, email|purpose|code) dạng hex (BR-AUTH-04). */
export const hashOtp = (email: string, purpose: string, code: string): string =>
  createHmac('sha256', getConfig().otpHmacSecret).update(`${email}|${purpose}|${code}`).digest('hex');

export const generateSessionToken = (): string => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex');

// Mật khẩu: bcrypt(base64(sha256(password))) để tránh giới hạn 72 byte của bcrypt với mật khẩu Unicode.
const BCRYPT_COST = process.env.NODE_ENV === 'test' ? 4 : 12;
const prehash = (password: string): string => createHash('sha256').update(password, 'utf8').digest('base64');

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(prehash(password), BCRYPT_COST);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(prehash(password), hash);

// So sánh giả khi không có bản ghi, để thời gian phản hồi không lộ email tồn tại hay không.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);
export const verifyPasswordDummy = async (password: string): Promise<false> => {
  await bcrypt.compare(prehash(password), DUMMY_HASH);
  return false;
};
