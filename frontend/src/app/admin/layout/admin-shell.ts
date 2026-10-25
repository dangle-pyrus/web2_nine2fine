import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, interval, map } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { AdminSession } from '../core/admin-session';
import type { Permission } from '../core/permissions';
import { ROLE_LABELS } from '../core/permissions';
import { ADMIN_AUTH_API, ADMIN_ORDERS_API, ADMIN_RETURNS_API } from '../data-access/admin-apis';
import { AdminDialogs } from '../ui/dialogs';
import { AdmIcon } from '../ui/icon';
import { isShortcutEvent } from '../ui/keyboard';
import { AdmToastHost } from '../ui/toast';
import { AdminStylesheet } from './admin-stylesheet';
import { CommandPalette } from './command-palette';
import { GO_TO } from './shortcuts';
import { ShortcutsDialog } from './shortcuts-dialog';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  permission: Permission;
  exact?: boolean;
  /** Key into `counts` for the "needs action" number (2.1). */
  count?: 'toFulfil' | 'returns';
  children?: {
    label: string;
    link: string;
    count?: 'returns';
    exact?: boolean;
  }[];
}

const COLLAPSE_KEY = 'n2f.admin.sidebar';
/** Sidebar counts refresh this often while the tab is visible. */
const COUNTS_REFRESH_MS = 60_000;
/** Second key of a "G then O" jump must follow within this time. */
const CHORD_MS = 1200;

/**
 * Admin app shell (guideline 2, 3.10 Sidebar): grey sidebar with a white "pill" for the active
 * item, flat white content area. Below 1024px the sidebar becomes a drawer (8.3).
 */
