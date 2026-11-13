import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  filter,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { API_CONFIG } from '../../core/api-config';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { RECOMMENDATIONS_API } from '../catalog/data-access/recommendations-api';
import {
  CATEGORIES,
  Product,
  ProductReview,
  ProductReviewSummary,
} from '../catalog/models/product';
import { discountPercentOf, saleEndLabel } from '../catalog/models/product-pricing';
import { REVIEWS_API } from './data-access/reviews-api';
import { CartState } from '../cart/cart-state';
import { ToastService } from '../../shared/ui/toast';
import { WishlistState } from '../wishlist/wishlist-state';
import { OverlayService } from '../../shared/ui/overlay.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { ProductCardComponent } from '../../shared/commerce/product-card.component';
import { getMedia } from '../../../media/media-manifest';
import { storeSettings } from '../../core/store-settings';
import { ProductGallery } from './product-gallery';
import { ProductReviews } from './product-reviews';
import { ReviewForm } from './review-form';
import { StockAlert } from './stock-alert';
import { SizeGuideData, SizeGuideDialog } from './size-guide-dialog';

const REVIEW_PAGE_SIZE = 10;
const EMPTY_SUMMARY: ProductReviewSummary = {
  count: 0,
  average: null,
  distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  fit: { small: 0, true: 0, large: 0 },
};

/**
 * PDP (plan section 11) informed by Baymard apparel research and a Nike PDP review: sticky info,
 * size guide next to the selector, fit line, inline delivery/returns, reviews as a fitting room.
 */
