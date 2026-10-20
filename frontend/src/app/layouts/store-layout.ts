import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, filter, fromEvent, map } from 'rxjs';
import { CartState } from '../features/cart/cart-state';
import { WishlistState } from '../features/wishlist/wishlist-state';
import { SearchPanel } from '../features/search/search-panel';
import type { SearchOrigin } from '../features/search/search-origin';
import { AuthSession } from '../features/auth/auth-session';
import { OverlayService } from '../shared/ui/overlay.service';
import { ToastHost } from '../shared/ui/toast';
import { IconComponent } from '../shared/ui/icon.component';
import { PricePipe } from '../shared/commerce/price.pipe';
import { STORE_POLICY } from '../core/store-policy';
import { STORE_INFO } from '../core/store-info';
import { formatDate } from '../features/orders/order-status';
import { MegaMenu } from './navigation/mega-menu';
import { MobileDrawer } from './navigation/mobile-drawer';
import { TOP_NAVIGATION, TopNavItem, UTILITY_LINKS } from './navigation/top-navigation';

@Component({
  selector: 'n2f-store-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    IconComponent,
    PricePipe,
    MegaMenu,
    MobileDrawer,
    SearchPanel,
    ToastHost,
  ],
  template: `
    <a class="skip-link" href="#main-content">Đến nội dung chính</a>
    <!-- Figma "header (1)" (61:341) visuals with Nike-style content: utility bar, mega menus, drawer.
         Over the homepage hero it becomes "header (2)" (64:415). -->
    <header
      class="site-header"
      [class.overlay-route]="overlayRoute()"
      [class.transparent]="transparent()"
      [class.compact]="compact()"
      [class.searching]="searchOpen()"
      (mouseenter)="cancelClose()"
      (mouseleave)="scheduleClose()"
      (focusout)="onFocusOut($event)"
    >
      <div class="utility-bar">
        <div class="container utility-inner">
          <span class="utility-tagline">From Nine to Fine.</span>
          <nav aria-label="Tiện ích">
            @for (link of utilityLinks; track link.path) {
              <a [routerLink]="link.path">{{ link.label }}</a>
            }
            <!-- Members see their tier on the profile; guests see what membership offers. -->
            <a [routerLink]="session.signedIn() ? '/account/profile' : '/policies/membership'"
              >Membership</a
            >
            @if (session.user(); as user) {
              <a routerLink="/account">Xin chào, {{ user.firstName }}</a>
            } @else {
              <a routerLink="/auth/login" [queryParams]="{ returnUrl: currentUrl() }">Đăng nhập</a>
            }
          </nav>
        </div>
      </div>
      <div class="header-inner container">
        <button
          type="button"
          class="icon-button mobile-menu"
          aria-label="Mở menu"
          title="Menu"
          [attr.aria-expanded]="menuOpen()"
          aria-controls="mobile-navigation"
          (click)="menuOpen.set(true)"
        >
          <n2f-icon name="reiconMenu" />
        </button>
        <a
          routerLink="/"
          class="wordmark"
          aria-label="nine2fine - trang chính"
          (mouseenter)="scheduleClose()"
          ><img
            [src]="transparent() ? '/assets/brand/logo-inverse.svg' : '/assets/brand/logo.svg'"
            alt="nine2fine"
            width="230"
            height="46"
        /></a>
        <nav class="desktop-nav" aria-label="Điều hướng chính">
          @for (menu of menus; track menu.id) {
            <div
              class="nav-item"
              [class.open]="openMenu()?.id === menu.id"
              (mouseenter)="hoverMenu(menu)"
            >
              @if (menu.menuOnly) {
                <!-- No landing page of its own: the label opens the panel listing every moment. -->
                <button
                  type="button"
                  class="nav-label"
                  [class.active]="activeMenuId() === menu.id"
                  [attr.data-toggle]="menu.id"
                  [attr.aria-label]="'Danh mục ' + menu.label"
                  [attr.aria-expanded]="openMenu()?.id === menu.id"
                  aria-controls="mega-panel"
                  (click)="openFromLabel(menu)"
                >
                  {{ menu.label }}
                </button>
              } @else {
                <a
                  [routerLink]="menu.path"
                  [class.active]="activeMenuId() === menu.id"
                  [attr.aria-current]="activeMenuId() === menu.id ? 'page' : null"
                  >{{ menu.label }}</a
                >
                <!-- Keyboard/touch access to the panel; the link itself still navigates. -->
                <button
                  type="button"
                  class="nav-toggle"
                  [attr.data-toggle]="menu.id"
                  [attr.aria-label]="'Danh mục ' + menu.label"
                  [attr.aria-expanded]="openMenu()?.id === menu.id"
                  aria-controls="mega-panel"
                  (click)="toggleMega(menu)"
                >
                  <n2f-icon name="reiconChevronDown" size="14px" />
                </button>
              }
            </div>
          }
        </nav>
        <div class="header-actions" (mouseenter)="scheduleClose()">
          <button
            type="button"
            class="search-trigger"
            aria-label="Tìm kiếm"
            title="Tìm kiếm"
            aria-haspopup="dialog"
            [attr.aria-expanded]="searchOpen()"
            (click)="search()"
          >
            <span class="search-placeholder" aria-hidden="true">Bạn đang tìm gì đó?</span>
            <n2f-icon name="reiconSearch" size="24px" />
          </button>
          <a
            class="icon-button bag-button wishlist-link"
            routerLink="/wishlist"
            [attr.aria-label]="'Yêu thích (' + wishlist.savedIds().length + ' sản phẩm)'"
            title="Yêu thích"
            ><n2f-icon name="reiconHeart" size="24px" /><span
              class="bag-count"
              [class.empty]="!wishlist.savedIds().length"
              aria-hidden="true"
              >{{ wishlist.savedIds().length }}</span
            ></a
          >
          <button
            type="button"
            class="icon-button bag-button"
            aria-label="Mở giỏ hàng"
            title="Giỏ hàng"
            (click)="openCart()"
          >
            <n2f-icon name="reiconCartShop" size="26px" />
            <span class="bag-count" [class.empty]="!cart.count()" aria-hidden="true">{{
              cart.count()
            }}</span>
          </button>
          @if (session.user(); as user) {
            <a
              class="account-link"
              routerLink="/account"
              [attr.aria-label]="'Tài khoản của ' + user.firstName"
              [title]="'Tài khoản của ' + user.firstName"
              ><n2f-icon name="reiconUser" size="24px"
            /></a>
          } @else {
            <a
              class="account-link"
              routerLink="/auth/login"
              [queryParams]="{ returnUrl: currentUrl() }"
              aria-label="Đăng nhập"
              title="Đăng nhập"
              ><n2f-icon name="reiconUser" size="24px"
            /></a>
          }
        </div>
      </div>
      <div
        class="mega-shell"
        id="mega-panel"
        role="region"
        [class.open]="!!openMenu()"
        [inert]="!openMenu()"
        [attr.aria-label]="shownMenu()?.label"
      >
        @if (shownMenu(); as menu) {
          <!-- Lazy chunk: the panel and its photos load only after the first hover/toggle. -->
          @defer {
            <n2f-mega-menu [item]="menu" />
          }
        }
      </div>
    </header>
    <div
      class="mega-scrim"
      [class.open]="!!openMenu()"
      aria-hidden="true"
      (click)="closeMega()"
    ></div>
    @if (showPromo()) {
      <p class="promo-strip">
        <span class="promo-long"
          >Miễn phí giao hàng cho đơn từ {{ policy.freeShippingFrom | vnd }} · Trả hàng trong
          {{ policy.returnDays }} ngày</span
        ><span class="promo-short"
          >Giao miễn phí từ {{ policy.freeShippingFrom | vnd }} · Trả hàng
          {{ policy.returnDays }} ngày</span
        >
        @if (!session.signedIn()) {
          <a routerLink="/auth/login" [queryParams]="{ returnUrl: currentUrl() }">Tham gia ngay</a>
        }
      </p>
    }
    @if (searchOpen()) {
      @defer {
        <n2f-search-panel [origin]="searchOrigin()" (closed)="closeSearch($event)" />
      }
    }
    @if (menuOpen()) {
      @defer {
        <n2f-mobile-drawer
          animate.leave="leaving"
          [firstName]="session.user()?.firstName ?? null"
          [returnUrl]="currentUrl()"
          (closed)="closeDrawer()"
          (cart)="closeDrawer(); openCart()"
        />
      }
    }
    <main id="main-content" tabindex="-1"><router-outlet /></main>
    <n2f-toast-host />
    <footer class="site-footer">
      <div class="footer-main container">
        <div>
          <a routerLink="/" class="wordmark"
            ><img src="/assets/brand/logo.svg" alt="nine2fine" width="174" height="35"
          /></a>
          <p>From Nine to Fine.<br />Trang phục cho mọi nhịp sống.</p>
        </div>
        <nav aria-label="Mua sắm">
          <h2>MUA SẮM</h2>
          <a routerLink="/new-in">Sản phẩm mới</a><a routerLink="/shop/nu">Nữ</a
          ><a routerLink="/shop/nam">Nam</a><a routerLink="/shop">Tất cả sản phẩm</a>
        </nav>
        <nav aria-label="Khoảnh khắc">
          <h2>KHOẢNH KHẮC</h2>
          <a routerLink="/shop-by-moment/work">Đi làm</a
          ><a routerLink="/shop-by-moment/dinner">Hẹn tối</a
          ><a routerLink="/shop-by-moment/event">Dự tiệc</a
          ><a routerLink="/shop-by-moment/weekend">Cuối tuần</a>
        </nav>
        <nav aria-label="Của bạn">
          <h2>CỦA BẠN</h2>
          <a routerLink="/wishlist">Đã yêu thích</a><a routerLink="/cart">Giỏ hàng</a
          ><a routerLink="/track-order">Tra cứu đơn hàng</a>
        </nav>
        <nav aria-label="Hỗ trợ">
          <h2>HỖ TRỢ</h2>
          <a routerLink="/help">Liên hệ</a><a routerLink="/policies/returns">Trả hàng & hoàn tiền</a
          ><a routerLink="/policies/shipping">Giao hàng</a
          ><a routerLink="/policies/payment">Thanh toán</a
          ><a routerLink="/policies/membership">Quyền lợi thành viên</a
          ><a routerLink="/policies/privacy">Bảo mật dữ liệu</a
          ><a routerLink="/policies/terms">Điều khoản sử dụng</a
          ><a routerLink="/policies/complaints">Giải quyết khiếu nại</a>
        </nav>
        <div class="footer-signature">
          <span>09:00</span><n2f-icon name="reiconArrowRight" size="24px" /><span>FINE.</span>
        </div>
      </div>
      <address class="footer-legal container">
        <strong>{{ info.legalName }}</strong>
        <span
          >Mã số doanh nghiệp {{ info.registrationNumber }} do {{ info.registrationIssuer }} cấp
          ngày {{ registrationDate }}</span
        >
        <span>Địa chỉ: {{ info.address }}</span>
        <span
          >Hotline: <a [href]="info.hotlineHref">{{ info.hotline }}</a> · Email:
          <a [href]="'mailto:' + info.email">{{ info.email }}</a></span
        >
        @if (info.notificationUrl; as url) {
          <a [href]="url" rel="noopener" target="_blank">Đã thông báo Bộ Công Thương</a>
        }
      </address>
      <div class="footer-bottom container">
        <span>© 2026 nine2fine</span><span>Mặc đẹp từ sáng đến tối.</span
        ><span
          >Ảnh tạm: <a href="https://www.pexels.com" rel="noopener" target="_blank">Pexels</a> ·
          VIETNAM / VND</span
        >
      </div>
    </footer>
  `,
  styleUrl: './store-layout.scss',
  host: { '(keydown.escape)': 'closeMega(true)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreLayout {
  readonly cart = inject(CartState);
  readonly wishlist = inject(WishlistState);
  readonly session = inject(AuthSession);
  readonly policy = STORE_POLICY;
  readonly info = STORE_INFO;
  readonly registrationDate = formatDate(STORE_INFO.registrationDate);
  readonly menus = TOP_NAVIGATION;
  readonly utilityLinks = UTILITY_LINKS;
  readonly menuOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly searchOrigin = signal<SearchOrigin | null>(null);
  /** Desktop mega menu currently open, and the one still rendered while the panel wipes closed. */
  readonly openMenu = signal<TopNavItem | null>(null);
  readonly shownMenu = signal<TopNavItem | null>(null);
  /** Utility bar slides away once the page scrolls (Nike: 36px, 150ms). */
  readonly compact = signal(false);
  readonly currentUrl = signal('/new-in');
  /** Overlay routes keep the transparent header at every scroll position. */
  readonly overlayRoute = signal(false);
  /** Like an open mega menu, search turns the whole header (utility bar included) solid. */
  readonly transparent = computed(
    () => this.overlayRoute() && !this.openMenu() && !this.searchOpen(),
  );
  readonly activeMenuId = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    if (path.startsWith('/shop-by-moment')) return 'moments';
    return this.menus.find((menu) => menu.path === path)?.id ?? null;
  });
  /** Nike-style promo strip; kept out of the hero overlay and the checkout transaction zone. */
  readonly showPromo = computed(
    () => !this.overlayRoute() && !this.currentUrl().startsWith('/checkout'),
  );
  private readonly overlay = inject(OverlayService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.searchOpen.set(false);
        this.closeMega();
        this.currentUrl.set(this.router.url);
        this.overlayRoute.set(wantsOverlay(this.router.routerState.snapshot.root));
      });
    const view = inject(DOCUMENT).defaultView;
    if (view) {
      fromEvent(view, 'scroll', { passive: true })
        .pipe(
          map(() => view.scrollY > 4),
          distinctUntilChanged(),
          takeUntilDestroyed(),
        )
        .subscribe((compact) => this.compact.set(compact));
    }
    inject(DestroyRef).onDestroy(() => this.clearTimers());
  }

  /** Hover intent: a short delay before the first open, instant switching once a panel is open. */
  hoverMenu(menu: TopNavItem): void {
    this.clearTimers();
    if (!matchMedia('(hover: hover)').matches) return;
    if (this.openMenu()) this.showMega(menu);
    else this.openTimer = setTimeout(() => this.showMega(menu), 150);
  }

  toggleMega(menu: TopNavItem): void {
    this.clearTimers();
    if (this.openMenu()?.id === menu.id) this.closeMega();
    else this.showMega(menu);
  }

  /** Hover already opened the panel on mouse devices, so a click there keeps it open. */
  openFromLabel(menu: TopNavItem): void {
    if (matchMedia('(hover: hover)').matches && this.openMenu()?.id !== menu.id) {
      this.clearTimers();
      this.showMega(menu);
    } else this.toggleMega(menu);
  }

  scheduleClose(): void {
    clearTimeout(this.openTimer);
    if (!this.openMenu()) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.closeMega(), 200);
  }

  cancelClose(): void {
    clearTimeout(this.closeTimer);
  }

  closeMega(restoreFocus = false): void {
    const id = this.openMenu()?.id;
    this.clearTimers();
    this.openMenu.set(null);
    if (restoreFocus && id) {
      this.host.nativeElement.querySelector<HTMLElement>(`[data-toggle="${id}"]`)?.focus();
    }
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const header = event.currentTarget as HTMLElement;
    if (this.openMenu() && (!next || !header.contains(next))) this.closeMega();
  }

  closeDrawer(): void {
    this.menuOpen.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('.mobile-menu')?.focus();
  }

  search(): void {
    this.closeMega();
    this.searchOrigin.set(this.measureSearchTrigger());
    this.searchOpen.set(true);
  }

  /** Focus returns to the trigger unless the shopper went to a result. */
  closeSearch(navigated: boolean): void {
    this.searchOpen.set(false);
    if (!navigated) {
      // The trigger is hidden while searching; focus it once it is visible again.
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLElement>('.search-trigger')?.focus(),
      );
    }
  }
  /** The drawer (with its product suggestions) loads on first open to keep the initial bundle small. */
  openCart(): void {
    void import('../features/cart/cart-view').then(({ CartView }) =>
      this.overlay.open(CartView, 'Giỏ hàng'),
    );
  }

  /** Rect and look of the header pill, the starting frame of the panel's morph. */
  private measureSearchTrigger(): SearchOrigin | null {
    const root = this.host.nativeElement;
    const trigger = root.querySelector<HTMLElement>('.search-trigger');
    const bar = root.querySelector<HTMLElement>('.header-inner');
    if (!trigger || !bar) return null;
    const rect = trigger.getBoundingClientRect();
    const style = getComputedStyle(trigger);
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      borderColor: style.borderColor,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      barTop: bar.getBoundingClientRect().top,
    };
  }

  private showMega(menu: TopNavItem): void {
    this.shownMenu.set(menu);
    this.openMenu.set(menu);
  }

  private clearTimers(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
  }
}

function wantsOverlay(route: ActivatedRouteSnapshot): boolean {
  let current: ActivatedRouteSnapshot | null = route;
  while (current?.firstChild) current = current.firstChild;
  return current?.data['headerOverlay'] === true;
}
