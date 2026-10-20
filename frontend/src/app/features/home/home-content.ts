import { InjectionToken } from '@angular/core';
import { Category, Moment } from '../catalog/models/product';

export interface HomeLink {
  label: string;
  link: string;
  fragment?: string;
}

export interface StoryMoment {
  id: string;
  time: string;
  label: string;
  title: string;
  copy: string;
  mediaId: string;
  /** Related product suggestion; temporary editorial photography is not SKU photography. */
  productSlug: string;
}

export interface HomeCategory {
  category: Category;
  mediaId: string;
  caption: string;
}

export interface MomentCard {
  moment: Moment;
  title: string;
  lines: string[];
  mediaId: string;
}

export interface UspPillar {
  title: string;
  lines: string[];
  detail: string;
}

/** Editorial homepage content (plan section 8). Delivered by CMS/backend later. */
export interface HomeContent {
  hero: {
    lines: string[];
    accent: string;
    timeline: { time: string; label: string }[];
    mediaId: string;
    mobileMediaId: string;
    primary: HomeLink;
    secondary: HomeLink;
  };
  categories: { eyebrow: string; title: string; cta: HomeLink; cards: HomeCategory[] };
  story: { eyebrow: string; title: string; intro: string; moments: StoryMoment[] };
  moments: { eyebrow: string; title: string; cards: MomentCard[] };
  newDrop: { number: string; title: string; copy: string; mediaId: string; cta: HomeLink };
  bestSellers: { title: string; cta: HomeLink };
  usp: { eyebrow: string; title: string; provisional: boolean; pillars: UspPillar[] };
  campaign: { eyebrow: string; lines: string[]; copy: string; mediaId: string; cta: HomeLink };
  reviews: { title: string; productIds: string[] };
  club: { title: string; perks: string[]; consent: string };
}

export const HOME_CONTENT = new InjectionToken<HomeContent>('HOME_CONTENT');
