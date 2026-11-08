import { CommercePolicy, MOCK_POLICY } from '../app/core/commerce-policy';
import { Availability, RefreshedLine } from '../app/features/checkout/checkout-models';
import { PRODUCTS } from './products';

/**
 * Switches for Playwright (mock build only), read from `sessionStorage` `n2f.mock.flags` at every
 * call so a test can change them with `page.evaluate`. They simulate what only a real backend
 * would do: a price change, a discontinued product, failures.
 */
export interface MockFlags {
  /** `variantId` -> price now (changes what quote / cart refresh report). */
  priceOverrides?: Record<string, number>;
  /** Variants the shop no longer sells. */
  discontinued?: string[];
  /** Quote and cart refresh fail with `unavailable`. */
  refreshFail?: boolean;
  /** Next `placeOrder` fails with this code once, then the flag clears itself. */
  placeError?:
    | 'price-changed'
    | 'voucher-changed'
    | 'stock-changed'
    | 'rate-limited'
    | 'unavailable'
    | 'idempotency-conflict'
    | 'possible-duplicate'
    | 'invalid-address';
  /** Every `checkVoucher` answers `429 rate-limited` (AC-VOU-11). */
  voucherLocked?: boolean;
  /** Signed-in shoppers use the mock server cart (`MockCartApi`) instead of the browser cart. */
  serverCart?: boolean;
  /** Mock server cart fails with `unavailable` (offline). */
  cartFail?: boolean;
  /** `GET /auth/me` answers as a guest: the server revoked the session behind the page's back. */
  sessionRevoked?: boolean;
}

const KEY = 'n2f.mock.flags';

export function mockFlags(): MockFlags {
  try {
    const value: unknown = JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? 'null');
    return value && typeof value === 'object' ? (value as MockFlags) : {};
  } catch {
    return {};
  }
}

/** Reads `placeError` and clears it so it fires once. */
export function takePlaceError(): MockFlags['placeError'] {
  const flags = mockFlags();
  const error = flags.placeError;
  if (error) {
    delete flags.placeError;
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(flags));
  }
  return error;
}

const CALLS_KEY = 'n2f.mock.calls';

/** Counts a mock request in `sessionStorage` `n2f.mock.calls` so a test can assert how many left. */
export function countMockCall(name: string): void {
  try {
    const storage = globalThis.sessionStorage;
    const calls = JSON.parse(storage?.getItem(CALLS_KEY) ?? '{}') as Record<string, number>;
    calls[name] = (calls[name] ?? 0) + 1;
    storage?.setItem(CALLS_KEY, JSON.stringify(calls));
  } catch {
    /* No storage: nothing counted. */
  }
}

export const mockPolicy = (): CommercePolicy => ({ ...MOCK_POLICY });

/** One line refreshed from the demo catalog at its live stock and (possibly overridden) price. */
export function refreshMockLine(variantId: string, requested: number): RefreshedLine {
  const flags = mockFlags();
  const product = PRODUCTS.find((candidate) =>
    candidate.variants.some((variant) => variant.id === variantId),
  );
  const variant = product?.variants.find((candidate) => candidate.id === variantId);
  if (!product || !variant || flags.discontinued?.includes(variantId)) {
    return {
      variantId,
      productId: '',
      slug: '',
      name: '',
      mediaId: '',
      color: '',
      size: '',
      unitPrice: 0,
      requestedQuantity: requested,
      maxQuantity: 0,
      effectiveQuantity: 0,
      availability: 'discontinued',
      inventory: 0,
    };
  }
  const max = Math.min(MOCK_POLICY.maxPerVariant, variant.inventory);
  const effective = Math.min(requested, max);
  const availability: Availability =
    variant.inventory === 0 ? 'out-of-stock' : variant.inventory <= 5 ? 'low-stock' : 'available';
  return {
    variantId,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    mediaId: product.mediaId,
    color: variant.color.name,
    size: variant.size,
    unitPrice: flags.priceOverrides?.[variantId] ?? product.price,
    compareAtPrice: product.compareAtPrice,
    requestedQuantity: requested,
    maxQuantity: max,
    effectiveQuantity: effective,
    availability,
    inventory: variant.inventory,
    limitedBy:
      effective < requested
        ? variant.inventory < MOCK_POLICY.maxPerVariant
          ? 'stock'
          : 'per-variant-limit'
        : undefined,
  };
}
