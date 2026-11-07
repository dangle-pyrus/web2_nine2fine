import { AuthRole, AuthUser } from '../app/features/auth/data-access/auth-api';

/** Demo-only values for the mock adapter; never real customer data or credentials. */
export const DEMO_VERIFICATION_CODE = '12345678';

export interface MockAccount extends Omit<AuthUser, 'role'> {
  /** Defaults to `member`; staff sign in through the admin mock (`src/mocks/admin`). */
  role?: AuthRole;
  /** Disabled accounts answer `account-disabled` once the code or password is right. */
  disabled?: boolean;
  password: string | null;
  birthDate: string | null;
  phone: string | null;
}

export const MOCK_ACCOUNTS: readonly MockAccount[] = [
  {
    id: 'demo-member',
    email: 'demo@nine2fine.vn',
    firstName: 'Minh',
    lastName: 'Nguyễn',
    password: 'Nine2fine1',
    birthDate: '2003-10-02',
    phone: '0901234567',
  },
  {
    id: 'demo-staff',
    email: 'staff.shopper@nine2fine.vn',
    firstName: 'Hà',
    lastName: 'Trần',
    role: 'staff',
    password: 'Nine2fine1',
    birthDate: null,
    phone: null,
  },
  {
    id: 'demo-disabled',
    email: 'locked@nine2fine.vn',
    firstName: 'Khoa',
    lastName: 'Trần',
    password: 'Nine2fine1',
    birthDate: null,
    phone: null,
    disabled: true,
  },
];

/** Mock-only trigger emails: the first answers `rate-limited` on lookup, the second `unavailable`. */
export const MOCK_RATE_LIMITED_EMAIL = 'ratelimit@example.com';
export const MOCK_OFFLINE_EMAIL = 'offline@example.com';
/** Looks unregistered, but registering it answers `email-registered` (an account appeared meanwhile). */
export const MOCK_RACE_EMAIL = 'race@example.com';
