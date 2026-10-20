import { Address, Membership, Voucher } from '../app/features/account/data-access/account-models';
import { Order, OrderItem, OrderPricing } from '../app/features/orders/order-models';
import { PRODUCTS } from './products';
import { PROVINCES, WARDS } from './locations';

/** Fictional demo data for the mock account adapter. Not real customers, orders or prices. */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function item(slug: string, size: string, quantity = 1, compareAtPrice?: number): OrderItem {
  const product = PRODUCTS.find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`Unknown fixture product ${slug}`);
  return {
    productSlug: product.slug,
    name: product.name,
    color: product.variants[0].color.name,
    size,
    quantity,
    unitPrice: product.price,
    compareAtPrice: compareAtPrice ?? product.compareAtPrice,
    mediaId: product.mediaId,
  };
}

function pricing(items: OrderItem[], discount = 0, shippingFee = 30000): OrderPricing {
  const subtotal = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shippingDiscount = shippingFee;
  return {
    subtotal,
    discount,
    shippingFee,
    shippingDiscount,
    total: subtotal - discount + shippingFee - shippingDiscount,
  };
}

const hcm = PROVINCES.find((province) => province.code === '79')!;
const hanoi = PROVINCES.find((province) => province.code === '01')!;
const ward = (provinceCode: string, index: number) => WARDS[provinceCode][index];

export function demoAddresses(): Address[] {
  return [
    {
      id: 'addr-1',
      recipient: 'Nguyễn Minh',
      phone: '0901234567',
      province: hcm,
      ward: ward('79', 1),
      street: 'Ký túc xá Khu B, Đường Tô Vĩnh Diện',
      isDefault: true,
      isReturn: false,
    },
    {
      id: 'addr-2',
      recipient: 'Nguyễn Minh',
      phone: '0901234567',
      province: hcm,
      ward: ward('79', 0),
      street: 'Tầng 8, 12 Nguyễn Huệ',
      isDefault: false,
      isReturn: true,
    },
    {
      id: 'addr-3',
      recipient: 'Trần An',
      phone: '0912345678',
      province: hanoi,
      ward: ward('01', 1),
      street: '25 Trần Thái Tông',
      isDefault: false,
      isReturn: false,
    },
  ];
}

export function demoVouchers(): Voucher[] {
  return [
    {
      id: 'v-first',
      code: 'N2FWELCOME15',
      headline: 'GIẢM 15%',
      subline: 'đơn hàng đầu tiên',
      conditions: 'Áp dụng cho đơn hàng đầu tiên có giá trị tối thiểu 100K.',
      expiresAt: '2026-12-31',
    },
    {
      id: 'v-birthday',
      code: 'N2FBDAY100',
      headline: 'GIẢM 100K',
      subline: 'tháng sinh nhật',
      conditions: 'Áp dụng cho đơn hàng từ 800K trong tháng sinh nhật của bạn.',
      expiresAt: '2026-10-31',
    },
    {
      id: 'v-ship',
      code: 'N2FFREESHIP',
      headline: 'FREESHIP',
      subline: 'mọi đơn hàng',
      conditions: 'Miễn phí vận chuyển tối đa 30K cho đơn từ 300K.',
      expiresAt: '2026-11-30',
    },
  ];
}

export function demoMembership(): Membership {
  return { tier: 'bronze', spent: 16053000, nextTierAt: 18000000, reviewDate: '2026-12-31' };
}

export function newMemberMembership(): Membership {
  return { tier: 'bronze', spent: 0, nextTierAt: 18000000, reviewDate: '2026-12-31' };
}

const shipTo = {
  recipient: 'Nguyễn Minh',
  phone: '0901234567',
  street: 'Ký túc xá Khu B, Đường Tô Vĩnh Diện',
  ward: 'Phường Đông Hòa',
  province: 'Thành phố Hồ Chí Minh',
};

