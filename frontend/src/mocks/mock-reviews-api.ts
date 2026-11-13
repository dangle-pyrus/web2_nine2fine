import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { ReviewsApi } from '../app/features/product/data-access/reviews-api';
import type {
  ProductReview,
  ProductReviewPage,
  ProductReviewSummary,
  ReviewEligibility,
  ReviewInput,
  ReviewListQuery,
} from '../app/features/catalog/models/product';
import { MockCatalogApi } from './mock-catalog-api';

/** One decimal, half-up, like the server (`floor((sum * 20 + count) / (2 * count)) / 10`). */
function averageOf(reviews: ProductReview[]): number | null {
  if (!reviews.length) return null;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return Math.floor((sum * 20 + reviews.length) / (2 * reviews.length)) / 10;
}

export function summarize(reviews: ProductReview[]): ProductReviewSummary {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const fit = { small: 0, true: 0, large: 0 };
  for (const review of reviews) {
    distribution[String(review.rating) as keyof typeof distribution]++;
    if (review.fit < 0) fit.small++;
    else if (review.fit > 0) fit.large++;
    else fit.true++;
  }
  return { count: reviews.length, average: averageOf(reviews), distribution, fit };
}

/** Mock of `GET /products/{id}/reviews`, `GET /reviews/eligibility`, `POST /reviews`. */
@Injectable({ providedIn: 'root' })
export class MockReviewsApi implements ReviewsApi {
  private readonly catalog = inject(MockCatalogApi);

  list(productId: string, query: ReviewListQuery): Observable<ProductReviewPage> {
    return this.catalog.reviews(productId).pipe(
      map((all) => {
        const matching = query.rating ? all.filter((r) => r.rating === query.rating) : all;
        const start = (query.page - 1) * query.limit;
        return {
          items: matching.slice(start, start + query.limit),
          total: matching.length,
          page: query.page,
          limit: query.limit,
          summary: summarize(all),
        };
      }),
    );
  }

  eligibility(productId: string): Observable<ReviewEligibility> {
    return this.catalog.reviewEligibility(productId);
  }

  submit(productId: string, input: ReviewInput): Observable<ProductReview> {
    return this.catalog.submitReview(productId, input);
  }
}
