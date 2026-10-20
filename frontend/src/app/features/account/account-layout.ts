import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { IconComponent } from '../../shared/ui/icon.component';
import { ACCOUNT_API } from './data-access/account-api';
import { TIER_LABEL } from './data-access/account-models';
import { centerActive } from '../../shared/ui/center-active';

/** Sidebar from Figma component `sidebar` (116:3230); content area from section 193:2522. */
@Component({
  selector: 'n2f-account-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="container account">
      <aside>
        <div class="member">
          <p class="handle">&#64;{{ session.user()?.firstName }}</p>
          @if (tier(); as tier) {
            <p class="tier">{{ tier }} Member</p>
          }
        </div>
        <nav aria-label="Tài khoản">
          @for (link of links; track link.path) {
            <a [routerLink]="link.path" routerLinkActive="active" ariaCurrentWhenActive="page"
              ><n2f-icon [name]="link.icon" size="22px" /><span>{{ link.label }}</span></a
            >
          }
          <button type="button" (click)="signOut()">
            <n2f-icon name="reiconLogout" size="22px" /><span>Đăng xuất</span>
          </button>
        </nav>
      </aside>
      <section class="content"><router-outlet /></section>
    </div>
  `,
  styles: `
    .account {
      --u: clamp(0.66px, calc(100vw / 1920), 1px);
      display: grid;
      grid-template-columns: max(220px, calc(285 * var(--u))) minmax(0, 1fr);
      gap: max(40px, calc(210 * var(--u)));
      padding-block: calc(70 * var(--u)) 96px;
      min-height: 70vh;
    }
    .handle {
      margin: 0;
      font-size: max(20px, calc(31 * var(--u)));
      font-weight: 700;
    }
    .tier {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: max(15px, calc(24 * var(--u)));
      font-weight: 700;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: calc(64 * var(--u));
    }
    nav a,
    nav button {
      min-height: 44px;
      display: flex;
      align-items: center;
      gap: calc(26 * var(--u));
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: max(15px, calc(24 * var(--u)));
      font-weight: 500;
      text-align: left;
    }
    nav a.active span {
      text-decoration: underline;
      text-underline-offset: 6px;
    }
    nav button {
      margin-top: 24px;
      color: var(--muted);
    }
    nav button:hover {
      color: var(--brand);
    }
    @media (max-width: 900px) {
      .account {
        grid-template-columns: minmax(0, 1fr);
        gap: 24px;
        padding-top: 24px;
      }
      nav {
        flex-direction: row;
        gap: 20px;
        margin-top: 16px;
        padding-bottom: 4px;
        overflow-x: auto;
        border-bottom: 1px solid var(--line);
      }
      nav a,
      nav button {
        flex-shrink: 0;
        gap: 8px;
        white-space: nowrap;
      }
      nav button {
        margin-top: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountLayout {
  readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    // On phones the menu is a horizontal scroller; keep the current page's link in view.
    const reveal = () =>
      afterNextRender(
        // RouterLinkActive sets `.active` after NavigationEnd, so wait one more task.
        () =>
          setTimeout(() => centerActive(this.host.nativeElement.querySelector<HTMLElement>('nav'))),
        { injector: this.injector },
      );
    reveal();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(reveal);
  }
  readonly tier = toSignal(
    inject(ACCOUNT_API)
      .getMembership()
      .pipe(
        map((membership) => TIER_LABEL[membership.tier]),
        catchError(() => of(null)),
      ),
    { initialValue: null },
  );
  readonly links = [
    { path: '/account/profile', label: 'Tài khoản', icon: 'reiconUser' },
    { path: '/account/addresses', label: 'Địa chỉ', icon: 'reiconTruck' },
    { path: '/account/orders', label: 'Lịch sử mua hàng', icon: 'reiconHistory' },
    { path: '/account/vouchers', label: 'Phiếu giảm giá', icon: 'reiconTicket' },
    { path: '/wishlist', label: 'Danh sách yêu thích', icon: 'reiconHeart' },
    { path: '/policies', label: 'Chính sách', icon: 'reiconShieldCheck' },
  ];

  signOut(): void {
    this.session.signOut();
    void this.router.navigateByUrl('/new-in');
  }
}
