import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AppError, Errors } from '../src/lib/errors';

const quote = { lines: [], pricing: { total: 1 } };
const cases: Array<[string, () => AppError, number, Record<string, unknown>]> = [
  ['invalid-address', () => Errors.invalidAddress(), 422, { field: 'address.wardCode' }],
  ['stock-changed', () => Errors.stockChanged([{ variantId: 'v1', available: 2 }], quote), 409, { stockIssues: [{ variantId: 'v1', available: 2 }], quote }],
  ['price-changed', () => Errors.priceChanged(quote), 409, { quote }],
  ['voucher-changed', () => Errors.voucherChanged(['T50K'], quote), 409, { removedVoucherCodes: ['T50K'], quote }],
  ['idempotency-conflict', () => Errors.idempotencyConflict(), 409, {}],
  ['possible-duplicate', () => Errors.possibleDuplicate('N2F2611040427'), 409, { existingOrderCode: 'N2F2611040427' }],
  ['not-cancellable', () => Errors.notCancellable(), 409, {}],
];

// T-ERR-01 (phần mã): mỗi mã lỗi Slice 3 có HTTP + trường mở rộng đúng, không lộ stack.
describe('T-ERR-01 mã lỗi Slice 3', () => {
  const app = createApp({
    extraApiRoutes: (r) => {
      for (const [code, make] of cases) r.get(`/__err/${code}`, () => { throw make(); });
    },
  });
  it.each(cases)('%s', async (code, _make, status, extra) => {
    const res = await request(app).get(`/api/__err/${code}`);
    expect(res.status).toBe(status);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error).toMatchObject({ code, ...extra });
    expect(typeof res.body.error.message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select |prisma/i);
  });
});
