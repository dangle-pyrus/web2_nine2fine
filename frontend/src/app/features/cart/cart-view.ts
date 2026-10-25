import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { CartState } from './cart-state';
import { WishlistState } from '../wishlist/wishlist-state';
import { IconComponent } from '../../shared/ui/icon.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { ProductCardComponent } from '../../shared/commerce/product-card.component';
import { CATALOG_API } from '../catalog/data-access/catalog-api';
import { DEFAULT_QUERY, Product, ProductVariant } from '../catalog/models/product';
import { storeSettings } from '../../core/store-settings';
import { getMedia } from '../../../media/media-manifest';

/**
 * Cart as a drawer and as the /cart page. Layout follows UNIQLO's cart (user preference
 * 2026-10-11): plain item rows with in-place colour/size editing, a grey order summary beside
 * the list on desktop, a sticky total + checkout bar on mobile and best-seller suggestions.
 * Checkout takes the whole cart by default. The checklist button next to close switches to a
 * selection mode: the summary then follows the picked lines, which can be removed together or
 * checked out on their own.
 */
@Component({
  selector: 'n2f-cart-view',
  imports: [RouterLink, IconComponent, EmptyStateComponent, PricePipe, ProductCardComponent],
  template: `
    <section class="cart-view" [class.page]="!dialog" [class.drawer]="!!dialog">
      <header class="cart-header">
        <h1>
          Giỏ hàng <span>({{ cart.count() }})</span>
        </h1>
        <div class="header-actions">
          @if (cart.lines().length) {
            <button
              type="button"
              class="icon-button select-toggle"
              [class.active]="selecting()"
              [attr.aria-pressed]="selecting()"
              [attr.aria-label]="selecting() ? 'Thoát chế độ chọn' : 'Chọn sản phẩm để xóa'"
              [title]="selecting() ? 'Thoát chế độ chọn' : 'Chọn để xóa'"
              (click)="toggleSelecting()"
            >
              <n2f-icon name="reiconListCheck" size="22px" />
            </button>
          }
          @if (dialog) {
            <button
              type="button"
              class="icon-button"
              aria-label="Đóng giỏ hàng"
              title="Đóng"
              (click)="close()"
            >
              <n2f-icon name="reiconX" />
            </button>
          }
        </div>
      </header>

      @if (!cart.lines().length) {
        <n2f-empty-state
          image="/assets/illustrations/empty_cart.svg"
          heading="Một khởi đầu mới"
          description="Giỏ hàng của bạn còn trống. Cùng tìm một món đồ cho cuộc hẹn tiếp theo."
          ><a routerLink="/shop" class="button dark" (click)="close()"
            >Khám phá bộ sưu tập</a
          ></n2f-empty-state
        >
      } @else {
        <div class="cart-body">
          <div class="cart-main">
            @if (selecting()) {
              <div class="select-bar">
                <label class="select-all">
                  <input
                    type="checkbox"
                    [checked]="allPicked()"
                    [indeterminate]="!allPicked() && picked().size > 0"
                    (change)="toggleAll()"
                  />
                  <span>Chọn tất cả ({{ cart.lines().length }})</span>
                </label>
                <button
                  type="button"
                  class="bulk-remove"
                  [disabled]="!picked().size"
                  (click)="removePicked()"
                >
                  <n2f-icon name="reiconTrash3" size="16px" /> Xóa ({{ picked().size }})
                </button>
              </div>
            }

            <div class="cart-scroll">
              @for (line of cart.lines(); track line.variantId) {
                <article class="cart-line" [class.selecting]="selecting()">
                  @if (selecting()) {
                    <input
                      type="checkbox"
                      class="line-check"
                      [checked]="picked().has(line.variantId)"
                      [attr.aria-label]="'Chọn ' + line.name + ' ' + line.color + ' ' + line.size"
                      (change)="togglePick(line.variantId)"
                    />
                  }
                  <a class="thumb" [routerLink]="['/product', line.slug]" (click)="close()"
                    ><img [src]="media(line.mediaId).src" [alt]="line.name" width="96" height="120"
                  /></a>
                  <div class="line-info">
                    <div class="line-head">
                      <h2>
                        <a [routerLink]="['/product', line.slug]" (click)="close()">{{
                          line.name
                        }}</a>
                      </h2>
                      <!-- One amount per line: the line total. -->
                      <p class="line-price">{{ line.price * line.quantity | vnd }}</p>
                    </div>
                    <p class="variant">
                      <span>Màu: {{ line.color }} · Size: {{ line.size }}</span>
                      @if (!selecting()) {
                        <button
                          type="button"
                          class="edit-variant"
                          [attr.aria-expanded]="editing() === line.variantId"
                          [attr.aria-label]="'Đổi màu hoặc size ' + line.name"
                          title="Đổi màu/size"
                          (click)="toggleEdit(line.slug, line.variantId)"
                        >
                          <n2f-icon name="reiconPen" size="16px" />
                        </button>
                      }
                    </p>
                    <div class="line-controls">
                      <div class="quantity">
                        @if (line.quantity <= 1 && !selecting()) {
                          <!-- At 1 the minus becomes remove, so the card needs no separate delete button. -->
                          <button
                            type="button"
                            class="icon-button"
                            [attr.aria-label]="'Xóa ' + line.name + ' khỏi giỏ'"
                            title="Xóa khỏi giỏ"
                            (click)="cart.remove(line.variantId)"
                          >
                            <n2f-icon name="reiconTrash3" size="16px" />
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="icon-button"
                            [disabled]="line.quantity <= 1"
                            [attr.aria-label]="'Giảm số lượng ' + line.name"
                            (click)="cart.adjust(line.variantId, -1)"
                          >
                            <n2f-icon name="reiconMinus" size="14px" />
                          </button>
                        }
                        <span [attr.aria-label]="'Số lượng ' + line.quantity">{{
                          line.quantity
                        }}</span
                        ><button
                          type="button"
                          class="icon-button"
                          [disabled]="line.quantity >= line.stock"
                          [attr.aria-label]="'Tăng số lượng ' + line.name"
                          (click)="cart.adjust(line.variantId, 1)"
                        >
                          <n2f-icon name="reiconPlus" size="14px" />
                        </button>
                      </div>
                      <button
                        type="button"
                        class="line-favorite"
                        [class.saved]="wishlist.savedIds().includes(line.productId)"
                        [attr.aria-pressed]="wishlist.savedIds().includes(line.productId)"
                        [attr.aria-label]="'Yêu thích ' + line.name"
                        (click)="wishlist.toggle(line.productId)"
                      >
                        <n2f-icon
                          [name]="
                            wishlist.savedIds().includes(line.productId)
                              ? 'reiconHeartFill'
                              : 'reiconHeart'
                          "
                          size="20px"
                        />
                      </button>
                    </div>
                    @if (editing() === line.variantId) {
                      @if (products()[line.slug]; as product) {
                        <div class="editor" role="group" [attr.aria-label]="'Chỉnh ' + line.name">
                          <p class="editor-label">
                            Màu sắc: <strong>{{ draftColor() }}</strong>
                          </p>
                          <div class="editor-colors">
                            @for (color of colorsOf(product); track color.name) {
                              <button
                                type="button"
                                class="editor-swatch"
                                [class.active]="color.name === draftColor()"
                                [style.--swatch]="color.hex"
                                [attr.aria-label]="color.name"
                                [attr.aria-pressed]="color.name === draftColor()"
                                (click)="draftColor.set(color.name)"
                              ></button>
                            }
                          </div>
                          <p class="editor-label">Kích cỡ</p>
                          <div class="editor-sizes">
                            @for (variant of variantsOf(product, draftColor()); track variant.id) {
                              <button
                                type="button"
                                [class.active]="variant.size === draftSize()"
                                [disabled]="!variant.inventory"
                                [attr.aria-pressed]="variant.size === draftSize()"
                                [attr.aria-label]="
                                  'Size ' + variant.size + (!variant.inventory ? ' - hết hàng' : '')
                                "
                                (click)="draftSize.set(variant.size)"
                              >
                                {{ variant.size }}
                              </button>
                            }
                          </div>
                          <div class="editor-actions">
                            <button type="button" class="button" (click)="editing.set(null)">
                              Hủy
                            </button>
                            <button
                              type="button"
                              class="button dark"
                              [disabled]="!draftVariant(product)"
                              (click)="applyEdit(line.variantId, product)"
                            >
                              Cập nhật
                            </button>
                          </div>
                        </div>
                      } @else {
                        <p class="editor-loading">Đang tải lựa chọn…</p>
                      }
                    }
                  </div>
                </article>
              }
            </div>
          </div>

          <aside class="summary" aria-label="Tóm tắt đơn hàng">
            @if (!dialog) {
              <h2>
                Tóm tắt đơn hàng <span>{{ summaryCount() }} sản phẩm</span>
              </h2>
              <dl>
                <div>
                  <dt>Tạm tính</dt>
                  <dd>{{ summarySubtotal() | vnd }}</dd>
                </div>
                <div>
                  <dt>Phí vận chuyển</dt>
                  <dd>Tính ở bước thanh toán</dd>
                </div>
              </dl>
            }
            <div class="total">
              <span
                >Tổng cộng
                @if (dialog) {
                  <small>({{ summaryCount() }} sản phẩm)</small>
                }
              </span>
              <strong>{{ summarySubtotal() | vnd }}</strong>
            </div>
            @if (summaryCount()) {
              <a class="button dark checkout" routerLink="/checkout" (click)="startCheckout()"
                >Thanh toán ({{ summaryCount() }})</a
              >
            } @else {
              <button type="button" class="button dark checkout" disabled>
                Chọn sản phẩm để thanh toán
              </button>
            }
            @if (dialog) {
              <a class="view-cart" routerLink="/cart" (click)="close()">Xem giỏ hàng</a>
            } @else {
              <p class="note">
                @if (remainingForFreeShipping() > 0) {
                  Mua thêm <strong>{{ remainingForFreeShipping() | vnd }}</strong> để được miễn phí
                  giao hàng.
                } @else {
                  Đơn hàng của bạn được <strong>miễn phí giao hàng</strong>.
                }
              </p>
            }
          </aside>
        </div>
      }
      @if (!dialog && recommendations().length) {
        <section class="recommendations" aria-labelledby="cart-recs-title">
          <h2 id="cart-recs-title">Có thể bạn cũng thích</h2>
          <div class="rec-grid">
            @for (product of recommendations(); track product.id) {
              <n2f-product-card [product]="product" />
            }
          </div>
        </section>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .cart-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }
    .cart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }
    h1 span {
      font-size: 16px;
      color: var(--muted);
    }
    .cart-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .cart-main {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-right: -10px;
    }
    .select-toggle {
      border-radius: 50%;
    }
    .select-toggle.active {
      background: var(--ink);
      color: #fff;
    }
    .select-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 52px;
      padding: 6px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .select-all {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .bulk-remove {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid var(--ink);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }
    .bulk-remove:disabled {
      border-color: var(--line);
    }
    input[type='checkbox'] {
      width: 20px;
      height: 20px;
      margin: 0;
      flex-shrink: 0;
      accent-color: var(--ink);
      cursor: pointer;
    }
    .cart-scroll {
      flex: 1;
      overflow-y: auto;
      padding-inline: 24px;
    }
    .cart-line {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      align-items: start;
      gap: 14px;
      padding-block: 20px;
      border-bottom: 1px solid var(--line);
    }
    .cart-line.selecting {
      grid-template-columns: 20px 96px minmax(0, 1fr);
    }
    .line-check {
      margin-top: 50px !important;
    }
    .thumb img {
      width: 96px;
      height: 120px;
      padding: 10px;
      object-fit: contain;
      background: var(--surface);
    }
    .line-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
    }
    .line-price {
      flex-shrink: 0;
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
    }
    .variant {
      display: flex;
      align-items: center;
      gap: 2px;
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .edit-variant {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--muted);
    }
    .edit-variant:hover,
    .edit-variant[aria-expanded='true'] {
      color: var(--ink);
      background: var(--surface);
    }
    .line-favorite {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: #fff;
      color: var(--ink);
    }
    .line-favorite:hover {
      border-color: var(--ink);
    }
    .line-favorite.saved {
      color: var(--brand);
    }
    .line-controls {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }
    .quantity {
      display: flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
    }
    .quantity .icon-button {
      width: 36px;
      height: 36px;
    }
    .quantity span {
      min-width: 24px;
      text-align: center;
      font-size: 15px;
      font-weight: 600;
    }
    .summary {
      padding: 16px 24px 24px;
      border-top: 1px solid var(--line);
      background: #fff;
    }
    .total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 14px;
      font-size: 16px;
      font-weight: 700;
    }
    .total small {
      margin-left: 4px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 400;
    }
    .total strong {
      font-size: 20px;
    }
    .checkout {
      width: 100%;
    }
    .view-cart {
      display: block;
      margin-top: 14px;
      text-align: center;
      text-decoration: underline;
      font-size: 14px;
    }

    /* /cart page: list + grey summary column, like UNIQLO. */
    .page {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      column-gap: 48px;
      align-content: start;
      height: auto;
      max-width: var(--page-width);
      min-height: 60vh;
      margin: 0 auto;
      padding: 32px var(--page-gutter) 72px;
    }
    .page > * {
      grid-column: 1 / -1;
    }
    /* Header spans the list column only: the checklist button lines up with the line prices. */
    .page .header-actions {
      margin-right: 0;
    }
    .page .select-toggle {
      width: 36px;
      height: 36px;
    }
    .page > .cart-header {
      grid-column: 1;
      padding: 0 0 16px;
      border-bottom: 0;
    }
    .page h1 {
      font-size: 32px;
    }
    .page .cart-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      align-items: start;
      gap: 48px;
    }
    .page .select-bar,
    .page .cart-scroll {
      padding-inline: 0;
    }
    .page .select-bar {
      padding-inline: 16px;
      border-radius: var(--radius-card);
      border-bottom: 0;
    }
    .page .cart-scroll {
      overflow: visible;
    }
    .page .cart-line {
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 20px;
      padding-block: 24px;
    }
    .page .thumb img {
      width: 120px;
      height: 150px;
    }
    .page .cart-line.selecting {
      grid-template-columns: 20px 120px minmax(0, 1fr);
    }
    .page .line-check {
      margin-top: 65px !important;
    }
    .page h2 {
      font-size: 18px;
    }
    .page .summary {
      position: sticky;
      top: 100px;
      padding: 24px;
      border: 0;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .page .summary h2 {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 0 0 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
      font-size: 19px;
      font-weight: 700;
    }
    .page .summary h2 span {
      color: var(--muted);
      font-size: 15px;
      font-weight: 400;
    }
    dl {
      margin: 0 0 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    dl div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-block: 6px;
      font-size: 15px;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
      text-align: right;
    }
    .page .total strong {
      font-size: 24px;
    }
    .note {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
    }
    .line-controls {
      flex-wrap: wrap;
      row-gap: 4px;
    }
    .editor {
      margin-top: 14px;
      padding: 16px;
      border-radius: var(--radius-card);
      background: var(--surface);
    }
    .editor-label {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--muted);
    }
    .editor-label strong {
      color: var(--ink);
    }
    .editor-colors,
    .editor-sizes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .editor-swatch {
      --swatch: #ccc;
      position: relative;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 50%;
      background: none;
    }
    .editor-swatch::before {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      background: var(--swatch);
      box-shadow: inset 0 0 0 1px #0000002e;
    }
    .editor-swatch.active {
      border-color: var(--ink);
    }
    .editor-sizes button {
      min-width: 48px;
      height: 40px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius-button);
      background: #fff;
      font: inherit;
      font-weight: 600;
    }
    .editor-sizes button.active {
      border-color: var(--ink);
      box-shadow: inset 0 0 0 1px var(--ink);
    }
    .editor-sizes button:disabled {
      text-decoration: line-through;
    }
    .editor-actions {
      display: flex;
      gap: 8px;
    }
    .editor-actions .button {
      flex: 1;
      min-height: 44px;
    }
    .editor-loading {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .recommendations {
      margin-top: 64px;
    }
    .recommendations > h2 {
      margin: 0 0 20px;
      font-size: 22px;
      font-weight: 600;
    }
    .rec-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 900px) {
      .recommendations {
        margin: 40px 0 48px;
      }
      .recommendations > h2 {
        font-size: 19px;
      }
      /* Swipeable row on small screens, with the next card peeking in. */
      .rec-grid {
        grid-template-columns: none;
        grid-auto-flow: column;
        grid-auto-columns: 46%;
        gap: 12px;
        margin-inline: calc(-1 * var(--page-gutter));
        padding-inline: var(--page-gutter);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scroll-padding-inline: var(--page-gutter);
      }
      .rec-grid > * {
        scroll-snap-align: start;
      }
      .page {
        padding-top: 20px;
        padding-bottom: 0;
      }
      .page h1 {
        font-size: 26px;
      }
      .page .cart-body {
        display: block;
      }
      .page .cart-line {
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 12px;
      }
      .page .cart-line.selecting {
        grid-template-columns: 20px 88px minmax(0, 1fr);
      }
      .page .thumb img {
        width: 88px;
        height: 110px;
      }
      .page .line-check {
        margin-top: 45px !important;
      }
      /* Mobile: the summary becomes a sticky checkout bar (audit C3). */
      .page .summary {
        position: sticky;
        bottom: 0;
        top: auto;
        z-index: 5;
        margin: 24px calc(-1 * var(--page-gutter)) 0;
        padding: 14px var(--page-gutter) calc(14px + env(safe-area-inset-bottom));
        border-top: 1px solid var(--line);
        border-radius: 0;
        background: #fff;
        box-shadow: 0 -6px 20px #0000000f;
      }
      .page {
        display: block;
      }
      .page .summary h2,
      .page dl {
        display: none;
      }
      .page .note {
        margin-top: 8px;
        font-size: 13px;
      }
      .page .total {
        margin-bottom: 10px;
      }
      .page .total strong {
        font-size: 20px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartView {
  readonly cart = inject(CartState);
  readonly wishlist = inject(WishlistState);
  readonly dialog = inject(DialogRef, { optional: true });
  readonly media = getMedia;
  private readonly catalog = inject(CATALOG_API);
  private readonly destroyRef = inject(DestroyRef);
  /** Selection mode (checklist button): pick lines to remove or to buy now. */
  readonly selecting = signal(false);
  readonly picked = signal<ReadonlySet<string>>(new Set());
  readonly allPicked = computed(
    () => this.cart.lines().length > 0 && this.picked().size === this.cart.lines().length,
  );
  /** In selection mode the summary (and checkout) covers only the picked lines. */
  readonly summaryLines = computed(() =>
    this.selecting()
      ? this.cart.lines().filter((line) => this.picked().has(line.variantId))
      : this.cart.lines(),
  );
  readonly summaryCount = computed(() =>
    this.summaryLines().reduce((sum, line) => sum + line.quantity, 0),
  );
  readonly summarySubtotal = computed(() =>
    this.summaryLines().reduce((sum, line) => sum + line.quantity * line.price, 0),
  );
  readonly remainingForFreeShipping = computed(() =>
    Math.max(0, storeSettings().policy.freeShippingFrom - this.summarySubtotal()),
  );
  /** Line being edited (variant id) and the colour/size picked in its editor. */
  readonly editing = signal<string | null>(null);
  readonly draftColor = signal('');
  readonly draftSize = signal('');
  /** Products loaded for the variant editor, by slug. */
  readonly products = signal<Record<string, Product>>({});
  private readonly bestSellers = signal<Product[]>([]);
  /** Best sellers not already in the cart. */
  readonly recommendations = computed(() => {
    const inCart = new Set(this.cart.lines().map((line) => line.productId));
    return this.bestSellers()
      .filter((product) => !inCart.has(product.id))
      .slice(0, 4);
  });

  constructor() {
    if (!this.dialog) {
      this.catalog
        .list({ ...DEFAULT_QUERY, sort: 'bestselling' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((page) => this.bestSellers.set(page.items));
    }
  }

  startCheckout(): void {
    this.cart.checkoutIds.set(this.selecting() ? new Set(this.picked()) : null);
    this.close();
  }

  toggleSelecting(): void {
    this.selecting.update((on) => !on);
    this.picked.set(new Set());
    this.editing.set(null);
  }

  togglePick(id: string): void {
    this.picked.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(): void {
    this.picked.set(
      this.allPicked() ? new Set() : new Set(this.cart.lines().map((line) => line.variantId)),
    );
  }

  removePicked(): void {
    this.cart.removeMany(this.picked());
    this.picked.set(new Set());
    this.selecting.set(false);
  }

  toggleEdit(slug: string, variantId: string): void {
    if (this.editing() === variantId) {
      this.editing.set(null);
      return;
    }
    const line = this.cart.lines().find((item) => item.variantId === variantId);
    this.draftColor.set(line?.color ?? '');
    this.draftSize.set(line?.size ?? '');
    this.editing.set(variantId);
    if (!this.products()[slug]) {
      this.catalog
        .get(slug)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((product) => {
          if (product) this.products.update((all) => ({ ...all, [slug]: product }));
        });
    }
  }

  colorsOf(product: Product): { name: string; hex: string }[] {
    return [...new Map(product.variants.map((v) => [v.color.name, v.color])).values()];
  }

  variantsOf(product: Product, color: string): ProductVariant[] {
    return product.variants.filter((variant) => variant.color.name === color);
  }

  draftVariant(product: Product): ProductVariant | undefined {
    return product.variants.find(
      (variant) =>
        variant.color.name === this.draftColor() &&
        variant.size === this.draftSize() &&
        variant.inventory > 0,
    );
  }

  applyEdit(variantId: string, product: Product): void {
    const variant = this.draftVariant(product);
    if (!variant) return;
    this.cart.changeVariant(variantId, product, variant);
    this.editing.set(null);
  }

  close(): void {
    this.dialog?.close();
  }
}
