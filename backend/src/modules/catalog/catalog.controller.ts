import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../../lib/errors';
import { normalizeSlug, parseListQuery } from './catalog.schemas';
import * as service from './catalog.service';

const SHORT = 'public, max-age=10';
const LONG = 'public, max-age=3600';

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

// BR-CAT-17: luôn rỗng, không truy vấn DB.
export const reviews = wrap((_req, res) => {
  res.set('Cache-Control', SHORT).json([]);
});

export const sizeChart = wrap(async (req, res) => {
  const category = String(req.params.category ?? '').trim().toLowerCase();
  const chart = await service.getSizeChart(category);
  res.set('Cache-Control', LONG).json(chart);
});
