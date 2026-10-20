import type { Order } from '../../app/features/orders/order-models';
import { GOLD_SHIP_TO, MEMBER_SHIP_TO } from './seed-account-data';
import {
  at,
  DAY,
  demoTimeline,
  HOUR,
  line,
  MINUTE,
  orderId,
  PAY,
  price,
  ShipTo,
} from './seed-helpers';

/** Fictional order history. All dates are relative to "now" so the seed never looks stale. */

interface Draft extends Omit<Order, 'id' | 'pricing'> {
  pricing?: Order['pricing'];
  discount?: number;
  freeShipping?: boolean;
}

function order(sequence: number, draft: Draft): Order {
  const { discount, freeShipping, ...rest } = draft;
  const built: Order = {
    ...rest,
    id: orderId(draft.placedAt, sequence),
    pricing: draft.pricing ?? price(draft.items, { discount, freeShipping }),
    payment: { ...draft.payment },
  };
  return { ...built, timeline: demoTimeline(built) };
}

const LONG_SHIRT =
  'Nine-to-Fine Shirt – Phiên bản Holiday 2026, cổ đức, tay dài, cotton Oxford dệt mềm, phom rộng nhẹ';
const LONG_BLAZER =
  'The Everyday Blazer – Bản giới hạn hợp tác cùng nhà thiết kế khách mời, vải tweed pha len, lót lụa';

/**
 * 13 extra orders for demo@nine2fine.vn. Together with the 6 original fixtures every status has at
 * least 2 orders: pending 3, processing 2, shipping 3, delivering 2, completed 4, cancelled 3,
 * returned 2 (19 total).
 */