@Component({
  selector: 'n2f-product-page',
  imports: [
    RouterLink,
    IconComponent,
    EmptyStateComponent,
    PricePipe,
    ProductCardComponent,
    ProductGallery,
    ProductReviews,
    ReviewForm,
    StockAlert,
  ],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPage {
  private readonly api = inject(CATALOG_API);
  private readonly reviewsApi = inject(REVIEWS_API);
  private readonly recommender = inject(RECOMMENDATIONS_API);
  private readonly config = inject(API_CONFIG);
  /** Reviews: the mock catalog's, or the real ones once reviewsMode is http (BR-REV-08). */
  readonly reviewsEnabled =
    this.config.catalogMode === 'mock' || this.config.reviewsMode === 'http';
  /** Back-in-stock alerts exist only on the mock catalog (BR-CAT-17). */
  readonly stockAlertEnabled = this.config.catalogMode === 'mock';
  private readonly retry$ = new Subject<void>();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly overlay = inject(OverlayService);
  private readonly cart = inject(CartState);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly wishlist = inject(WishlistState);
  get policy() {
    return storeSettings().policy;
  }

  readonly product = signal<Product | undefined>(undefined);
  readonly reviews = signal<ProductReview[]>([]);
  /** Over every visible review, whatever the star filter. */
  readonly reviewSummary = signal<ProductReviewSummary>(EMPTY_SUMMARY);
  /** Reviews matching the star filter, loaded or not. */
  readonly reviewTotal = signal(0);
  readonly ratingFilter = signal(0);
  readonly reviewsLoadingMore = signal(false);
  readonly reviewsFailed = signal(false);
  readonly related = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly color = signal('');
  readonly size = signal('');
  readonly error = signal('');
  /** Mobile sticky purchase bar appears once the main button leaves the viewport. */
  readonly showStickyBar = signal(false);

  readonly sizeField = viewChild<ElementRef<HTMLElement>>('sizes');
  readonly addButton = viewChild<ElementRef<HTMLElement>>('addButton');

  readonly gallery = computed(() =>
    (this.product()?.gallery ?? ['catalog-placeholder']).map((id) => getMedia(id)),
  );
  readonly colors = computed(() => [
    ...new Map(this.product()?.variants.map((v) => [v.color.name, v.color]) ?? []).values(),
  ]);
  readonly variants = computed(
    () => this.product()?.variants.filter((v) => v.color.name === this.color()) ?? [],
  );
  readonly soldOut = computed(() => this.variants().filter((variant) => !variant.inventory));
  readonly selected = computed(() => this.variants().find((v) => v.size === this.size()));
  readonly saved = computed(() => {
    const item = this.product();
    return !!item && this.wishlist.savedIds().includes(item.id);
  });
  readonly discount = computed(() => {
    const item = this.product();
    return item ? discountPercentOf(item) : 0;
  });
  readonly saleEnd = computed(() => {
    const item = this.product();
    return item ? saleEndLabel(item) : '';
  });
  readonly categoryLabel = computed(
    () => CATEGORIES.find((category) => category.value === this.product()?.category)?.label ?? '',
  );
  readonly lowStock = computed(() => this.selected()?.stockStatus === 'LOW_STOCK');
  /** Nothing to buy: every variant of every colour is out of stock. */
  readonly allSoldOut = computed(() =>
    (this.product()?.variants ?? []).every((variant) => variant.stockStatus === 'OUT_OF_STOCK'),
  );

  constructor() {
    combineLatest([this.route.paramMap, this.retry$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) =>
          this.api.get(params.get('slug') ?? '').pipe(
            map((product) => ({ product, loading: false, failed: false })),
            startWith({ product: undefined, loading: true, failed: false }),
            catchError(() => of({ product: undefined, loading: false, failed: true })),
          ),
        ),
        tap((state) => {
          this.product.set(state.product);
          // An old link (the slug was renamed) lands on the current address without a history entry.
          const slug = this.route.snapshot.paramMap.get('slug');
          if (state.product && slug !== state.product.slug) {
            void this.router.navigate(['/product', state.product.slug], { replaceUrl: true });
          }
          this.loading.set(state.loading);
          this.failed.set(state.failed);
          // Default colour: the first one that still has stock, else the first one.
          const variants = state.product?.variants ?? [];
          this.color.set(
            (variants.find((variant) => variant.inventory > 0) ?? variants[0])?.color.name ?? '',
          );
          this.size.set('');
          this.error.set('');
          this.reviews.set([]);
          this.reviewSummary.set(EMPTY_SUMMARY);
          this.reviewTotal.set(0);
          this.ratingFilter.set(0);
          this.reviewsFailed.set(false);
          this.related.set([]);
        }),
        map((state) => state.product),
        filter((product): product is Product => !!product),
        // Secondary content loads in parallel and fails soft; the purchase core never waits on it.
        switchMap((product) =>
          forkJoin({
            reviews: this.reviewsEnabled
              ? this.reviewsApi
                  .list(product.id, { page: 1, limit: REVIEW_PAGE_SIZE })
                  .pipe(catchError(() => of(null)))
              : of(null),
            // BR-REC-04: a failure hides the block, it never blocks the page.
            related: this.recommender.list([product.id], 4).pipe(catchError(() => of([]))),
          }),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ reviews, related }) => {
        if (reviews) {
          this.reviews.set(reviews.items);
          this.reviewSummary.set(reviews.summary);
          this.reviewTotal.set(reviews.total);
        } else if (this.reviewsEnabled) {
          this.reviewsFailed.set(true);
        }
        this.related.set(related.filter((item) => item.id !== this.product()?.id));
      });

    effect((onCleanup) => {
      const button = this.addButton()?.nativeElement;
      if (!button || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(([entry]) =>
        this.showStickyBar.set(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      );
      observer.observe(button);
      onCleanup(() => observer.disconnect());
    });
  }

  chooseColor(color: string): void {
    this.color.set(color);
    this.size.set('');
    this.error.set('');
  }

  chooseSize(size: string): void {
    this.size.set(size);
    this.error.set('');
  }

  openSizeGuide(): void {
    const item = this.product();
    if (!item) return;
    this.api
      .sizeChart(item.category)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () =>
          this.toast.show({
            title: 'Chưa tải được bảng size',
            detail: 'Bạn thử bấm lại sau một chút.',
          }),
        next: (chart) => {
          const data: SizeGuideData = {
            productName: item.name,
            chart,
            fit: item.fit,
            available: this.variants()
              .filter((variant) => variant.inventory > 0)
              .map((variant) => variant.size),
          };
          // "Chọn size M" in the guide closes it with that size; apply it to the selector.
          this.overlay
            .open(SizeGuideDialog, 'Hướng dẫn chọn size', 'modal', data)
            .closed.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((size) => {
              if (typeof size === 'string') this.chooseSize(size);
            });
        },
      });
  }

  retry(): void {
    this.retry$.next();
  }

  /** Both purchase buttons need a size; points the shopper at the size field otherwise. */
  private requireVariant() {
    const item = this.product();
    const variant = this.selected();
    if (item && variant) return { item, variant };
    this.error.set('Vui lòng chọn kích cỡ của bạn.');
    const field = this.sizeField()?.nativeElement;
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
    return null;
  }

  /** The shopper's own review shows at once; the list is read again so the average is the server's. */
  addReview(review: ProductReview): void {
    this.reviews.update((reviews) => [review, ...reviews]);
    this.reviewTotal.update((total) => total + 1);
    this.filterReviews(0);
  }

  /** Star filter (BR-REV-09): the first page of that filter replaces the list. */
  filterReviews(rating: number): void {
    const item = this.product();
    if (!item) return;
    this.ratingFilter.set(rating);
    this.reviewsFailed.set(false);
    this.reviewsApi
      .list(item.id, { page: 1, limit: REVIEW_PAGE_SIZE, rating: rating || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.reviews.set(page.items);
          this.reviewSummary.set(page.summary);
          this.reviewTotal.set(page.total);
        },
        error: () => this.reviewsFailed.set(true),
      });
  }

  /** "Xem thêm đánh giá": the next page is appended (reviews already shown are not repeated). */
  moreReviews(): void {
    const item = this.product();
    if (!item || this.reviewsLoadingMore()) return;
    const page = Math.floor(this.reviews().length / REVIEW_PAGE_SIZE) + 1;
    this.reviewsLoadingMore.set(true);
    this.reviewsFailed.set(false);
    this.reviewsApi
      .list(item.id, { page, limit: REVIEW_PAGE_SIZE, rating: this.ratingFilter() || undefined })
      .pipe(
        finalize(() => this.reviewsLoadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (next) =>
          this.reviews.update((current) => [
            ...current,
            ...next.items.filter((review) => !current.some((known) => known.id === review.id)),
          ]),
        error: () => this.reviewsFailed.set(true),
      });
  }

  /** Buy now: checkout with only this variant, keeping the rest of the cart for later. */
  buyNow(): void {
    const picked = this.requireVariant();
    if (!picked) return;
    const { item, variant } = picked;
    const inCart = this.cart.lines().some((line) => line.variantId === variant.id);
    if (!inCart && !this.cart.add(item, variant)) {
      this.error.set(this.cart.message());
      return;
    }
    this.cart.checkoutIds.set(new Set([variant.id]));
    void this.router.navigate(['/checkout']);
  }

  add(): void {
    const picked = this.requireVariant();
    if (!picked) return;
    const { item, variant } = picked;
    if (!this.cart.add(item, variant)) {
      this.error.set(this.cart.message());
      return;
    }
    this.toast.show({
      title: 'Đã thêm vào giỏ hàng',
      detail: item.name,
      meta: `${variant.color.name} / ${variant.size}`,
      image: getMedia(item.mediaId).src,
      action: { label: `Xem giỏ hàng (${this.cart.count()})`, link: '/cart' },
    });
  }
}
