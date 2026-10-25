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
import { catchError, filter, forkJoin, map, of, startWith, switchMap, tap } from 'rxjs';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { CATEGORIES, DEFAULT_QUERY, Product, ProductReview } from '../catalog/models/product';
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
    return item?.compareAtPrice ? Math.round((1 - item.price / item.compareAtPrice) * 100) : 0;
  });
  readonly categoryLabel = computed(
    () => CATEGORIES.find((category) => category.value === this.product()?.category)?.label ?? '',
  );
  readonly lowStock = computed(() => {
    const variant = this.selected();
    return !!variant && variant.inventory > 0 && variant.inventory <= 5;
  });

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) =>
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
          this.color.set(state.product?.variants[0]?.color.name ?? '');
          this.size.set('');
          this.error.set('');
          this.reviews.set([]);
          this.related.set([]);
        }),
        map((state) => state.product),
        filter((product): product is Product => !!product),
        // Secondary content loads in parallel and fails soft; the purchase core never waits on it.
        switchMap((product) =>
          forkJoin({
            reviews: this.api.reviews(product.id).pipe(catchError(() => of([]))),
            related: this.api.list({ ...DEFAULT_QUERY, moment: product.moments[0] }).pipe(
              map((page) => page.items.filter((item) => item.id !== product.id).slice(0, 4)),
              catchError(() => of([])),
            ),
          }),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ reviews, related }) => {
        this.reviews.set(reviews);
        this.related.set(related);
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
      .subscribe((chart) => {
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
      });
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

  addReview(review: ProductReview): void {
    this.reviews.update((reviews) => [review, ...reviews]);
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
