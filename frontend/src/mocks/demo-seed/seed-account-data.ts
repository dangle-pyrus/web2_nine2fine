import type {
  Address,
  Membership,
  Voucher,
} from '../../app/features/account/data-access/account-models';
import type { MockAccount } from '../accounts';
import { PROVINCES, WARDS } from '../locations';
import { dateIn, ShipTo } from './seed-helpers';

/** Fictional people, phones (09xx000xxx) and addresses for the demo seed. */
const province = (code: string) => PROVINCES.find((candidate) => candidate.code === code)!;
const ward = (provinceCode: string, wardCode: string) =>
  WARDS[provinceCode].find((candidate) => candidate.code === wardCode)!;

function toShipTo(address: Address): ShipTo {
  return {
    recipient: address.recipient,
    phone: address.phone,
    street: address.street,
    ward: address.ward.name,
    province: address.province.name,
  };
}

// ---------- demo@nine2fine.vn (added on top of the original fixtures) ----------

/** Appended after the 3 original addresses (`account-fixtures.ts`), which keep the default. */
export const MEMBER_EXTRA_ADDRESSES: Address[] = [
  {
    id: 'seed-addr-long',
    recipient: 'Nguyễn Hoàng Minh Châu (nhận hộ: chị Lan – lễ tân)',
    phone: '0909000123',
    province: province('79'),
    ward: ward('79', '79-tan-dinh'),
    street:
      'Phòng 1208, Tầng 12, Tòa nhà Demo Tower Block B, Số 123/45/6 Đường Hai Bà Trưng nối dài, gần ngã tư có quán cà phê góc, gọi trước 15 phút khi giao',
    isDefault: false,
    isReturn: false,
  },
  {
    id: 'seed-addr-danang',
    recipient: 'Nguyễn Minh',
    phone: '0909000124',
    province: province('48'),
    ward: ward('48', '48-son-tra'),
    street: '88 Võ Văn Kiệt (nhà nghỉ cuối tuần)',
    isDefault: false,
    isReturn: false,
  },
];

export const MEMBER_SHIP_TO = {
  home: {
    recipient: 'Nguyễn Minh',
    phone: '0901234567',
    street: 'Ký túc xá Khu B, Đường Tô Vĩnh Diện',
    ward: 'Phường Đông Hòa',
    province: 'Thành phố Hồ Chí Minh',
  },
  office: {
    recipient: 'Nguyễn Minh',
    phone: '0901234567',
    street: 'Tầng 8, 12 Nguyễn Huệ',
    ward: 'Phường Bến Thành',
    province: 'Thành phố Hồ Chí Minh',
  },
  gift: {
    recipient: 'Trần An',
    phone: '0912345678',
    street: '25 Trần Thái Tông',
    ward: 'Phường Cầu Giấy',
    province: 'Thành phố Hà Nội',
  },
  long: toShipTo(MEMBER_EXTRA_ADDRESSES[0]),
  danang: toShipTo(MEMBER_EXTRA_ADDRESSES[1]),
} satisfies Record<string, ShipTo>;

/**
 * Appended after the 3 original vouchers. The Voucher model has no "used/expired" state, so only
 * active vouchers are seeded (one expires today, one in 2 days to show near-expiry dates).
 */
export function memberExtraVouchers(): Voucher[] {
  return [
    {
      id: 'seed-v-autumn',
      code: 'N2FAUTUMN20',
      headline: 'GIẢM 20%',
      subline: 'BST Thu Đông – sắp hết hạn',
      conditions: 'Áp dụng cho đơn từ 1.000K, giảm tối đa 300K. Chỉ còn 2 ngày.',
      expiresAt: dateIn(2),
    },
    {
      id: 'seed-v-today',
      code: 'N2FSHIPTODAY',
      headline: 'FREESHIP',
      subline: 'hết hạn hôm nay',
      conditions: 'Miễn phí vận chuyển cho mọi đơn hàng, hết hạn cuối ngày hôm nay.',
      expiresAt: dateIn(0),
    },
    {
      id: 'seed-v-silver',
      code: 'N2FSILVER200',
      headline: 'GIẢM 200K',
      subline: 'ưu đãi riêng hạng Silver',
      conditions:
        'Áp dụng cho đơn hàng từ 1.500K khi đăng nhập tài khoản hạng Silver trở lên. Không áp dụng đồng thời với mã giảm giá khác, không áp dụng cho sản phẩm đang giảm giá và thẻ quà tặng. Mỗi tài khoản dùng một lần.',
      expiresAt: dateIn(45),
    },
  ];
}

/** Silver tier (bronze stays visible on any new account, gold on the second seeded account). */
export function memberSeedMembership(): Membership {
  return { tier: 'silver', spent: 23450000, nextTierAt: 40000000, reviewDate: dateIn(81) };
}

// ---------- new.demo@nine2fine.vn (empty Bronze member, for empty states) ----------

export const EMPTY_ACCOUNT: MockAccount = {
  id: 'demo-empty',
  email: 'new.demo@nine2fine.vn',
  firstName: 'An',
  lastName: 'Phạm',
  password: 'Nine2fine1',
  birthDate: '2004-06-12',
  phone: '0909000400',
};

// ---------- gold.demo@nine2fine.vn (second seeded account) ----------

export const GOLD_ACCOUNT: MockAccount = {
  id: 'demo-gold',
  email: 'gold.demo@nine2fine.vn',
  firstName: 'Thảo',
  lastName: 'Lê',
  password: 'Nine2fine1',
  birthDate: '1995-03-18',
  phone: '0909000300',
};

export const GOLD_ADDRESSES: Address[] = [
  {
    id: 'seed-gold-home',
    recipient: 'Lê Thảo',
    phone: '0909000300',
    province: province('01'),
    ward: ward('01', '01-hoan-kiem'),
    street: '9 Phố Demo, ngõ 12',
    isDefault: true,
    isReturn: true,
  },
  {
    id: 'seed-gold-office',
    recipient: 'Lê Thảo',
    phone: '0909000300',
    province: province('01'),
    ward: ward('01', '01-ba-dinh'),
    street: 'Tầng 5, Tòa nhà Demo Office, 1 Đường Mẫu',
    isDefault: false,
    isReturn: false,
  },
];

export const GOLD_SHIP_TO = toShipTo(GOLD_ADDRESSES[0]);

export function goldVouchers(): Voucher[] {
  return [
    {
      id: 'seed-gold-v1',
      code: 'N2FGOLD300',
      headline: 'GIẢM 300K',
      subline: 'quà tặng hạng Gold',
      conditions: 'Áp dụng cho đơn hàng từ 2.000K.',
      expiresAt: dateIn(60),
    },
    {
      id: 'seed-gold-v2',
      code: 'N2FFREESHIP',
      headline: 'FREESHIP',
      subline: 'mọi đơn hàng',
      conditions: 'Miễn phí vận chuyển tối đa 30K cho đơn từ 300K.',
      expiresAt: dateIn(30),
    },
  ];
}

export function goldMembership(): Membership {
  return { tier: 'gold', spent: 52800000, nextTierAt: null, reviewDate: dateIn(81) };
}
