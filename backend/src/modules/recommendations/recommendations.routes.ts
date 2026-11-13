import { Router } from 'express';

/**
 * Slice 10, lát 10.6 (BR-REC, plan mục 6.4). Khung gắn sẵn ở `app.ts` (lát 10.1); chưa có endpoint.
 * `GET /api/recommendations`: công khai chỉ đọc như catalog (gắn TRƯỚC originGuard; cần `catalogRateLimit` + chặn phương thức ghi -> 404).
 */
export const recommendationsRouter = Router();
