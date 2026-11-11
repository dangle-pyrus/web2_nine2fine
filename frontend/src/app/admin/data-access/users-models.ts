/**
 * Admin customers and staff contract (Slice 7, docs/api/openapi.yaml tags `admin-customers` and
 * `admin-staff`, locked 2026-11-11). Names and shapes are the contract's; the HTTP adapter and the
 * mock both return exactly these. Dates are ISO 8601, money is an integer number of VND.
 */
import type { DeskOrderSummary } from './order-desk-models';

/** Rank by this calendar year's spend (BR-ACC-15): `bronze` is shown as "Đồng". */
export type UserTier = 'bronze' | 'silver' | 'gold';
export type CustomerView = 'all' | 'blocked';
export type CustomerSort = 'lastOrderAt' | 'totalSpent' | 'orderCount' | 'name';
export type AccountRole = 'staff' | 'admin';

export interface CustomerRow {
  id: string;
  name: string;
  /** Staff receive it already masked by the server (`mi***@gmail.com`); the client never masks. */
  email: string;
  phone: string | null;
  /** True when the caller is staff: the server hid part of `email` and `phone`. */
  contactMasked: boolean;
  tier: UserTier;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  status: 'active' | 'blocked';
}

export interface CustomerPage {
  items: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  /** Per tab, for the same `q` and `tier` (not `view`). */
  counts: { all: number; blocked: number };
}

export interface CustomerAddress {
  recipient: string;
  phone: string;
  line: string;
  isDefault: boolean;
}

export interface CustomerDetail extends CustomerRow {
  createdAt: string;
  marketingOptIn: boolean;
  spentThisYear: number;
  /** Admin only: absent (not null) for staff. */
  birthDate?: string | null;
  /** Admin only: absent for staff. */
  addresses?: CustomerAddress[];
  /** Up to 10, newest first. */
  recentOrders: DeskOrderSummary[];
}

export interface CustomerListQuery {
  q: string;
  view: CustomerView;
  /** `''` = every tier. */
  tier: UserTier | '';
  sort: CustomerSort;
  page: number;
  limit: number;
}

export interface CustomerOrdersPage {
  items: DeskOrderSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  status: 'active' | 'disabled';
  /** False: the account has no password yet ("Chờ đặt mật khẩu"). */
  passwordSet: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface StaffCreateInput {
  name: string;
  email: string;
  role: AccountRole;
}

export type AccountEventAction = 'staff-created' | 'locked' | 'unlocked' | 'role-changed';

export interface AccountEvent {
  id: string;
  at: string;
  action: AccountEventAction;
  actor: { id: string | null; name: string; role: AccountRole };
  target: { id: string | null; email: string; name: string; role: 'member' | AccountRole };
  roleBefore: AccountRole | null;
  roleAfter: AccountRole | null;
  /** Empty when no reason was given. */
  reason: string;
  sessionsRevoked: number;
}
