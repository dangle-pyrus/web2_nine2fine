import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../features/catalog/models/product';
import { WishlistState } from '../../features/wishlist/wishlist-state';
import { CartState } from '../../features/cart/cart-state';
import { getMedia } from '../../../media/media-manifest';
import { PricePipe } from './price.pipe';
import { IconComponent } from '../ui/icon.component';
import { ToastService } from '../ui/toast';

const BADGE_LABELS: Record<string, string> = { NEW: 'Mới về', BESTSELLER: 'Bán chạy' };

/**
 * Listing card, UNIQLO-style (user request 2026-10-11): badge inside the image, ‹ › to preview
 * colours on hover, swatches + wishlist right under the image, then type line, name, a prominent
 * price and the rating. No hover zoom/crossfade. The cart button opens a size sheet over the
 * image and turns into a "Thêm vào giỏ" pill that unlocks once a size is picked (2026-10-17).
 */
@Component({
  selector: 'n2f-product-card',
  imports: [RouterLink, PricePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closeQuick()' },
  template: `
    <article>
      <div class="product-media" [class.sheet-open]="quickOpen()">
        <!-- One slide per colour; switching slides it in from the side of the arrow pressed. -->
        @for (slide of slides(); track slide.key) {
          <a
            class="image-link"
            [class.temporary]="slide.media.temporary"
            [style.--tint]="slide.media.temporary ? slide.hex : null"
            [routerLink]="['/product', product().slug]"
            [attr.aria-label]="product().name + ', màu ' + slide.name"
            [animate.enter]="direction() ? 'slide-in-' + direction() : ''"
            [animate.leave]="direction() ? 'slide-out-' + direction() : ''"
          >
            <img
              [src]="slide.media.src"
              [alt]="slide.media.alt"
              width="400"
              height="500"
              loading="lazy"
            />
            @if (slide.media.temporary) {
              <span class="image-note">Ảnh đang cập nhật</span>
            }
          </a>
        }
        @if (badge(); as label) {
          <span class="badge">{{ label }}</span>
        }
        @if (colors().length > 1) {
          <button
            type="button"
            class="color-nav prev"
            [attr.aria-label]="'Màu trước của ' + product().name"
            (click)="step(-1)"
          >
            <n2f-icon name="reiconChevronLeft" size="26px" />
          </button>
          <button
            type="button"
            class="color-nav next"
            [attr.aria-label]="'Màu tiếp theo của ' + product().name"
            (click)="step(1)"
          >
            <n2f-icon name="reiconChevronRight" size="26px" />
          </button>
        }
        @if (quickOpen()) {
          <!-- Tapping the photo above the sheet only closes it; it does not open the product. -->
          <button
            type="button"
            class="sheet-dismiss"
            tabindex="-1"
            aria-label="Đóng chọn size"
            (click)="closeQuick()"
          ></button>
          <div
            class="quick-panel"
            role="group"
            [attr.aria-label]="'Chọn kích cỡ ' + product().name"
            animate.enter="sheet-in"
            animate.leave="sheet-out"
          >
            <button
              type="button"
              class="sheet-close"
              aria-label="Đóng chọn size"
              title="Đóng"
              (click)="closeQuick()"
            >
              <n2f-icon name="reiconChevronDown" size="18px" />
              <n2f-icon name="reiconChevronDown" size="18px" />
            </button>
            <p>
              Chọn size · <strong>{{ activeColor().name }}</strong>
            </p>
            <div class="quick-sizes">
              @for (variant of activeVariants(); track variant.id) {
                <button
                  type="button"
                  [class.active]="quickSize() === variant.size"
                  [disabled]="!variant.inventory"
                  [attr.aria-pressed]="quickSize() === variant.size"
                  [attr.aria-label]="
                    'Size ' + variant.size + (!variant.inventory ? ' - hết hàng' : '')
                  "
                  (click)="quickSize.set(variant.size)"
                >
                  {{ variant.size }}
                </button>
              }
            </div>
          </div>
        }
        <button
          type="button"
          class="quick-add"
          [class.expanded]="quickOpen()"
          [disabled]="quickOpen() && !quickSize()"
          [attr.aria-label]="
            quickOpen() ? 'Thêm vào giỏ' : 'Chọn size để thêm ' + product().name + ' vào giỏ'
          "
          [title]="quickOpen() ? 'Thêm vào giỏ' : 'Thêm vào giỏ'"
          (click)="quickOpen() ? quickAdd() : openQuick()"
        >
          @if (quickOpen()) {
            <span>Thêm vào giỏ</span>
          } @else {
            <n2f-icon name="reiconCartShop" size="20px" />
          }
        </button>
      </div>

      <div class="swatch-row">
        <div class="swatches" role="group" aria-label="Màu sắc">
          @for (color of colors(); track color.name; let index = $index) {
            <button
              type="button"
              class="swatch"
              [class.active]="index === colorIndex()"
              [style.--swatch]="color.hex"
              [title]="color.name"
              [attr.aria-label]="color.name"
              [attr.aria-pressed]="index === colorIndex()"
              (click)="selectColor(index)"
            ></button>
          }
        </div>
        <button
          class="icon-button favorite"
          type="button"
          [class.saved]="saved()"
          [attr.aria-pressed]="saved()"
          [attr.aria-label]="(saved() ? 'Bỏ yêu thích ' : 'Yêu thích ') + product().name"
          [title]="saved() ? 'Bỏ yêu thích' : 'Lưu yêu thích'"
          (click)="toggleWishlist()"
        >
          <n2f-icon [name]="saved() ? 'reiconHeartFill' : 'reiconHeart'" size="22px" />
        </button>
      </div>
      <div class="product-meta">
        <p class="type">{{ product().type }}</p>
        <h2>
          <a [routerLink]="['/product', product().slug]">{{ product().name }}</a>
        </h2>
        <p class="price">
          <strong [class.sale]="!!product().compareAtPrice">{{ product().price | vnd }}</strong>
          @if (product().compareAtPrice) {
            <del>{{ product().compareAtPrice! | vnd }}</del>
          }
        </p>
        @if (product().rating; as rating) {
          <p class="rating">
            <span class="stars" aria-hidden="true" [style.--fill]="(rating.average / 5) * 100 + '%'"
              >★★★★★</span
            >
            <span class="sr-only">Đánh giá {{ rating.average }} trên 5 sao,</span>
            {{ rating.average }} <span class="count">({{ rating.count }})</span>
          </p>
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .product-media {
      position: relative;
      aspect-ratio: 4/5;
      background: #f3f3f1;
      overflow: hidden;
    }
    .image-link {
      --tint: transparent;
      position: absolute;
      inset: 0;
      display: block;
      background: #f3f3f1;
    }
    /* Placeholder art cannot show colours, so a light tint previews the selected colour. */
    .image-link.temporary {
      background: color-mix(in srgb, var(--tint) 10%, #f3f3f1);
    }
    .slide-in-next {
      animation: slide-in-next 0.36s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .slide-out-next {
      animation: slide-out-next 0.36s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .slide-in-prev {
      animation: slide-in-prev 0.36s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .slide-out-prev {
      animation: slide-out-prev 0.36s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    @keyframes slide-in-next {
      from {
        transform: translateX(100%);
      }
    }
    @keyframes slide-out-next {
      to {
        transform: translateX(-100%);
      }
    }
    @keyframes slide-in-prev {
      from {
        transform: translateX(-100%);
      }
    }
    @keyframes slide-out-prev {
      to {
        transform: translateX(100%);
      }
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .temporary img {
      padding: 23%;
      object-fit: contain;
      opacity: 0.7;
    }
    .image-note {
      position: absolute;
      bottom: 22%;
      inset-inline: 12px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .badge {
      position: absolute;
      left: 10px;
      bottom: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #fff;
      color: var(--brand);
      font-size: 12px;
      font-weight: 700;
      pointer-events: none;
    }
    /* Bare chevrons; a soft white halo keeps them readable on dark photos. */
    .color-nav {
      position: absolute;
      top: 50%;
      z-index: 2;
      width: 40px;
      height: 48px;
      display: grid;
      place-items: center;
      margin-top: -24px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 1px #fff);
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .prev {
      left: 2px;
    }
    .next {
      right: 2px;
    }
    @media (hover: hover) {
      article:hover .color-nav {
        opacity: 1;
      }
    }
    .color-nav:focus-visible {
      opacity: 1;
    }
    /* Touch screens: swatches below the image do the same job without covering the photo. */
    @media (hover: none) {
      .color-nav {
        display: none;
      }
    }
    /* Circle cart button; with the sheet open it widens into the add-to-bag pill. */
    .quick-add {
      position: absolute;
      right: 10px;
      bottom: 10px;
      z-index: 3;
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      padding: 0;
      overflow: hidden;
      border: 0;
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      box-shadow: 0 2px 8px #0000001f;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      transition:
        width 0.28s cubic-bezier(0.2, 0.7, 0.2, 1),
        background-color 0.2s ease,
        color 0.2s ease;
    }
    .quick-add:hover:not(:disabled) {
      background: var(--ink);
      color: #fff;
    }
    .quick-add.expanded {
      width: calc(100% - 20px);
      background: var(--ink);
      color: #fff;
      box-shadow: none;
    }
    /* Inactive until a size is picked. */
    .quick-add.expanded:disabled {
      background: #d6d6d6;
      color: #fff;
      opacity: 1;
      cursor: not-allowed;
    }
    .quick-add span {
      animation: label-in 0.2s 0.12s ease both;
    }
    @keyframes label-in {
      from {
        opacity: 0;
      }
    }
    .sheet-dismiss {
      position: absolute;
      inset: 0;
      z-index: 1;
      padding: 0;
      border: 0;
      background: #0000000d;
      cursor: default;
    }
    .sheet-open .color-nav {
      display: none;
    }
    .quick-panel {
      position: absolute;
      inset: auto 0 0;
      z-index: 2;
      padding: 4px 12px 60px;
      border-radius: 14px 14px 0 0;
      background: #fffffff7;
      box-shadow: 0 -6px 18px #0000001a;
    }
    .sheet-in {
      animation: sheet-in 0.28s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    }
    .sheet-out {
      animation: sheet-out 0.22s cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes sheet-in {
      from {
        transform: translateY(100%);
      }
    }
    @keyframes sheet-out {
      to {
        transform: translateY(100%);
      }
    }
    /* Two stacked chevrons: "pull down to close". */
    .sheet-close {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      height: 30px;
      margin-bottom: 2px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--muted);
    }
    .sheet-close n2f-icon + n2f-icon {
      margin-top: -11px;
    }
    .sheet-close:hover {
      color: var(--ink);
    }
    .quick-panel p {
      margin: 0 0 8px;
      font-size: 13px;
    }
    .quick-sizes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .quick-sizes button {
      min-width: 40px;
      height: 36px;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      background: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
    }
    .quick-sizes button:hover:not(:disabled) {
      border-color: var(--ink);
    }
    .quick-sizes button.active {
      border-color: var(--ink);
      background: var(--ink);
      color: #fff;
    }
    .quick-sizes button:disabled {
      text-decoration: line-through;
    }
    .swatch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin-left: -5px;
    }
    /* 28px tap target around a 18px dot; the ring marks the colour shown in the image. */
    .swatch {
      --swatch: #ccc;
      position: relative;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
    }
    .swatch::before {
      content: '';
      position: absolute;
      inset: 5px;
      border-radius: 50%;
      background: var(--swatch);
      box-shadow: inset 0 0 0 1px #0000002e;
    }
    .swatch::after {
      content: '';
      position: absolute;
      inset: 1px;
      border: 1px solid transparent;
      border-radius: 50%;
    }
    .swatch.active::after {
      border-color: var(--ink);
    }
    .favorite {
      flex-shrink: 0;
      margin-right: -10px;
    }
    .saved {
      color: var(--brand);
    }
    .product-meta {
      padding: 2px 0 24px;
    }
    .type {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 13px;
    }
    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      line-height: 1.4;
    }
    .price {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 8px;
      margin: 8px 0 0;
    }
    .price strong {
      font-size: 18px;
      font-weight: 800;
    }
    .price strong.sale {
      color: var(--brand);
    }
    del {
      color: var(--muted);
      font-size: 13px;
    }
    .rating {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0 0;
      font-size: 13px;
      font-weight: 600;
    }
    .stars {
      --fill: 0%;
      font-size: 13px;
      letter-spacing: 1px;
      background: linear-gradient(90deg, var(--ink) var(--fill), #d0d0d0 var(--fill));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .count {
      color: var(--muted);
      font-weight: 400;
    }
    @media (max-width: 800px) {
      .quick-add {
        width: 36px;
        height: 36px;
        right: 8px;
        bottom: 8px;
      }
      .badge {
        left: 8px;
        bottom: 8px;
        font-size: 11px;
      }
      .quick-add.expanded {
        width: calc(100% - 16px);
        font-size: 13px;
      }
      .quick-panel {
        padding: 2px 8px 52px;
      }
      .quick-sizes {
        gap: 4px;
      }
      .quick-sizes button {
        min-width: 34px;
        height: 32px;
      }
      .price strong {
        font-size: 16px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .color-nav,
      .quick-panel,
      .quick-add,
      .quick-add span,
      .image-link {
        transition: none;
        animation: none;
      }
    }
  `,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly wishlist = inject(WishlistState);
  private readonly cart = inject(CartState);
  private readonly toast = inject(ToastService);

  readonly colorIndex = signal(0);
  /** Slide direction of the last colour change; empty until the shopper changes colour. */
  readonly direction = signal<'' | 'next' | 'prev'>('');
  readonly quickOpen = signal(false);
  /** Size picked in the sheet; the add button stays inactive until there is one. */
  readonly quickSize = signal('');
  readonly colors = computed(() => [
    ...new Map(this.product().variants.map((v) => [v.color.name, v.color])).values(),
  ]);
  readonly activeColor = computed(
    () => this.colors()[this.colorIndex()] ?? this.colors()[0] ?? { name: '', hex: '' },
  );
  readonly activeVariants = computed(() =>
    this.product().variants.filter((variant) => variant.color.name === this.activeColor().name),
  );
  readonly media = computed(() =>
    getMedia(this.product().colorMedia?.[this.activeColor().name] ?? this.product().mediaId),
  );
  /** Merchandising badge first, otherwise the computed discount. */
  readonly badge = computed(() => {
    const product = this.product();
    if (product.badge) return BADGE_LABELS[product.badge] ?? product.badge;
    if (product.compareAtPrice) {
      return `-${Math.round((1 - product.price / product.compareAtPrice) * 100)}%`;
    }
    return '';
  });
  readonly slides = computed(() => [
    {
      key: this.colorIndex(),
      name: this.activeColor().name,
      hex: this.activeColor().hex,
      media: this.media(),
    },
  ]);
  readonly saved = computed(() => this.wishlist.savedIds().includes(this.product().id));

  step(delta: number): void {
    this.quickSize.set('');
    const count = this.colors().length;
    this.direction.set(delta > 0 ? 'next' : 'prev');
    this.colorIndex.update((index) => (index + delta + count) % count);
  }

  selectColor(index: number): void {
    if (index === this.colorIndex()) return;
    this.quickSize.set('');
    this.direction.set(index > this.colorIndex() ? 'next' : 'prev');
    this.colorIndex.set(index);
  }

  toggleWishlist(): void {
    const product = this.product();
    const adding = !this.saved();
    if (!this.wishlist.toggle(product.id)) return;
    this.toast.show(
      adding
        ? {
            title: 'Đã lưu vào Yêu thích',
            detail: product.name,
            image: getMedia(product.mediaId).src,
            action: { label: 'Xem danh sách yêu thích', link: '/wishlist' },
          }
        : { title: 'Đã bỏ khỏi Yêu thích', detail: product.name },
    );
  }

  openQuick(): void {
    this.quickSize.set('');
    this.quickOpen.set(true);
  }

  closeQuick(): void {
    this.quickOpen.set(false);
    this.quickSize.set('');
  }

  quickAdd(): void {
    const product = this.product();
    const variant = this.activeVariants().find((item) => item.size === this.quickSize());
    if (!variant) return;
    if (!this.cart.add(product, variant)) {
      this.toast.show({ title: 'Chưa thêm được', detail: this.cart.message() });
      return;
    }
    this.closeQuick();
    this.toast.show({
      title: 'Đã thêm vào giỏ hàng',
      detail: product.name,
      meta: `${variant.color.name} / ${variant.size}`,
      image: getMedia(product.mediaId).src,
      action: { label: `Xem giỏ hàng (${this.cart.count()})`, link: '/cart' },
    });
  }
}
