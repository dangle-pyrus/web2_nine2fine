import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaImageComponent } from '../../shared/ui/media-image.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { NavMenu, STORE_NAVIGATION } from './store-navigation';
import { NavLink, TopNavItem } from './top-navigation';

/**
 * Desktop mega menu (Nike-style columns) plus a preview photo: hovering or focusing a link that
 * has a photo swaps the preview, so shoppers can see what "Đầm" or "Dinner" looks like.
 */
@Component({
  selector: 'n2f-mega-menu',
  imports: [RouterLink, MediaImageComponent, IconComponent],
  template: `
    <!-- Re-created per menu so the column stagger replays when switching menus. -->
    @for (current of [menu()]; track current.id) {
      <div class="container mega-inner">
        <div class="groups">
          @for (group of current.groups; track group.title; let index = $index) {
            <div class="group" [style.--i]="index">
              <p class="group-title">{{ group.title }}</p>
              <ul>
                @for (link of group.links; track link.label) {
                  <li>
                    <a
                      [routerLink]="link.path"
                      [queryParams]="link.queryParams"
                      (mouseenter)="preview.set(link)"
                      (focus)="preview.set(link)"
                      >{{ link.label }}</a
                    >
                  </li>
                }
              </ul>
            </div>
          }
        </div>
        <a
          class="feature"
          [style.--i]="current.groups.length"
          [routerLink]="target().path"
          [queryParams]="target().queryParams"
          tabindex="-1"
          aria-hidden="true"
        >
          <span class="feature-media">
            @for (mediaId of mediaIds(); track mediaId) {
              <n2f-media-image
                [class.active]="mediaId === activeMedia()"
                [mediaId]="mediaId"
                sizes="260px"
                [decorative]="true"
              />
            }
          </span>
          <span class="feature-eyebrow">{{ caption().eyebrow }}</span>
          <strong class="feature-title">{{ caption().title }}</strong>
          <span class="feature-cta">Khám phá <n2f-icon name="reiconArrowRight" size="16px" /></span>
        </a>
      </div>
    }
  `,
  styleUrl: './mega-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MegaMenu {
  readonly item = input.required<TopNavItem>();
  readonly menu = computed(
    () => STORE_NAVIGATION.find((menu) => menu.id === this.item().id) as NavMenu,
  );
  /** Last link with a photo the shopper pointed at; resets whenever another menu opens. */
  readonly preview = linkedSignal<NavMenu, NavLink | null>({
    source: this.menu,
    computation: () => null,
  });

  readonly mediaIds = computed(() => {
    const ids = this.menu().groups.flatMap((group) => group.links.map((link) => link.mediaId));
    return [...new Set([this.menu().feature.mediaId, ...ids])].filter((id): id is string => !!id);
  });
  private readonly previewWithMedia = computed(() => {
    const link = this.preview();
    return link?.mediaId ? link : null;
  });
  readonly activeMedia = computed(
    () => this.previewWithMedia()?.mediaId ?? this.menu().feature.mediaId,
  );
  readonly caption = computed(() => {
    const link = this.previewWithMedia();
    return link
      ? { eyebrow: this.menu().label, title: link.label }
      : { eyebrow: this.menu().feature.eyebrow, title: this.menu().feature.title };
  });
  readonly target = computed(() => this.previewWithMedia() ?? this.menu().feature);
}
