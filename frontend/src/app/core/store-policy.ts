export interface StorePolicy {
  freeShippingFrom: number;
  shippingFee: number;
  deliveryWindow: string;
  returnDays: number;
  returnShippingFee: number;
  /** "min–max". */
  refundWorkingDays: string;
  paymentHoldMinutes: number;
}

export interface MembershipPolicy {
  silverFrom: number;
  goldFrom: number;
  /** DD/MM. */
  reviewDay: string;
  welcomePercent: number;
  welcomeMinOrder: number;
  birthdayAmount: number;
  birthdayMinOrder: number;
  silverAmount: number;
  silverMinOrder: number;
  goldAmount: number;
  goldMinOrder: number;
}

/**
 * Built-in store policy: the starting value of `storeSettings()` (`core/store-settings.ts`), which
 * PDP, checkout, account and the policy pages read so the published policies and the flows never
 * disagree.
 */
export const STORE_POLICY: Readonly<StorePolicy> = {
  freeShippingFrom: 1000000,
  shippingFee: 30000,
  deliveryWindow: '2–4 ngày',
  /** Days after delivery during which a return can be requested. */
  returnDays: 30,
  /** Return shipping charged only when the reason is the shopper's own (fit, change of mind). */
  returnShippingFee: 30000,
  /** Working days to send a refund once a return is received or a paid order is cancelled. */
  refundWorkingDays: '1–3',
  /** Unpaid bank-transfer orders are held this long, then cancelled. */
  paymentHoldMinutes: 30,
};

/**
 * Built-in membership rules shown on the member benefits policy. Tiers themselves come from the
 * account API (`GET /account/membership`); the live values are `storeSettings().membership`.
 */
export const MEMBERSHIP_POLICY: Readonly<MembershipPolicy> = {
  /** Spend within the qualification period needed for each tier (VND). */
  silverFrom: 18000000,
  goldFrom: 40000000,
  /** Tiers are reviewed once a year on this day (DD/MM). */
  reviewDay: '31/12',
  welcomePercent: 15,
  welcomeMinOrder: 100000,
  birthdayAmount: 100000,
  birthdayMinOrder: 800000,
  silverAmount: 200000,
  silverMinOrder: 1500000,
  goldAmount: 300000,
  goldMinOrder: 2000000,
};
