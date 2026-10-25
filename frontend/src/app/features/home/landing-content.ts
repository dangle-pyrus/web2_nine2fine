import { SortOrder } from '../catalog/models/product';

/** Editorial styling suggestions are separate from sellable catalog products. */
export interface LandingCampaign {
  kind: 'campaign';
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  mediaId: string;
  mobileMediaId: string;
  /** Set for English brand lines so screen readers switch voice on a `lang="vi"` page. */
  titleLang?: 'en';
  /** Replaces description and link once the shopper is signed in (e.g. the club sign-up). */
  member?: { description: string; href: string };
}

export interface LandingEdit {
  kind: 'products';
  id: string;
  label: string;
  cards: { title: string; caption: string; href: string; mediaId: string }[];
}

/** Real catalog products (price, sizes, add to cart), read from the catalog API. */
export interface LandingShop {
  kind: 'shop';
  id: string;
  label: string;
  sort: SortOrder;
  href: string;
  queryParams?: Record<string, string>;
}

export interface LandingCategories {
  kind: 'categories';
  id: string;
}

/**
 * One home page block. `enabled: false` hides it without deleting it; missing means shown.
 */
export type LandingBlock = (LandingCampaign | LandingEdit | LandingShop | LandingCategories) & {
  enabled?: boolean;
};

export interface LandingContent {
  categories: { label: string; href: string; mediaId: string }[];
  moments: { label: string; href: string }[];
  blocks: LandingBlock[];
}