@Component({
  selector: 'adm-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdmIcon, AdmToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'adm',
    '[class.is-ready]': 'stylesheet.ready()',
    '[class.is-collapsed]': 'collapsed() && !compact()',
    '[class.is-compact]': 'compact()',
    '(document:keydown)': 'onKey($event)',
  },
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  protected readonly stylesheet = inject(AdminStylesheet);
  protected readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly auth = inject(ADMIN_AUTH_API);
  private readonly ordersApi = inject(ADMIN_ORDERS_API);
  private readonly returnsApi = inject(ADMIN_RETURNS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 1023px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly collapsed = signal(readCollapsed());
  protected readonly drawerOpen = signal(false);
  protected readonly counts = signal<{ toFulfil: number; returns: number }>({
    toFulfil: 0,
    returns: 0,
  });
  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly nav: NavItem[] = [
    {
      label: 'Tổng quan',
      icon: 'reiconHome',
      link: '/admin',
      permission: 'orders.view',
      exact: true,
    },
    {
      label: 'Đơn hàng',
      icon: 'reiconBill',
      link: '/admin/orders',
      permission: 'orders.view',
      count: 'toFulfil',
      children: [
        { label: 'Tất cả đơn hàng', link: '/admin/orders' },
        { label: 'Trả hàng', link: '/admin/returns', count: 'returns' },
      ],
    },
    {
      label: 'Sản phẩm',
      icon: 'reiconTshirt',
      link: '/admin/products',
      permission: 'products.view',
      children: [
        { label: 'Tất cả sản phẩm', link: '/admin/products' },
        { label: 'Bộ sưu tập', link: '/admin/collections' },
        { label: 'Bảng size', link: '/admin/size-charts' },
        { label: 'Đánh giá', link: '/admin/reviews' },
      ],
    },
    { label: 'Tồn kho', icon: 'reiconBox', link: '/admin/inventory', permission: 'inventory.view' },
    {
      label: 'Khách hàng',
      icon: 'reiconUsers',
      link: '/admin/customers',
      permission: 'customers.view',
    },
    {
      label: 'Khuyến mãi',
      icon: 'reiconTicketSale',
      link: '/admin/promotions',
      permission: 'promotions.view',
    },
    {
      label: 'Nội dung trang chủ',
      icon: 'reiconWidget',
      link: '/admin/content',
      permission: 'products.view',
    },
    {
      label: 'Báo cáo',
      icon: 'reiconChartBar',
      link: '/admin/reports',
      permission: 'dashboard.revenue',
    },
  ];
  /** Modules the role may not see are hidden, not disabled (8.2). */
  protected readonly items = computed(() => {
    this.session.user();
    return this.nav.filter((item) => this.session.can(item.permission));
  });
  protected readonly initials = computed(() =>
    (this.session.user()?.name ?? '')
      .split(' ')
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );

  private readonly title = inject(Title);
  private chordUntil = 0;
  /** Work waiting for the team, shown in the tab title so it is visible from other tabs. */
  private readonly pending = computed(() => this.counts().toFulfil + this.counts().returns);

  constructor() {
    this.stylesheet.load();
    interval(COUNTS_REFRESH_MS)
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.refreshCounts());
    effect((onCleanup) => {
      const pending = this.pending();
      this.url();
      // After the router has written the page title for this navigation.
      const timer = setTimeout(() => {
        const base = this.title.getTitle().replace(/^\(\d+\) /, '');
        this.title.setTitle(pending ? `(${pending}) ${base}` : base);
      });
      onCleanup(() => clearTimeout(timer));
    });
    inject(DestroyRef).onDestroy(() =>
      this.title.setTitle(this.title.getTitle().replace(/^\(\d+\) /, '')),
    );
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.drawerOpen.set(false);
        this.refreshCounts();
      });
    this.refreshCounts();
  }

  isSection(link: string): boolean {
    const url = this.url().split('?')[0];
    const item = this.nav.find((entry) => entry.link === link);
    return [link, ...(item?.children?.map((child) => child.link) ?? [])].some((prefix) =>
      url.startsWith(prefix),
    );
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* Storage unavailable: the choice lasts for this page only. */
    }
  }

  openSearch(): void {
    this.drawerOpen.set(false);
    this.dialogs.modal(CommandPalette, null, 'adm-palette-panel');
  }

  onKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    if (!isShortcutEvent(event)) return;
    const key = event.key.toLowerCase();
    if (Date.now() < this.chordUntil) {
      this.chordUntil = 0;
      const target = GO_TO.find((item) => item.key === key);
      if (target && this.canOpen(target.permission)) {
        event.preventDefault();
        void this.router.navigateByUrl(target.link);
      }
      return;
    }
    if (key === 'g') {
      this.chordUntil = Date.now() + CHORD_MS;
    } else if (event.key === '/') {
      event.preventDefault();
      const search = document.querySelector<HTMLInputElement>('#adm-main input[type="search"]');
      if (search) search.focus();
      else this.openSearch();
    } else if (event.key === '?') {
      event.preventDefault();
      this.dialogs.modal(ShortcutsDialog, null);
    }
  }

  private canOpen(permission: Permission | null): boolean {
    return permission
      ? this.session.can(permission)
      : this.session.can('settings.store') ||
          this.session.can('settings.staff') ||
          this.session.can('settings.audit');
  }

  logout(): void {
    this.auth.logout().subscribe({
      complete: () => {
        this.session.user.set(null);
        void this.router.navigateByUrl('/admin/login');
      },
    });
  }

  private refreshCounts(): void {
    if (!this.session.can('orders.view')) return;
    this.ordersApi
      .counts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (counts) =>
          this.counts.update((value) => ({
            ...value,
            toFulfil:
              (counts['to-fulfil'] ?? 0) + (counts['to-confirm'] ?? 0) + (counts['failed'] ?? 0),
          })),
        error: () => undefined,
      });
    this.returnsApi
      .list({ state: 'pending', page: 1, pageSize: 1, search: '', sort: '', dir: 'desc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.counts.update((value) => ({ ...value, returns: page.total })),
        error: () => undefined,
      });
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
