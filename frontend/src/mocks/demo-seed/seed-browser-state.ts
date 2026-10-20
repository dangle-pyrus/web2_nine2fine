import type { CartLine } from '../../app/features/cart/cart-state';
import { PRODUCTS } from '../products';

/** Same keys and schema as `CartState` (`n2f.cart.v1`) and `WishlistState` (`n2f.wishlist.v1`). */
const CART_KEY = 'n2f.cart.v1';
const WISHLIST_KEY = 'n2f.wishlist.v1';

function cartLine(slug: string, colorIndex: number, size: string, quantity: number): CartLine {
  const product = PRODUCTS.find((candidate) => candidate.slug === slug)!;
  const colors = [...new Set(product.variants.map((variant) => variant.color.name))];
  const variant = product.variants.find(
    (candidate) => candidate.color.name === colors[colorIndex] && candidate.size === size,
  )!;
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    mediaId: product.mediaId,
    variantId: variant.id,
    color: variant.color.name,
    size: variant.size,
    price: product.price,
    stock: variant.inventory,
    quantity: Math.min(quantity, variant.inventory),
  };
}

/**
 * Prefills the cart (4 lines) and wishlist (5 products) only when the browser has never stored
 * them (key missing). An emptied cart is stored as `[]`, so it is never refilled. Clear the site's
 * local storage to get the demo items back.
 */
export function writeDemoBrowserState(): void {
  try {
    if (localStorage.getItem(CART_KEY) === null) {
      const lines: CartLine[] = [
        cartLine('the-everyday-blazer', 0, 'M', 1),
        cartLine('after-hours-dress', 0, 'S', 1),
        cartLine('off-duty-top', 0, 'M', 2),
        cartLine('the-straight-trousers', 0, 'L', 1),
      ];
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    }
    if (localStorage.getItem(WISHLIST_KEY) === null) {
      const ids = [
        'after-hours-dress',
        'the-midi-skirt',
        'city-vest',
        'off-duty-top',
        'weekend-shirt',
      ]
        .map((slug) => PRODUCTS.find((product) => product.slug === slug)?.id)
        .filter((id): id is string => !!id);
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
    }
  } catch {
    /* Storage unavailable (private mode): the app simply starts empty. */
  }
}
