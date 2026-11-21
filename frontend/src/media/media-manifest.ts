import pexelsMedia from './pexels-media.json';
import uniqloMedia from './uniqlo-reference.json';

export interface MediaAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
  temporary: boolean;
  source: 'local-brand' | 'undraw' | 'pexels' | 'reference';
  /** Local media imported from the user's saved reference; never attached to a sellable SKU. */
  sourceUrl?: string;
  videoSrc?: string;
  /** Responsive candidates (`srcset`), when the asset has several widths. */
  srcset?: string;
  /** CSS object-position matching the curated focal point. */
  objectPosition?: string;
  credit?: { photoId: string; photographer: string; photographerUrl: string; url: string };
}

interface PexelsEntry {
  alt: string;
  focal: string;
  files: { src: string; width: number; height: number }[];
  pexelsId: number;
  pageUrl: string;
  photographer: string;
  photographerUrl: string;
}

/**
 * Temporary editorial photography curated from Pexels by scripts/pexels/fetch_media.py (archived 2026-11-21 in
 * ../nine2fine-archive/2026-11-21/frontend/scripts/pexels/)
 * (provenance in pexels-media.json). Replace with brand photography by editing the JSON/script;
 * components only reference the media IDs below.
 */
const EDITORIAL: Record<string, MediaAsset> = Object.fromEntries(
  Object.entries(pexelsMedia as Record<string, PexelsEntry>).map(([slot, entry]) => {
    const largest = entry.files[entry.files.length - 1];
    const asset: MediaAsset = {
      src: entry.files[Math.min(1, entry.files.length - 1)].src,
      srcset: entry.files.map((file) => `${file.src} ${file.width}w`).join(', '),
      alt: entry.alt,
      width: largest.width,
      height: largest.height,
      objectPosition: entry.focal,
      temporary: true,
      source: 'pexels',
      credit: {
        photoId: String(entry.pexelsId),
        photographer: entry.photographer,
        photographerUrl: entry.photographerUrl,
        url: entry.pageUrl,
      },
    };
    return [`editorial-${slot}`, asset];
  }),
);

export const MEDIA: Record<string, MediaAsset> = {
  ...Object.fromEntries(
    Object.entries(uniqloMedia).map(([id, asset]) => [
      id,
      { ...asset, source: 'reference' as const },
    ]),
  ),
  ...EDITORIAL,
  'catalog-placeholder': {
    src: '/assets/illustrations/shopping_bags.svg',
    alt: 'Ảnh sản phẩm đang được cập nhật',
    width: 400,
    height: 500,
    temporary: true,
    source: 'undraw',
  },

  // Account empty states use the user's brand-coloured illustrations from asset/ (Figma 193:2522).
  'empty-address': {
    src: '/assets/account/delivery_address%201.svg',
    alt: '',
    width: 368,
    height: 320,
    temporary: false,
    source: 'local-brand',
  },
  'empty-vouchers': {
    src: '/assets/account/discount%201.svg',
    alt: '',
    width: 550,
    height: 320,
    temporary: false,
    source: 'local-brand',
  },
  'empty-orders': {
    src: '/assets/account/add_to_cart%201.svg',
    alt: '',
    width: 410,
    height: 310,
    temporary: false,
    source: 'local-brand',
  },
  'not-found': {
    src: '/assets/illustrations/page_not_found.svg',
    alt: '',
    width: 320,
    height: 240,
    temporary: false,
    source: 'undraw',
  },
};

/** Id of an image an admin uploaded (docs/api/openapi.yaml `UploadedImage`): `up-<32 hex>.<ext>`. */
const UPLOADED_ID = /^up-[0-9a-f]{32}\.(jpg|png|webp)$/;

/**
 * One lookup for every media id (BR-INV-27): the manifest first; an uploaded image is served by
 * `/api/media/{id}` (same site, the `/api` proxy); anything else is the placeholder.
 */
export function getMedia(id: string): MediaAsset {
  const known = MEDIA[id];
  if (known) return known;
  if (UPLOADED_ID.test(id)) {
    return {
      src: `/api/media/${id}`,
      alt: '',
      width: 1200,
      height: 1600,
      temporary: false,
      source: 'local-brand',
    };
  }
  return MEDIA['catalog-placeholder'];
}

/** Pexels credits for the attribution list (photographer + source page). */
export function pexelsCredits(): (MediaAsset & { id: string })[] {
  return Object.entries(MEDIA)
    .filter(([, asset]) => asset.source === 'pexels')
    .map(([id, asset]) => ({ id, ...asset }));
}
