import { canSeeContact } from '../../config/assumptions';
import { staffDisplayName } from '../order/order-event';

/** Che dữ liệu liên hệ ở máy chủ (BR-USR-11). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  const local = [...email.slice(0, at)];
  const keep = local.length >= 3 ? 2 : 1;
  return `${local.slice(0, keep).join('')}***${email.slice(at)}`;
}

export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('84')) d = `0${d.slice(2)}`;
  if (d === '') return '***';
  return d.length >= 8 ? `${d.slice(0, 4)} *** ${d.slice(-3)}` : `*** ${d.slice(-2)}`;
}

export interface CustomerRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
  created_at: Date;
  marketing_opt_in: boolean;
  date_of_birth: Date | null;
  order_count: number;
  total_spent: bigint | number;
  last_order_at: Date | null;
  year_spent: bigint | number;
  tier: 'bronze' | 'silver' | 'gold';
}

export function toCustomerSummary(r: CustomerRow, role: string) {
  const full = canSeeContact(role);
  return {
    id: r.user_id,
    name: staffDisplayName({ firstName: r.first_name, lastName: r.last_name }),
    email: full ? r.email : maskEmail(r.email),
    phone: full ? r.phone_number : maskPhone(r.phone_number),
    contactMasked: !full,
    tier: r.tier,
    orderCount: Number(r.order_count),
    totalSpent: Number(r.total_spent),
    lastOrderAt: r.last_order_at ? r.last_order_at.toISOString() : null,
    status: r.is_active ? ('active' as const) : ('blocked' as const),
  };
}

export interface CustomerAddressDto {
  recipient: string;
  phone: string;
  line: string;
  isDefault: boolean;
}

/** Hai nhánh theo vai trò: staff KHÔNG có khoá `birthDate` / `addresses` (không phải `null`). */
export function toCustomerDetail(r: CustomerRow, role: string, recentOrders: unknown[], addresses: CustomerAddressDto[]) {
  const base = {
    ...toCustomerSummary(r, role),
    createdAt: r.created_at.toISOString(),
    marketingOptIn: r.marketing_opt_in,
    spentThisYear: Number(r.year_spent),
    recentOrders,
  };
  if (!canSeeContact(role)) return base;
  return { ...base, birthDate: r.date_of_birth ? r.date_of_birth.toISOString().slice(0, 10) : null, addresses };
}