export function demoOrders(): Order[] {
  const pendingItems = [
    item('the-everyday-blazer', 'M', 1, 1490000),
    item('the-straight-trousers', 'S'),
  ];
  const shippingItems = [item('nine-to-fine-shirt', 'M'), item('the-midi-skirt', 'S')];
  const deliveringItems = [item('after-hours-dress', 'S')];
  const completedItems = [item('off-duty-top', 'M', 2), item('city-vest', 'M')];
  const cancelledItems = [item('weekend-shirt', 'L')];
  const returnedItems = [item('the-everyday-blazer', 'S'), item('nine-to-fine-shirt', 'S')];
  return [
    {
      id: 'N2F261002001',
      placedAt: at(-2 * HOUR),
      status: 'pending-payment',
      paymentDueAt: at(22 * HOUR),
      items: pendingItems,
      pricing: pricing(pendingItems, 150000),
      shippingAddress: shipTo,
      payment: { method: 'bank-transfer', label: 'Chưa thanh toán · Chuyển khoản', paid: false },
    },
    {
      id: 'N2F260930004',
      placedAt: at(-2 * DAY),
      status: 'shipping',
      items: shippingItems,
      pricing: pricing(shippingItems),
      shippingAddress: shipTo,
      payment: { method: 'card', label: 'Visa •••• 4242', paid: true },
      delivery: { carrier: 'GHN', trackingCode: 'GHN812381901', estimatedAt: at(1 * DAY) },
    },
    {
      id: 'N2F260929002',
      placedAt: at(-3 * DAY),
      status: 'delivering',
      items: deliveringItems,
      pricing: pricing(deliveringItems),
      shippingAddress: shipTo,
      payment: { method: 'cod', label: 'Thanh toán khi nhận hàng (COD)', paid: false },
      delivery: { carrier: 'GHN', trackingCode: 'GHN812380077', estimatedAt: at(6 * HOUR) },
    },
    {
      id: 'N2F260920003',
      placedAt: at(-12 * DAY),
      status: 'completed',
      items: completedItems,
      pricing: pricing(completedItems, 100000),
      shippingAddress: shipTo,
      payment: { method: 'card', label: 'Visa •••• 4242', paid: true },
      delivery: {
        carrier: 'GHN',
        trackingCode: 'GHN812300112',
        estimatedAt: at(-10 * DAY),
        deliveredAt: at(-10 * DAY + 2 * HOUR),
      },
    },
    {
      id: 'N2F260915001',
      placedAt: at(-17 * DAY),
      status: 'cancelled',
      items: cancelledItems,
      pricing: pricing(cancelledItems),
      shippingAddress: shipTo,
      payment: { method: 'card', label: 'Visa •••• 4242', paid: true },
      refund: {
        amount: pricing(cancelledItems).total,
        destination: 'Visa •••• 4242',
        reason: 'Bạn đã yêu cầu hủy đơn.',
        expectedBy: at(3 * DAY),
      },
    },
    {
      id: 'N2F260901006',
      placedAt: at(-31 * DAY),
      status: 'returned',
      items: returnedItems,
      pricing: pricing(returnedItems),
      shippingAddress: shipTo,
      payment: { method: 'card', label: 'Visa •••• 4242', paid: true },
      refund: {
        amount: returnedItems[1].unitPrice,
        destination: 'Visa •••• 4242',
        reason: 'Sản phẩm không vừa kích cỡ.',
        expectedBy: at(5 * DAY),
        items: 1,
      },
    },
  ];
}

/** Guest order for the /track-order demo (fictional contact details). */
export function demoGuestOrders(): { order: Order; contact: { email: string; phone: string } }[] {
  const items = [item('the-midi-skirt', 'M'), item('off-duty-top', 'S')];
  return [
    {
      contact: { email: 'khach.demo@example.com', phone: '0909000111' },
      order: {
        id: 'N2F260928010',
        placedAt: at(-4 * DAY),
        status: 'shipping',
        items,
        pricing: pricing(items),
        shippingAddress: {
          recipient: 'Lê Hà',
          phone: '0909000111',
          street: '45 Lê Lợi',
          ward: 'Phường Bến Thành',
          province: 'Thành phố Hồ Chí Minh',
        },
        payment: { method: 'cod', label: 'Thanh toán khi nhận hàng (COD)', paid: false },
        delivery: { carrier: 'GHN', trackingCode: 'GHN812399910', estimatedAt: at(1 * DAY) },
      },
    },
  ];
}
