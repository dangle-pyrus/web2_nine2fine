import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { AdminPromotionsApi } from './admin-apis';
import { adminBase, adminErrors } from './http-support';
import type { Page, Promotion, PromotionInput, PromotionQuery, PromotionState } from './models';

interface WirePromotion {
  id: string;
  code: string;
  title: string;
  type: Promotion['type'];
  value: number | null;
  maxDiscount: number | null;
  minSubtotal: number;
  categories: string[];
  usageLimit: number | null;
  perCustomerLimit: number;
  audience: 'everyone' | 'members';
  firstOrderOnly: boolean;
  excludeSaleItems: boolean;
  used: number;
  hasRedemptions: boolean;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
  state: PromotionState;
  createdAt: string;
  updatedAt: string;
}

interface WirePromotionPage {
  items: WirePromotion[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

function toPromotion(wire: WirePromotion): Promotion {
  return {
    id: wire.id,
    code: wire.code,
    title: wire.title,
    type: wire.type,
    // Free shipping has no value: the form treats "no value" as 0.
    value: wire.value ?? 0,
    maxDiscount: wire.maxDiscount,
    minSubtotal: wire.minSubtotal,
    categories: wire.categories,
    usageLimit: wire.usageLimit,
    perCustomerLimit: wire.perCustomerLimit,
    audience: wire.audience,
    // Won't (S6-Q7): tiers and named customers do not exist in the API.
    tiers: [],
    customerIds: [],
    firstOrderOnly: wire.firstOrderOnly,
    excludeSaleItems: wire.excludeSaleItems,
    used: wire.used,
    hasRedemptions: wire.hasRedemptions,
    // A voucher that predates the schema has no start: it counts as started when created.
    startsAt: wire.startsAt ?? wire.createdAt,
    endsAt: wire.endsAt,
    enabled: wire.enabled,
    state: wire.state,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

function toWire(input: PromotionInput, withVersion: boolean): Record<string, unknown> {
  return {
    code: input.code,
    title: input.title,
    type: input.type,
    value: input.type === 'free-shipping' ? null : input.value,
    maxDiscount: input.type === 'percent' ? input.maxDiscount : null,
    minSubtotal: input.minSubtotal,
    categories: input.categories.slice(0, 1),
    usageLimit: input.usageLimit,
    perCustomerLimit: input.perCustomerLimit,
    audience: input.audience === 'members' ? 'members' : 'everyone',
    firstOrderOnly: input.firstOrderOnly ?? false,
    excludeSaleItems: input.excludeSaleItems ?? false,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    enabled: input.enabled,
    ...(withVersion && input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

@Injectable()
export class HttpAdminPromotionsApi implements AdminPromotionsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${adminBase()}/promotions`;

  list(query: PromotionQuery) {
    const params: Record<string, string> = {
      page: String(query.page),
      limit: String(query.pageSize),
    };
    if (query.search) params['q'] = query.search;
    if (query.state) params['state'] = query.state;
    return this.http.get<WirePromotionPage>(this.base, { params }).pipe(
      adminErrors(),
      map((wire): Page<Promotion> => ({
        items: wire.items.map(toPromotion),
        total: wire.total,
        page: wire.page,
        pageSize: wire.limit,
        counts: wire.counts,
      })),
    );
  }
  get(id: string) {
    return this.http.get<WirePromotion>(`${this.base}/${id}`).pipe(adminErrors(), map(toPromotion));
  }
  create(input: PromotionInput) {
    return this.http
      .post<WirePromotion>(this.base, toWire(input, false))
      .pipe(adminErrors(), map(toPromotion));
  }
  update(id: string, input: PromotionInput) {
    return this.http
      .put<WirePromotion>(`${this.base}/${id}`, toWire(input, true))
      .pipe(adminErrors(), map(toPromotion));
  }
  /** No `updatedAt`: the switch loses no data, so it overwrites (docs/api openapi). */
  setEnabled(id: string, enabled: boolean) {
    return this.http
      .patch<WirePromotion>(`${this.base}/${id}`, { enabled })
      .pipe(adminErrors(), map(toPromotion));
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(adminErrors());
  }
}
