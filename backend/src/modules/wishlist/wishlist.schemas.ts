import { P1_ASSUMPTIONS } from '../../config/assumptions';
import { Errors } from '../../lib/errors';
import { BODY_MSG } from '../../lib/validate';

const MAX_ID_LEN = 64;

/** Thân `POST /account/wishlist/merge`: `productIds` mảng <= 100 chuỗi (<= 64 ký tự); sai -> `422`, `field: productIds`. Id không phải UUID KHÔNG lỗi (bị bỏ, tính vào `skipped`). */
export function parseMergeBody(body: unknown): string[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw Errors.validation(BODY_MSG);
  const ids = (body as Record<string, unknown>).productIds;
  if (!Array.isArray(ids)) throw Errors.validation('Danh sách sản phẩm chưa hợp lệ.', 'productIds');
  if (ids.length > P1_ASSUMPTIONS.wishlist.mergeMax) {
    throw Errors.validation(`Chỉ gộp tối đa ${P1_ASSUMPTIONS.wishlist.mergeMax} sản phẩm mỗi lần.`, 'productIds');
  }
  for (const v of ids) {
    if (typeof v !== 'string' || v.length > MAX_ID_LEN) throw Errors.validation('Mã sản phẩm chưa hợp lệ.', 'productIds');
  }
  return ids as string[];
}
