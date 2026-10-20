import { inject, Injectable } from '@angular/core';
import { defer, delay, Observable, of, throwError } from 'rxjs';
import { CatalogApi } from '../app/features/catalog/data-access/catalog-api';
import {
  Category,
  CatalogQuery,
  Product,
  ProductReview,
  ReviewEligibility,
  ReviewInput,
} from '../app/features/catalog/models/product';
import { AuthSession } from '../app/features/auth/auth-session';
import { PRODUCTS } from './products';
import { SAMPLE_REVIEWS, SIZE_CHARTS } from './reviews';
import { MockAccountStore } from './mock-account-store';
import { MockInventory } from './mock-inventory';
import { MockPersistence } from './mock-persistence';
import { respond } from './mock-latency';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

/** Order states in which the shopper has received the goods and may review them. */
const RECEIVED = new Set(['completed', 'return-requested', 'returned']);

/** Listing cards show the review summary; the mock derives it from the sample reviews. */
function withRating(product: Product): Product {
  const reviews = SAMPLE_REVIEWS[product.id] ?? [];
  if (!reviews.length) return product;
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return { ...product, rating: { average: Math.round(average * 10) / 10, count: reviews.length } };
}
const RATED_PRODUCTS = PRODUCTS.map(withRating);

interface CatalogSnapshot {
  reviews: [string, ProductReview[]][];
  reviewed: string[];
  alerts: { variantId: string; email: string }[];
}

@Injectable({ providedIn: 'root' })
export class MockCatalogApi implements CatalogApi {
  private readonly session = inject(AuthSession);
  private readonly store = inject(MockAccountStore);
  /** Restores stock before the first listing is read. */
  private readonly inventory = inject(MockInventory);
  /** Reviews written in this demo, newest first, per product ID. */
  private readonly written = new Map<string, ProductReview[]>();
  /** `accountId:productId` pairs that already left a review. */
  private readonly reviewed = new Set<string>();
  private readonly alerts: CatalogSnapshot['alerts'] = [];

  constructor() {
    const saved = inject(MockPersistence).register<CatalogSnapshot>('catalog', () => ({
      reviews: [...this.written.entries()],
      reviewed: [...this.reviewed],
      alerts: this.alerts,
    }));
    for (const [id, list] of saved?.reviews ?? []) this.written.set(id, list);
    for (const key of saved?.reviewed ?? []) this.reviewed.add(key);
    this.alerts.push(...(saved?.alerts ?? []));
  }

  list(query: CatalogQuery) {
    return defer(() => {
      const items = RATED_PRODUCTS.filter(
        (product) =>
          (!query.gender || product.genders.some((gender) => gender === query.gender)) &&
          (!query.category || product.category === query.category) &&
          (!query.moment || product.moments.some((moment) => moment === query.moment)) &&
          // Name or product type, accent-insensitive ("dam" finds "Đầm midi").
          (!query.search ||
            normalize(`${product.name} ${product.type}`).includes(normalize(query.search))) &&
          (!query.maxPrice || product.price <= query.maxPrice) &&
          product.variants.some(
            (variant) =>
              (!query.size || variant.size === query.size) &&
              (!query.color || variant.color.name === query.color) &&
              (!query.available || variant.inventory > 0),
          ),
      );
      if (query.sort === 'price-asc') items.sort((a, b) => a.price - b.price);
      if (query.sort === 'price-desc') items.sort((a, b) => b.price - a.price);
      if (query.sort === 'newest') items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (query.sort === 'bestselling') items.sort((a, b) => a.salesRank - b.salesRank);
      return of({ items, total: items.length });
    }).pipe(delay(280));
  }

  get(slug: string) {
    return of(RATED_PRODUCTS.find((product) => product.slug === slug)).pipe(delay(180));
  }

  reviews(productId: string) {
    const samples = (SAMPLE_REVIEWS[productId] ?? []).map((review) => ({
      ...review,
      sample: true,
    }));
    return of([...(this.written.get(productId) ?? []), ...samples]).pipe(delay(220));
  }

  reviewEligibility(productId: string): Observable<ReviewEligibility> {
    return respond(this.eligibility(productId));
  }

  submitReview(productId: string, input: ReviewInput): Observable<ProductReview> {
    const user = this.session.user();
    if (!user || this.eligibility(productId).status !== 'eligible') {
      return throwError(() => new Error('not-eligible'));
    }
    const review: ProductReview = {
      id: `w-${Date.now().toString(36)}`,
      author: `${user.firstName} ${user.lastName.trim().charAt(0)}.`.trim(),
      rating: Math.min(5, Math.max(1, Math.round(input.rating))),
      fit: input.fit,
      sizeBought: input.sizeBought,
      height: input.height.trim(),
      title: input.title.trim(),
      body: input.body.trim(),
      date: new Date().toISOString().slice(0, 10),
      verified: true,
    };
    this.written.set(productId, [review, ...(this.written.get(productId) ?? [])]);
    this.reviewed.add(`${user.id}:${productId}`);
    return respond(review);
  }

  notifyBackInStock(variantId: string, email: string): Observable<void> {
    const normalized = email.trim().toLowerCase();
    if (!this.alerts.some((alert) => alert.variantId === variantId && alert.email === normalized)) {
      this.alerts.push({ variantId, email: normalized });
    }
    return respond(undefined);
  }

  private eligibility(productId: string): ReviewEligibility {
    const user = this.session.user();
    if (!user) return { status: 'sign-in' };
    if (this.reviewed.has(`${user.id}:${productId}`)) return { status: 'reviewed' };
    const slug = PRODUCTS.find((product) => product.id === productId)?.slug;
    const line = this.store
      .dataFor(user.id)
      .orders.filter((order) => RECEIVED.has(order.status))
      .flatMap((order) => order.items)
      .find((item) => item.productSlug === slug);
    return line ? { status: 'eligible', sizeBought: line.size } : { status: 'not-purchased' };
  }

  sizeChart(category: Category) {
    return of(SIZE_CHARTS[category]).pipe(delay(120));
  }
}
