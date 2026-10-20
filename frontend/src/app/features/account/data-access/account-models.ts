export type MembershipTier = 'bronze' | 'silver' | 'gold';

export const TIER_LABEL: Record<MembershipTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export interface AccountProfile {
  email: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD). */
  birthDate: string | null;
  phone: string | null;
  hasPassword: boolean;
}

export type ProfileUpdate = Partial<Pick<AccountProfile, 'birthDate' | 'phone'>>;

export interface Membership {
  tier: MembershipTier;
  /** Integer VND spent in the current qualification period. */
  spent: number;
  /** Spend needed for the next tier; null at the top tier. */
  nextTierAt: number | null;
  /** ISO date when the tier is re-evaluated. */
  reviewDate: string;
}

export interface Voucher {
  id: string;
  code: string;
  headline: string;
  subline: string;
  conditions: string;
  /** ISO date. */
  expiresAt: string;
}

export interface Location {
  code: string;
  name: string;
}

export interface Address {
  id: string;
  recipient: string;
  phone: string;
  province: Location;
  ward: Location;
  street: string;
  isDefault: boolean;
  isReturn: boolean;
}

export interface AddressInput {
  recipient: string;
  phone: string;
  provinceCode: string;
  wardCode: string;
  street: string;
  isDefault: boolean;
  isReturn: boolean;
}
