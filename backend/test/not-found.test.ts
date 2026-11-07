import { describe, expect, it } from 'vitest';
import { get } from './helpers';

describe('route lạ', () => {
  it('trả 404 not-found, no-store', async () => {
    const res = await get('/api/khong-co');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not-found');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
