import { Params } from '@angular/router';

/** A navigation destination. `mediaId` swaps the mega-menu preview photo on hover/focus. */
export interface NavLink {
  label: string;
  path: string;
  queryParams?: Params;
  mediaId?: string;
  /** Short line shown under the label in the mobile drawer. */
  caption?: string;
}

/**
 * Top-level header items. Kept tiny because it ships in the initial bundle; each item's columns
 * and photos live in `store-navigation.ts`, loaded with the lazy mega menu / drawer.
 */
export interface TopNavItem {
  id: 'new' | 'nam' | 'nu' | 'moments';
  label: string;
  path: string;
  /** The label only opens its menu: this item has no single landing page of its own. */
  menuOnly?: boolean;
}

export const TOP_NAVIGATION: TopNavItem[] = [
  { id: 'new', label: 'Sản phẩm mới', path: '/new-in' },
  { id: 'nu', label: 'Nữ', path: '/shop/nu' },
  { id: 'nam', label: 'Nam', path: '/shop/nam' },
  { id: 'moments', label: 'Khoảnh khắc', path: '/shop-by-moment/work', menuOnly: true },
];

/** Nike-style utility bar; only routes that exist today. Wishlist is a heart icon in the main bar. */
export const UTILITY_LINKS: NavLink[] = [{ label: 'Tra cứu đơn hàng', path: '/track-order' }];