export function memberSeedOrders(): Order[] {
  const ship = MEMBER_SHIP_TO;
  const placed = {
    p1: at(-40 * MINUTE),
    p2: at(-21 * HOUR),
    pr1: at(-5 * HOUR),
    pr2: at(-26 * HOUR),
    s1: at(-2 * DAY - 6 * HOUR),
    s2: at(-3 * DAY - 2 * HOUR),
    d1: at(-4 * DAY),
    c1: at(-25 * DAY),
    c2: at(-48 * DAY),
    c3: at(-93 * DAY),
    x1: at(-6 * DAY),
    x2: at(-40 * DAY),
    r1: at(-55 * DAY),
  };
  return [
    // ----- Chờ thanh toán (bank transfer, due soon) -----
    order(201, {
      placedAt: placed.p1,
      status: 'pending-payment',
      paymentDueAt: at(23 * HOUR + 20 * MINUTE),
      items: [
        line('the-everyday-blazer', 'M', { colorIndex: 1 }),
        line('nine-to-fine-shirt', 'S', { quantity: 2 }),
        line('the-straight-trousers', 'M', { colorIndex: 1 }),
        line('off-duty-top', 'S', { colorIndex: 1 }),
        line('the-midi-skirt', 'M'),
      ],
      discount: 300000,
      shippingAddress: ship.home,
      payment: PAY.bankPending,
    }),
    order(202, {
      placedAt: placed.p2,
      status: 'pending-payment',
      paymentDueAt: at(3 * HOUR),
      items: [line('off-duty-top', 'M')],
      shippingAddress: ship.long,
      payment: PAY.bankPending,
    }),

    // ----- Đang xử lý (confirmed, not yet handed to the carrier) -----
    order(203, {
      placedAt: placed.pr1,
      status: 'processing',
      items: [line('weekend-shirt', 'L', { colorIndex: 1 })],
      shippingAddress: ship.office,
      payment: PAY.cod,
    }),
    order(204, {
      placedAt: placed.pr2,
      status: 'processing',
      items: [
        line('city-vest', 'M'),
        line('weekend-shirt', 'M'),
        line('the-straight-trousers', 'L', { colorIndex: 1 }),
      ],
      discount: 100000,
      shippingAddress: ship.gift,
      payment: PAY.master,
    }),

    // ----- Đang vận chuyển -----
    order(205, {
      placedAt: placed.s1,
      status: 'shipping',
      items: [line('nine-to-fine-shirt', 'M', { nameOverride: LONG_SHIRT })],
      freeShipping: true,
      shippingAddress: ship.danang,
      payment: PAY.bankPaid,
      delivery: { carrier: 'GHTK', trackingCode: 'GHTKS0000205', estimatedAt: at(2 * DAY) },
    }),
    order(206, {
      placedAt: placed.s2,
      status: 'shipping',
      items: [line('after-hours-dress', 'M', { colorIndex: 1 }), line('the-midi-skirt', 'S')],
      shippingAddress: ship.long,
      payment: PAY.cod,
      delivery: { carrier: 'Viettel Post', trackingCode: 'VTP000000206', estimatedAt: at(DAY) },
    }),

    // ----- Đang giao hàng -----
    order(207, {
      placedAt: placed.d1,
      status: 'delivering',
      items: [
        line('the-everyday-blazer', 'S', { nameOverride: LONG_BLAZER }),
        line('off-duty-top', 'S'),
      ],
      discount: 150000,
      shippingAddress: ship.office,
      payment: PAY.visa,
      delivery: { carrier: 'GHN', trackingCode: 'GHN000000207', estimatedAt: at(3 * HOUR) },
    }),

    // ----- Hoàn thành -----
    order(208, {
      placedAt: placed.c1,
      status: 'completed',
      items: [line('the-midi-skirt', 'M', { colorIndex: 1 })],
      shippingAddress: ship.home,
      payment: PAY.codPaid,
      delivery: {
        carrier: 'GHTK',
        trackingCode: 'GHTKS0000208',
        estimatedAt: at(-22 * DAY),
        deliveredAt: at(-22 * DAY - 3 * HOUR),
      },
    }),
    order(209, {
      placedAt: placed.c2,
      status: 'completed',
      items: [
        line('after-hours-dress', 'S'),
        line('the-everyday-blazer', 'M'),
        line('nine-to-fine-shirt', 'M', { colorIndex: 1, quantity: 3 }),
        line('the-straight-trousers', 'S'),
        line('city-vest', 'L', { colorIndex: 1 }),
      ],
      discount: 485000,
      shippingAddress: ship.office,
      payment: PAY.visa,
      delivery: {
        carrier: 'GHN',
        trackingCode: 'GHN000000209',
        estimatedAt: at(-45 * DAY),
        deliveredAt: at(-45 * DAY + 5 * HOUR),
      },
    }),
    order(210, {
      placedAt: placed.c3,
      status: 'completed',
      items: [line('off-duty-top', 'L', { colorIndex: 1, quantity: 2 })],
      freeShipping: true,
      shippingAddress: ship.gift,
      payment: PAY.bankPaid,
      delivery: {
        carrier: 'Viettel Post',
        trackingCode: 'VTP000000210',
        estimatedAt: at(-90 * DAY),
        deliveredAt: at(-89 * DAY),
      },
    }),

    // ----- Đã hủy -----
    order(211, {
      placedAt: placed.x1,
      status: 'cancelled',
      items: [line('city-vest', 'S'), line('weekend-shirt', 'S', { colorIndex: 1 })],
      shippingAddress: ship.home,
      // COD cancelled before delivery: nothing was paid, so there is no refund.
      payment: PAY.cod,
      cancelledBy: 'customer',
      cancelledAt: at(-6 * DAY + 3 * HOUR),
    }),
    order(212, {
      placedAt: placed.x2,
      status: 'cancelled',
      items: [line('after-hours-dress', 'L'), line('the-everyday-blazer', 'L', { colorIndex: 1 })],
      shippingAddress: ship.danang,
      payment: PAY.bankPaid,
      cancelledBy: 'shop',
      cancelledAt: at(-39 * DAY),
      refund: {
        amount: price([line('after-hours-dress', 'L'), line('the-everyday-blazer', 'L')]).total,
        destination: 'Tài khoản Ngân hàng Demo •••• 6789',
        reason: 'Sản phẩm tạm hết hàng tại kho, nine2fine đã hủy đơn và hoàn tiền.',
        expectedBy: at(-35 * DAY),
      },
    }),

    // ----- Trả hàng / Hoàn tiền (full return) -----
    order(213, {
      placedAt: placed.r1,
      status: 'returned',
      items: [line('the-straight-trousers', 'L')],
      shippingAddress: ship.home,
      payment: PAY.master,
      delivery: {
        carrier: 'GHN',
        trackingCode: 'GHN000000213',
        estimatedAt: at(-52 * DAY),
        deliveredAt: at(-52 * DAY),
      },
      refund: {
        amount: 690000,
        destination: 'Mastercard •••• 4444',
        reason: 'Màu sắc thực tế khác với hình ảnh trên website.',
        expectedBy: at(2 * DAY),
        items: 1,
      },
    }),
  ];
}

/** Five orders for gold.demo@nine2fine.vn (mostly completed, one on the way). */
export function goldSeedOrders(): Order[] {
  const ship: ShipTo = GOLD_SHIP_TO;
  return [
    order(301, {
      placedAt: at(-1 * DAY),
      status: 'delivering',
      items: [line('after-hours-dress', 'S', { colorIndex: 1 }), line('the-midi-skirt', 'S')],
      discount: 300000,
      shippingAddress: ship,
      payment: PAY.visa,
      delivery: { carrier: 'GHN', trackingCode: 'GHN000000301', estimatedAt: at(5 * HOUR) },
    }),
    ...[12, 30, 61, 120].map((daysAgo, index) =>
      order(302 + index, {
        placedAt: at(-daysAgo * DAY),
        status: 'completed',
        items: [
          line('the-everyday-blazer', 'S', { colorIndex: index % 2 }),
          line('nine-to-fine-shirt', 'S', { quantity: index + 1 }),
        ],
        shippingAddress: ship,
        payment: index % 2 ? PAY.bankPaid : PAY.visa,
        delivery: {
          carrier: 'GHN',
          trackingCode: `GHN000000${302 + index}`,
          estimatedAt: at(-(daysAgo - 2) * DAY),
          deliveredAt: at(-(daysAgo - 2) * DAY),
        },
      }),
    ),
  ];
}

