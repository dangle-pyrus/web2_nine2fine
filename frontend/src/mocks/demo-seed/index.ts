import { apiConfig } from '../../app/core/api-config';
import type { MockAccountStore } from '../mock-account-store';
import {
  EMPTY_ACCOUNT,
  GOLD_ACCOUNT,
  GOLD_ADDRESSES,
  goldMembership,
  goldVouchers,
  MEMBER_EXTRA_ADDRESSES,
  memberExtraVouchers,
  memberSeedMembership,
} from './seed-account-data';
import { writeDemoBrowserState } from './seed-browser-state';
import { goldSeedOrders, guestSeedOrders, memberSeedOrders } from './seed-orders';
import { withDemoTimeline } from './seed-helpers';

/**
 * DEMO SEED — fictional content so the UI can be reviewed with realistic data.
 * Set to `false` (or delete this folder + the import lines listed in README.md) to restore the
 * original mock fixtures. See README.md in this folder.
 */
export const DEMO_SEED_ENABLED = true;

/** Also prefill cart + wishlist in localStorage (only when those keys do not exist yet). */
export const DEMO_SEED_BROWSER_STATE = true;

const MEMBER_ID = 'demo-member';
const MEMBER_EMAIL = 'demo@nine2fine.vn';

/** Merges the seed into the in-memory mock store. Called once from `MockAccountStore`. */
export function applyDemoSeed(store: MockAccountStore): void {
  if (!DEMO_SEED_ENABLED) return;

  const member = store.dataFor(MEMBER_ID);
  member.addresses.push(...MEMBER_EXTRA_ADDRESSES.map((address) => ({ ...address })));
  member.vouchers.push(...memberExtraVouchers());
  member.membership = memberSeedMembership();
  for (const order of memberSeedOrders()) {
    store.addOrder(order, { email: MEMBER_EMAIL, phone: order.shippingAddress.phone }, MEMBER_ID);
  }

  store.accounts.set(GOLD_ACCOUNT.email, { ...GOLD_ACCOUNT });
  const gold = store.dataFor(GOLD_ACCOUNT.id);
  gold.addresses = GOLD_ADDRESSES.map((address) => ({ ...address }));
  gold.vouchers = goldVouchers();
  gold.membership = goldMembership();
  for (const order of goldSeedOrders()) {
    store.addOrder(
      order,
      { email: GOLD_ACCOUNT.email, phone: order.shippingAddress.phone },
      GOLD_ACCOUNT.id,
    );
  }

  // Signed-in account with no orders/addresses/vouchers: empty states without registering.
  store.accounts.set(EMPTY_ACCOUNT.email, { ...EMPTY_ACCOUNT });

  for (const { order, contact } of guestSeedOrders()) store.addOrder(order, contact, null);

  // Order history for the original fixtures too, so every demo order shows a full timeline.
  member.orders = member.orders.map(withDemoTimeline);
}

interface SeedVoucherRule {
  label: string;
  minSubtotal: number;
  discount: (subtotal: number) => number;
  shipping?: boolean;
}

/** Checkout rules for the seeded voucher codes, so they can be applied in the mock checkout. */
export const DEMO_SEED_VOUCHER_RULES: Readonly<Record<string, SeedVoucherRule>> = DEMO_SEED_ENABLED
  ? {
      N2FAUTUMN20: {
        label: 'Giảm 20% BST Thu Đông',
        minSubtotal: 1000000,
        discount: (subtotal) => Math.min(300000, Math.round((subtotal * 0.2) / 1000) * 1000),
      },
      N2FSHIPTODAY: {
        label: 'Miễn phí vận chuyển hôm nay',
        minSubtotal: 0,
        discount: () => 0,
        shipping: true,
      },
      N2FSILVER200: {
        label: 'Giảm 200K ưu đãi hạng Silver',
        minSubtotal: 1500000,
        discount: () => 200000,
      },
      N2FGOLD300: {
        label: 'Giảm 300K quà tặng hạng Gold',
        minSubtotal: 2000000,
        discount: () => 300000,
      },
    }
  : {};

/** Called from `main.ts` before bootstrap so `CartState`/`WishlistState` read the seeded values. */
export function seedDemoBrowserState(): void {
  if (DEMO_SEED_ENABLED && DEMO_SEED_BROWSER_STATE && apiConfig.mode === 'mock') {
    writeDemoBrowserState();
  }
}
