import { AuthUser } from '../app/features/auth/data-access/auth-api';

/** Demo-only values for the mock adapter; never real customer data or credentials. */
export const DEMO_VERIFICATION_CODE = '12345678';

export interface MockAccount extends AuthUser {
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
];