/** Guest orders for /track-order: one per status, each with its own fictional contact. */
export interface GuestSeed {
  order: Order;
  contact: { email: string; phone: string };
}

export function guestSeedOrders(): GuestSeed[] {
  const guest = (name: string, phone: string, street: string): ShipTo => ({
    recipient: name,
    phone,
    street,
    ward: 'Phường Bến Thành',
    province: 'Thành phố Hồ Chí Minh',
  });
  const seeds: (Omit<Draft, 'shippingAddress'> & {
    id: string;
    name: string;
    phone: string;
    email: string;
  })[] = [
    {
      id: 'N2F261001101',
      name: 'Phạm Khách Một',
      phone: '0909000101',
      email: 'khach.cho.thanh.toan@example.com',
      placedAt: at(-3 * HOUR),
      status: 'pending-payment',
      paymentDueAt: at(21 * HOUR),
      items: [line('the-midi-skirt', 'S')],
      payment: PAY.bankPending,
    },
    {
      id: 'N2F261001102',
      name: 'Võ Khách Hai',
      phone: '0909000102',
      email: 'khach.dang.xu.ly@example.com',
      placedAt: at(-8 * HOUR),
      status: 'processing',
      items: [line('weekend-shirt', 'M'), line('city-vest', 'M')],
      payment: PAY.cod,
    },
    {
      id: 'N2F261001103',
      name: 'Đỗ Khách Ba',
      phone: '0909000103',
      email: 'khach.van.chuyen@example.com',
      placedAt: at(-2 * DAY),
      status: 'shipping',
      items: [line('nine-to-fine-shirt', 'L', { colorIndex: 1 })],
      payment: PAY.visa,
      delivery: { carrier: 'GHTK', trackingCode: 'GHTKS0000103', estimatedAt: at(2 * DAY) },
    },
    {
      id: 'N2F261001104',
      name: 'Bùi Khách Bốn',
      phone: '0909000104',
      email: 'khach.dang.giao@example.com',
      placedAt: at(-3 * DAY),
      status: 'delivering',
      items: [line('after-hours-dress', 'M'), line('off-duty-top', 'M')],
      payment: PAY.cod,
      delivery: { carrier: 'GHN', trackingCode: 'GHN000000104', estimatedAt: at(4 * HOUR) },
    },
    {
      id: 'N2F261001105',
      name: 'Hồ Khách Năm',
      phone: '0909000105',
      email: 'khach.hoan.thanh@example.com',
      placedAt: at(-15 * DAY),
      status: 'completed',
      items: [line('the-everyday-blazer', 'M'), line('the-straight-trousers', 'M')],
      discount: 100000,
      payment: PAY.bankPaid,
      delivery: {
        carrier: 'Viettel Post',
        trackingCode: 'VTP000000105',
        estimatedAt: at(-12 * DAY),
        deliveredAt: at(-12 * DAY - 2 * HOUR),
      },
    },
    {
      id: 'N2F261001106',
      name: 'Mai Khách Sáu',
      phone: '0909000106',
      email: 'khach.da.huy@example.com',
      placedAt: at(-9 * DAY),
      status: 'cancelled',
      items: [line('city-vest', 'L', { colorIndex: 1 })],
      payment: PAY.visa,
      cancelledBy: 'customer',
      cancelledAt: at(-9 * DAY + 2 * HOUR),
      refund: {
        amount: price([line('city-vest', 'L')]).total,
        destination: 'Visa •••• 4242',
        reason: 'Khách đổi ý, yêu cầu hủy trước khi giao.',
        expectedBy: at(DAY),
      },
    },
    {
      id: 'N2F261001107',
      name: 'Lý Khách Bảy',
      phone: '0909000107',
      email: 'khach.tra.hang@example.com',
      placedAt: at(-20 * DAY),
      status: 'returned',
      items: [line('off-duty-top', 'S', { quantity: 2 }), line('the-midi-skirt', 'M')],
      payment: PAY.master,
      delivery: {
        carrier: 'GHN',
        trackingCode: 'GHN000000107',
        estimatedAt: at(-17 * DAY),
        deliveredAt: at(-17 * DAY),
      },
      refund: {
        amount: 390000,
        destination: 'Mastercard •••• 4444',
        reason: 'Một sản phẩm bị lỗi đường may.',
        expectedBy: at(4 * DAY),
        items: 1,
      },
    },
  ];
  return seeds.map(({ id, name, phone, email, discount, freeShipping, ...draft }) => {
    const order: Order = {
      ...draft,
      id,
      pricing: price(draft.items, { discount, freeShipping }),
      shippingAddress: guest(name, phone, `${id.slice(-3)} Đường Demo`),
      payment: { ...draft.payment },
    };
    return { contact: { email, phone }, order: { ...order, timeline: demoTimeline(order) } };
  });
}
