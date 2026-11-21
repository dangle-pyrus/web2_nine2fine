import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../../lib/errors';
import { normalizeSlug, parseListQuery } from './catalog.schemas';
import * as service from './catalog.service';
import { listPublicReviews } from '../reviews/review.service';

const SHORT = 'public, max-age=10';
const SIZE_CHART = 'public, max-age=60';

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

export const list = wrap(async (req, res) => {
  const page = await service.listProducts(parseListQuery(req.query));
  res.set('Cache-Control', SHORT).json(page);
});

export const detail = wrap(async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug ?? ''));
  if (!slug) throw Errors.notFound();
  const product = await service.getProductBySlug(slug);
  res.set('Cache-Control', SHORT).json(product);
});

// Slice 10 (BR-REV-05): danh sách đánh giá công khai dạng trang + summary (thay `[]` của BR-CAT-17).
export const reviews = wrap(async (req, res) => {
  const page = await listPublicReviews(String(req.params.productId ?? ''), { ...req.query });
  res.set('Cache-Control', SHORT).json(page);
});

export const sizeChart = wrap(async (req, res) => {
  const category = String(req.params.category ?? '').trim().toLowerCase();
  const chart = await service.getSizeChart(category);
  res.set('Cache-Control', SIZE_CHART).json(chart);
});

export const facets = wrap(async (_req, res) => {
  res.set('Cache-Control', SIZE_CHART).json(await service.getCatalogFacets());
});
