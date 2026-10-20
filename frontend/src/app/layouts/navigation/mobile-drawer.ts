import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { NavMenu, STORE_NAVIGATION } from './store-navigation';
import { UTILITY_LINKS } from './top-navigation';

/**
 * Mobile navigation drawer (Nike pattern): slides in from the left, next to the menu trigger; each top-level item opens a
 * sub-panel that slides over the list. Sub-panels lead with a photo, and links that have one show
 * a thumbnail. Rendered only while open (the parent adds `animate.leave="leaving"` so the slide-out
 * plays); focus is trapped and Escape closes it.
 */
@Component({
  selector: 'n2f-mobile-drawer',
  imports: [RouterLink, CdkTrapFocus, MediaImageComponent, IconComponent],
  template: `
    <button
      type="button"
      class="scrim"
      tabindex="-1"
      aria-label="Đóng menu"
      (click)="closed.emit()"
    ></button>
    <nav
      class="drawer"
      id="mobile-navigation"
      aria-label="Menu di động"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <div class="drawer-top">
        @if (panel()) {
          <button type="button" class="back" (click)="back()">
            <n2f-icon name="reiconChevronLeft" size="20px" /> Tất cả
          </button>
        }
        <button type="button" class="close" aria-label="Đóng menu" (click)="closed.emit()">
          <n2f-icon name="reiconX" size="22px" />
        </button>
      </div>

      <div class="panels" [class.sub-open]="!!panel()">
        <div class="panel" [inert]="!!panel()">
          <ul class="top-list">
            @for (menu of menus; track menu.id) {
              <li>
                <button type="button" [attr.data-menu]="menu.id" (click)="open(menu)">
                  {{ menu.label }} <n2f-icon name="reiconChevronRight" size="22px" />
                </button>
              </li>
            }
          </ul>

          <div class="member">
            @if (firstName(); as name) {
              <p>Xin chào, {{ name }}.</p>
              <div class="member-actions">
                <a class="pill dark" routerLink="/account">Tài khoản của tôi</a>
                <a class="pill" routerLink="/account/profile">Membership</a>
              </div>
            } @else {
              <p>Trở thành thành viên nine2fine để lưu sản phẩm yêu thích và nhận ưu đãi riêng.</p>
              <div class="member-actions">
                <a class="pill dark" routerLink="/policies/membership">Membership</a>
                <a class="pill" routerLink="/auth/login" [queryParams]="{ returnUrl: returnUrl() }"
                  >Đăng nhập</a
                >
              </div>
            }
          </div>

          <ul class="aux">
            <li>
              <button type="button" (click)="cart.emit()">
                <n2f-icon name="reiconCartShop" size="22px" /> Giỏ hàng
              </button>
            </li>
            @for (link of utilityLinks; track link.path) {
              <li>
                <a [routerLink]="link.path"
                  ><n2f-icon [name]="link.path === '/wishlist' ? 'reiconHeart' : 'reiconBox'" />
                  {{ link.label }}</a
                >
              </li>
            }
          </ul>
        </div>

        <div class="panel sub" [inert]="!panel()">
          @if (shown(); as current) {
            <h2 #subTitle tabindex="-1">{{ current.label }}</h2>
            <a
              class="feature"
              [routerLink]="current.feature.path"
              [queryParams]="current.feature.queryParams"
            >
              <n2f-media-image
                [mediaId]="current.feature.mediaId"
                sizes="86vw"
                [decorative]="true"
              />
              <span class="feature-copy">
                <span>{{ current.feature.eyebrow }}</span>
                <strong>{{ current.feature.title }}</strong>
              </span>
            </a>
            @for (group of current.groups; track group.title) {
              <p class="group-title">{{ group.title }}</p>
              <ul class="links">
                @for (link of group.links; track link.label) {
                  <li>
                    <a [routerLink]="link.path" [queryParams]="link.queryParams">
                      @if (link.mediaId) {
                        <n2f-media-image
                          class="thumb"
                          [mediaId]="link.mediaId"
                          sizes="56px"
                          [decorative]="true"
                        />
                      }
                      <span class="link-copy">
                        {{ link.label }}
                        @if (link.caption) {
                          <small>{{ link.caption }}</small>
                        }
                      </span>
                    </a>
                  </li>
                }
              </ul>
            }
          }
        </div>
      </div>
    </nav>
  `,
  styleUrl: './mobile-drawer.scss',
  host: { '(keydown.escape)': 'closed.emit()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileDrawer {
  readonly firstName = input<string | null>(null);
  readonly returnUrl = input('/');
  readonly closed = output<void>();
  readonly cart = output<void>();

  readonly menus = STORE_NAVIGATION;
  readonly utilityLinks = UTILITY_LINKS;
  readonly panel = signal<NavMenu | null>(null);
  /** Keeps the sub-panel content during its slide-out after "Tất cả". */
  readonly shown = signal<NavMenu | null>(null);
  private readonly subTitle = viewChild<ElementRef<HTMLElement>>('subTitle');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Lock page scroll behind the drawer while it is mounted.
    const body = inject(DOCUMENT).body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (body.style.overflow = previous));
  }

  open(menu: NavMenu): void {
    this.shown.set(menu);
    this.panel.set(menu);
    // Move focus into the panel once it is no longer inert.
    setTimeout(() => this.subTitle()?.nativeElement.focus());
  }

  back(): void {
    const id = this.panel()?.id;
    this.panel.set(null);
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>(`[data-menu="${id}"]`)?.focus(),
    );
  }
}
