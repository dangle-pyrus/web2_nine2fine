/**
 * Store policy shown on PDP, checkout, account and the policy pages, and used by the mock checkout.
 * Every page reads these values so the published policies and the flows never disagree; replace
 * them from the backend/CMS before launch.
 */
export const STORE_POLICY = {
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
} as const;

/**
 * Membership rules shown on the member benefits policy. Tiers themselves come from the account API
 * (`GET /account/membership`); keep these numbers equal to the backend thresholds.
 */
export const MEMBERSHIP_POLICY = {
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
} as const;
