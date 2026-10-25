import { inject, Injectable } from '@angular/core';
import type { Category, ProductReview, SizeChart } from '../app/features/catalog/models/product';
import type { LandingContent } from '../app/features/home/landing-content';
import { MockPersistence } from './mock-persistence';
import { NINE2FINE_LANDING } from './nine2fine-landing';
import { SAMPLE_REVIEWS, SIZE_CHARTS } from './reviews';

export interface ReviewModeration {
  hidden?: boolean;
  reply?: { body: string; at: string; author: string };
}

export interface StoredCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'draft';
  /** Storefront product ids (`01`). */
  productIds: string[];
  updatedAt: string;
}

interface Snapshot {
  landing: LandingContent | null;
  moderation: Record<string, ReviewModeration>;
  sizeCharts: Partial<Record<Category, SizeChart>>;
  collections: StoredCollection[];
}

/**
 * Storefront content the admin edits (Đợt 3), shared by the storefront mocks and the admin mocks
 * so a change in the admin shows on the shop in the same tab. Mock mode only: the frontend-only
 * features have no backend yet.
 */
@Injectable({ providedIn: 'root' })
export class MockStorefrontContent {
  private landing: LandingContent | null;
  readonly moderation: Record<string, ReviewModeration>;
  readonly sizeCharts: Partial<Record<Category, SizeChart>>;
  collections: StoredCollection[];

  constructor() {
    const saved = inject(MockPersistence).register<Snapshot>('storefront', () => ({
      landing: this.landing,
      moderation: this.moderation,
      sizeCharts: this.sizeCharts,
      collections: this.collections,
    }));
    this.landing = saved?.landing ?? null;
    this.moderation = saved?.moderation ?? seedModeration();
    this.sizeCharts = saved?.sizeCharts ?? {};
    this.collections = saved?.collections ?? seedCollections();
  }

  home(): LandingContent {
    return structuredClone(this.landing ?? NINE2FINE_LANDING);
  }

  saveHome(content: LandingContent | null): void {
    this.landing = content ? structuredClone(content) : null;
  }

  /** Sample + seeded reviews of one product, before moderation. */
  baseReviews(productId: string): ProductReview[] {
    return [
      ...(SEEDED_REVIEWS[productId] ?? []),
      ...(SAMPLE_REVIEWS[productId] ?? []).map((review) => ({ ...review, sample: true })),
    ];
  }

  /** What shoppers see: hidden reviews left out, the shop's reply attached. */
  moderate(reviews: ProductReview[]): ProductReview[] {
    return reviews
      .filter((review) => !this.moderation[review.id]?.hidden)
      .map((review) => {
        const reply = this.moderation[review.id]?.reply;
        return reply ? { ...review, reply: { body: reply.body, at: reply.at } } : review;
      });
  }

  sizeChart(category: Category): SizeChart {
    return structuredClone(this.sizeCharts[category] ?? SIZE_CHARTS[category]);
  }
}

function review(
  id: string,
  author: string,
  rating: number,
  fit: -1 | 0 | 1,
  sizeBought: string,
  title: string,
  body: string,
  date: string,
): ProductReview {
  return { id, author, rating, fit, sizeBought, height: '', title, body, date, sample: true };
}

/** Extra demo reviews so moderation has something to do; labelled as sample data like the rest. */
const SEEDED_REVIEWS: Record<string, ProductReview[]> = {
  '04': [
    review(
      's2',
      'Quân Đ.',
      5,
      0,
      '30',
      'Quần mặc cả tuần',
      'Ống đứng, không nhăn sau cả ngày ngồi văn phòng.',
      '2026-10-22',
    ),
    review(
      's3',
      'My L.',
      3,
      -1,
      '28',
      'Hơi chật ở hông',
      'Chất vải ổn nhưng phần hông chật, nên lên một size.',
      '2026-10-16',
    ),
  ],
  '05': [
    review(
      's4',
      'Thảo N.',
      5,
      0,
      'S',
      'Mềm và mát',
      'Mặc cuối tuần rất thoải mái, giặt máy không bị xù.',
      '2026-10-23',
    ),
    review(
      's5',
      'Khoa P.',
      1,
      0,
      'M',
      'Màu khác ảnh',
      'Màu trắng ngả vàng hơn trong ảnh. Mong shop chụp lại ảnh thật.',
      '2026-10-20',
    ),
  ],
  '06': [
    review(
      's1',
      'Trang V.',
      2,
      1,
      'M',
      'Rộng hơn bảng size',
      'Eo bị rộng, phải đổi xuống S. Shop xử lý đổi nhanh.',
      '2026-10-19',
    ),

    review(
      's6',
      'Vy H.',
      4,
      0,
      'M',
      'Đứng dáng',
      'Chân váy đứng dáng, đi làm hay đi tiệc đều hợp.',
      '2026-10-12',
    ),
  ],
  '07': [
    review(
      's7',
      'Nam T.',
      2,
      1,
      'L',
      'Vải mỏng',
      'Vải mỏng hơn mình nghĩ, nhìn hơi xuyên dưới nắng.',
      '2026-10-24',
    ),
    review('s8', 'Lan C.', 5, 0, 'M', 'Ưng', 'Đúng size, đường may đẹp, giao nhanh.', '2026-10-08'),
  ],
  '08': [
    review(
      's9',
      'Bảo K.',
      4,
      -1,
      'M',
      'Gọn gàng',
      'Gile ôm gọn, nếu mặc ngoài áo len thì nên lên size.',
      '2026-10-21',
    ),
  ],
};

function seedModeration(): Record<string, ReviewModeration> {
  return {
    r1: {
      reply: {
        body: 'Cảm ơn chị Ngọc đã tin chọn nine2fine. Hẹn gặp lại chị ở mẫu mới tuần sau!',
        at: '2026-09-22T03:00:00.000Z',
        author: 'Trần Thu Hà',
      },
    },
    s1: {
      reply: {
        body: 'Shop xin lỗi vì bảng size chưa sát. Shop đã cập nhật số đo eo cho mẫu này.',
        at: '2026-10-19T09:30:00.000Z',
        author: 'Trần Thu Hà',
      },
    },
  };
}

function seedCollections(): StoredCollection[] {
  const at = '2026-10-15T03:00:00.000Z';
  return [
    {
      id: 'c1',
      name: 'From Nine to Fine',
      slug: 'from-nine-to-fine',
      description: 'Những món mặc từ sáng đi làm tới tối đi chơi.',
      status: 'active',
      productIds: ['01', '02', '03', '04'],
      updatedAt: at,
    },
    {
      id: 'c2',
      name: 'Cuối tuần',
      slug: 'cuoi-tuan',
      description: 'Thoải mái, dễ phối cho ngày nghỉ.',
      status: 'active',
      productIds: ['05', '07'],
      updatedAt: at,
    },
    {
      id: 'c3',
      name: 'Thu Đông 2026',
      slug: 'thu-dong-2026',
      description: 'Bộ sưu tập sắp ra mắt.',
      status: 'draft',
      productIds: ['08'],
      updatedAt: at,
    },
  ];
}
