export interface ReferenceCategory {
  label: string;
  href: string;
  mediaId: string;
}

export interface ReferenceCampaign {
  kind: 'campaign';
  id: string;
  title: string;
  description: string;
  footnote: string;
  price: string;
  previousPrice: string;
  href: string;
  mediaId: string;
  mobileMediaId: string;
  logoMediaIds: string[];
}

export interface ReferenceProduct {
  id: string;
  name: string;
  price: string;
  notes: string[];
  href: string;
  variants: { color: string; mediaId: string; chipMediaId: string }[];
}

export interface ReferenceProductRail {
  kind: 'products';
  id: string;
  label: string;
  products: ReferenceProduct[];
}

/** Captured editorial data stays separate from nine2fine's sellable catalog. */
export interface ReferenceHomeContent {
  source: string;
  capturedDate: string;
  categories: ReferenceCategory[];
  blocks: (ReferenceCampaign | ReferenceProductRail | { kind: 'categories'; id: string })[];
}
