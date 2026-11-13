import { computed, inject, Injectable, signal } from '@angular/core';
import { API_CONFIG } from '../../core/api-config';
import { HttpCollectionsApi } from '../../features/catalog/data-access/collections-api';
import { HttpHomeContentApi } from '../../features/home/data-access/home-content-api';
import { hrefPath, hrefQuery } from '../../features/home/home-href';
import { MockCollectionsApi } from '../../../mocks/mock-collections-api';
import { NavMenu } from './store-navigation';
import { NavLink } from './top-navigation';

/**
 * Menu entries that come from the server (lazy chunk with the menus): the "Khoảnh khắc" cards from
 * `GET /content/home` (BR-MOM-02, shares the home page's cached read) and a "Bộ sưu tập" link when
 * at least one active collection exists. Any failure keeps the static menu.
 */
@Injectable({ providedIn: 'root' })
export class NavLive {
  private readonly config = inject(API_CONFIG);
  private readonly moments = signal<NavLink[] | null>(null);
  private readonly collections = signal(false);

  constructor() {
    if (this.config.contentMode === 'http') {
      inject(HttpHomeContentApi)
        .getHomeContent()
        .subscribe({
          next: (content) => {
            const links = content.moments
              .filter((card) => !!card.href)
              .map((card): NavLink => ({
                label: card.label,
                path: hrefPath(card.href),
                queryParams: hrefQuery(card.href) ?? undefined,
                mediaId: card.mediaId,
                caption: card.lines?.join(' ') || undefined,
              }));
            this.moments.set(links.length ? links : null);
          },
          error: () => undefined,
        });
    }
    const collections =
      this.config.contentMode === 'mock' ? inject(MockCollectionsApi) : inject(HttpCollectionsApi);
    collections.list().subscribe({
      next: (items) => this.collections.set(items.length > 0),
      error: () => undefined,
    });
  }

  /** The static menus with the live entries applied. */
  readonly apply = computed(() => {
    const moments = this.moments();
    const collections = this.collections();
    return (menus: NavMenu[]): NavMenu[] =>
      menus.map((menu) => {
        if (menu.id === 'moments' && moments) {
          return { ...menu, groups: [{ ...menu.groups[0], links: moments }] };
        }
        if (menu.id === 'new' && collections) {
          const [first, ...rest] = menu.groups;
          return {
            ...menu,
            groups: [
              { ...first, links: [...first.links, { label: 'Bộ sưu tập', path: '/collections' }] },
              ...rest,
            ],
          };
        }
        return menu;
      });
  });
}
