import { getMedia } from '../../../media/media-manifest';

/** `AdminImageRef` of docs/api/openapi.yaml: `url` is null for images of the media manifest. */
export interface WireImageRef {
  id: string;
  url: string | null;
}

/**
 * One rule for every admin image (BR-INV-27): an uploaded image answers its own `url`; a library
 * image has `url: null` and is looked up in the media manifest. An unknown id falls back to the
 * placeholder through `getMedia`.
 */
export function adminImageUrl(ref: WireImageRef | null): string {
  if (!ref) return '';
  return ref.url ?? getMedia(ref.id).src;
}
