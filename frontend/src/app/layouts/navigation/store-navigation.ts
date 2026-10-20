import { Params } from '@angular/router';
import { Category, CATEGORIES, Moment, MOMENTS } from '../../features/catalog/models/product';
import { NavLink, TOP_NAVIGATION, TopNavItem } from './top-navigation';

export interface NavGroup {
  title: string;
  links: NavLink[];
}

interface MenuContent {
  groups: NavGroup[];
  feature: { mediaId: string; eyebrow: string; title: string; path: string; queryParams?: Params };
}

/** Top-level item with its columns: a mega menu on desktop (Nike-style), a drawer panel on mobile. */
export type NavMenu = TopNavItem & MenuContent;

/**
 * Category/moment photography for the menus. Same temporary Pexels slots as the Home category grid,
 * so a photo means the same thing everywhere; replace through the media manifest.
 */
const CATEGORY_MEDIA: Record<Category, string> = {
  tops: 'editorial-home-hero-mobile',
  bottoms: 'editorial-new-drop',
  dresses: 'editorial-moment-event',
  outerwear: 'editorial-story-0900',
};
const MOMENT_MEDIA: Record<Moment, string> = {
  work: 'editorial-moment-work',
  dinner: 'editorial-moment-dinner',
  event: 'editorial-moment-event',
  weekend: 'editorial-moment-weekend',
};
const MOMENT_CAPTIONS: Record<Moment, string> = {
  work: 'Chỉn chu cho 9 giờ sáng',
  dinner: 'Gọn gàng cho bữa tối',
  event: 'Tự tin ở mọi buổi tiệc',
  weekend: 'Thư thái mà vẫn đúng chất',
};

function categoryLinks(
  path: string,
  only?: readonly Category[],
  labels?: Partial<Record<Category, string>>,
): NavLink[] {
  return CATEGORIES.filter((category) => !only || only.includes(category.value)).map(
    (category) => ({
      label: labels?.[category.value] ?? category.label,
      path: path === '/shop' ? `/shop/${category.value}` : path,
      queryParams: path === '/shop' ? undefined : { category: category.value },
      mediaId: CATEGORY_MEDIA[category.value],
    }),
  );
}

function withoutMedia(links: NavLink[]): NavLink[] {
  return links.map((link) => ({ ...link, mediaId: undefined }));
}

function momentLinks(path?: string): NavLink[] {
  return MOMENTS.map((moment) => ({
    label: moment.label,
    path: path ?? `/shop-by-moment/${moment.value}`,
    queryParams: path ? { moment: moment.value } : undefined,
    mediaId: MOMENT_MEDIA[moment.value],
    caption: MOMENT_CAPTIONS[moment.value],
  }));
}

/** Gender menus only list categories that exist in that assortment (mock catalog: no menswear dresses). */
const MENSWEAR: readonly Category[] = ['tops', 'bottoms', 'outerwear'];

const MENU_CONTENT: Record<TopNavItem['id'], MenuContent> = {
  new: {
    groups: [
      {
        title: 'Nổi bật',
        links: [
          { label: 'Hàng mới về', path: '/new-in' },
          { label: 'Bán chạy nhất', path: '/shop', queryParams: { sort: 'bestselling' } },
          { label: 'Tất cả sản phẩm', path: '/shop' },
        ],
      },
      {
        title: 'Mới theo phong cách',
        links: [
          {
            label: 'Nam mới về',
            path: '/shop/nam',
            queryParams: { sort: 'newest' },
            mediaId: 'editorial-moment-work',
          },
          {
            label: 'Nữ mới về',
            path: '/shop/nu',
            queryParams: { sort: 'newest' },
            mediaId: 'editorial-home-hero-mobile',
          },
        ],
      },
      { title: 'Danh mục', links: categoryLinks('/shop') },
    ],
    feature: {
      mediaId: 'editorial-new-drop',
      eyebrow: 'New drop / 02',
      title: 'The Everyday Edit',
      path: '/new-in',
    },
  },
  nam: {
    groups: [
      {
        title: 'Nổi bật',
        links: [
          { label: 'Hàng mới về', path: '/shop/nam', queryParams: { sort: 'newest' } },
          { label: 'Bán chạy nhất', path: '/shop/nam', queryParams: { sort: 'bestselling' } },
          { label: 'Tất cả đồ Nam', path: '/shop/nam' },
        ],
      },
      // Temporary photos are womenswear except moment-work, so Nam links keep the feature photo.
      {
        title: 'Danh mục',
        links: withoutMedia(categoryLinks('/shop/nam', MENSWEAR, { bottoms: 'Quần' })),
      },
      { title: 'Theo khoảnh khắc', links: withoutMedia(momentLinks('/shop/nam')) },
    ],
    feature: {
      mediaId: 'editorial-moment-work',
      eyebrow: 'Nam',
      title: 'Sharp enough for 9AM',
      path: '/shop/nam',
    },
  },
  nu: {
    groups: [
      {
        title: 'Nổi bật',
        links: [
          { label: 'Hàng mới về', path: '/shop/nu', queryParams: { sort: 'newest' } },
          { label: 'Bán chạy nhất', path: '/shop/nu', queryParams: { sort: 'bestselling' } },
          { label: 'Tất cả đồ Nữ', path: '/shop/nu' },
        ],
      },
      { title: 'Danh mục', links: categoryLinks('/shop/nu') },
      { title: 'Theo khoảnh khắc', links: momentLinks('/shop/nu') },
    ],
    feature: {
      mediaId: 'editorial-story-0900',
      eyebrow: 'Nữ',
      title: 'Từ bàn làm việc đến bữa tối',
      path: '/shop/nu',
    },
  },
  moments: {
    groups: [{ title: 'Mặc cho khoảnh khắc của bạn', links: momentLinks() }],
    feature: {
      mediaId: 'editorial-story-2000',
      eyebrow: 'One look. Three moments.',
      title: 'From Nine to Fine',
      path: '/shop-by-moment/dinner',
    },
  },
};

/** Full menus for the lazy mega menu and drawer chunks. */
export const STORE_NAVIGATION: NavMenu[] = TOP_NAVIGATION.map((item) => ({
  ...item,
  ...MENU_CONTENT[item.id],
}));
