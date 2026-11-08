import type {
  DeskBucket,
  DeskEventKind,
  DeskOrder,
  DeskOrderLine,
  DeskPaymentMethod,
  DeskStaffRef,
  DeskTimelineEntry,
} from '../../app/admin/data-access/order-desk-models';

/** Deterministic orders for the contract mock: 45 orders, every tab filled (e2e AC-ADM-05..12). */
const STAFF: DeskStaffRef = { name: 'Trần Thu Hằng', role: 'staff' };
const ADMIN: DeskStaffRef = { name: 'Lê Quản Trị', role: 'admin' };

const CATALOG: Omit<DeskOrderLine, 'quantity' | 'lineDiscount'>[] = [
  {
    variantId: '11111111-1111-4111-8111-111111111111',
    productSlug: 'ao-blazer-dang-suong',
    name: 'Áo blazer dáng suông',
    color: 'Đen',
    size: 'S',
    sku: 'BLZ-DEN-S',
    unitPrice: 1290000,
    mediaId: 'm-blazer',
  },
  {
    variantId: '22222222-2222-4222-8222-222222222222',
    productSlug: 'ao-thun-cotton',
    name: 'Áo thun cotton basic',
    color: 'Trắng',
    size: 'M',
    sku: 'TEE-TRG-M',
    unitPrice: 290000,
    mediaId: 'm-tee',
  },
  {
    variantId: '33333333-3333-4333-8333-333333333333',
    productSlug: 'quan-tay-ong-dung',
    name: 'Quần tây ống đứng',
    color: 'Xám',
    size: 'L',
    sku: 'PNT-XAM-L',
    unitPrice: 690000,
    mediaId: 'm-pants',
  },
];

const NAMES = [
  'Lê Minh Châu',
  'Phạm Quốc Bảo',
  'Võ Thu Hà',
  'Đặng Gia Huy',
  'Bùi Khánh Linh',
  'Hoàng Đức Anh',
  'Ngô Mai Phương',
  'Đỗ Thành Long',
  'Dương Ngọc Trâm',
  'Vũ Hải Đăng',
];

const hoursAgo = (hours: number): string =>
  new Date(Date.parse('2026-11-06T22:00:00+07:00') - hours * 3600_000).toISOString();
const plus = (iso: string, minutes: number): string =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

interface Spec {
  id: string;
  placedAt: string;
  name: string;
  phone: string;
  email: string;
  method: DeskPaymentMethod;
  bucket: DeskBucket;
  lines?: [number, number][];
  /** Number of "không liên lạc được" calls (to-confirm). */
  calls?: number;
  note?: string;
  /** In-transit COD order with the whole history: calls, internal note, confirmation, hand-over. */
  rich?: boolean;
}

function lineOf(index: number, quantity: number): DeskOrderLine {
  return { ...CATALOG[index], quantity, lineDiscount: 0 };
}

function entry(
  order: Pick<DeskOrder, 'status' | 'paymentStatus'>,
  at: string,
  kind: DeskEventKind,
  title: string,
  options: Partial<DeskTimelineEntry> & { staff?: DeskStaffRef } = {},
): DeskTimelineEntry {
  const { staff, ...rest } = options;
  return {
    at,
    kind,
    fromStatus: null,
    toStatus: order.status,
    paymentStatus: order.paymentStatus,
    actor: staff
      ? { type: 'staff', name: staff.name, role: staff.role }
      : { type: kind === 'placed' ? 'customer' : 'system' },
    title,
    ...rest,
  };
}

function build(spec: Spec): DeskOrder {
  const lines = (spec.lines ?? [[1, 1]]).map(([item, quantity]) => lineOf(item, quantity));
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shippingFee = subtotal >= 1000000 ? 0 : 30000;
  const order: DeskOrder = {
    id: spec.id,
    placedAt: new Date(spec.placedAt).toISOString(),
    status: 'to_ship',
    paymentStatus: 'pending',
    paymentMethod: spec.method,
    items: lines,
    pricing: {
      subtotal,
      discount: 0,
      shippingFee,
      shippingDiscount: 0,
      total: subtotal + shippingFee,
    },
    vouchers: [],
    recipient: { name: spec.name, phone: spec.phone, email: spec.email },
    shippingAddress: {
      street: '12 Nguyễn Huệ',
      ward: 'Phường Bến Nghé',
      province: 'TP. Hồ Chí Minh',
    },
    note: spec.note,
    estimatedDelivery: { from: '2026-11-10', to: '2026-11-13' },
    tab: spec.bucket,
    needsCall: false,
    callAttempts: { total: 0, inFirstDay: 0 },
    overdue: [],
    allowedActions: [],
    timeline: [],
  };
  const placed = order.placedAt;
  const events: DeskTimelineEntry[] = [];
  const placedEvent = () =>
    entry(
      { status: spec.method === 'cod' ? 'to_ship' : 'to_pay', paymentStatus: 'pending' },
      placed,
      'placed',
      'Khách đặt hàng',
    );
  const shipped = plus(placed, 60 * 30);

  switch (spec.bucket) {
    case 'pending-payment':
      order.status = 'to_pay';
      order.paymentDueAt = plus(placed, 24 * 60);
      events.push(placedEvent());
      break;
    case 'to-confirm': {
      order.needsCall = true;
      events.push(placedEvent());
      const calls = spec.calls ?? 0;
      for (let n = 0; n < calls; n += 1) {
        events.push(
          entry(order, plus(placed, 90 + n * 120), 'call_attempt', 'Ghi nhận không liên lạc được', {
            staff: n % 2 ? ADMIN : STAFF,
            fromStatus: 'to_ship',
            note: `Lần ${n + 1}: máy bận`,
          }),
        );
      }
      if (calls) {
        order.callAttempts = {
          total: calls,
          inFirstDay: calls,
          firstAt: plus(placed, 90),
          lastAt: plus(placed, 90 + (calls - 1) * 120),
        };
      }
      break;
    }
    case 'to-fulfil':
      events.push(placedEvent());
      if (spec.method === 'cod') {
        order.confirmation = { confirmedAt: plus(placed, 45), confirmedBy: STAFF };
        events.push(
          entry(order, plus(placed, 45), 'confirmed', 'Khách xác nhận đơn', {
            staff: STAFF,
            fromStatus: 'to_ship',
          }),
        );
      } else {
        order.paymentStatus = 'paid';
        order.paidAt = plus(placed, 10);
        events.push(entry(order, plus(placed, 10), 'payment_received', 'Đã nhận thanh toán'));
      }
      break;
    case 'in-transit':
      order.status = 'to_receive';
      events.push(placedEvent());
      if (spec.method === 'bank-transfer') {
        order.paymentStatus = 'paid';
        order.paidAt = plus(placed, 10);
      } else {
        order.confirmation = { confirmedAt: plus(placed, 45), confirmedBy: STAFF };
      }
      if (spec.rich) {
        order.callAttempts = {
          total: 1,
          inFirstDay: 1,
          firstAt: plus(placed, 15),
          lastAt: plus(placed, 15),
        };
        events.push(
          entry(order, plus(placed, 15), 'call_attempt', 'Ghi nhận không liên lạc được', {
            staff: STAFF,
            fromStatus: 'to_ship',
            toStatus: 'to_ship',
          }),
          entry(order, plus(placed, 20), 'note', 'Ghi chú nội bộ', {
            staff: ADMIN,
            fromStatus: 'to_ship',
            toStatus: 'to_ship',
            note: 'Khách nhờ gọi lại sau 17:00',
          }),
          entry(order, plus(placed, 45), 'confirmed', 'Khách xác nhận đơn', {
            staff: STAFF,
            fromStatus: 'to_ship',
            toStatus: 'to_ship',
          }),
        );
      }
      order.shipment = {
        carrier: 'GHTK',
        trackingNumber: `GHTK-${spec.id.slice(-5)}`,
        handedOverAt: shipped,
        handedOverBy: STAFF,
      };
      events.push(
        entry(order, shipped, 'shipped', 'Bàn giao vận chuyển', {
          staff: STAFF,
          fromStatus: 'to_ship',
          detail: `GHTK, mã vận đơn ${order.shipment.trackingNumber}`,
        }),
      );
      break;
    case 'cancel-requests':
      order.status = 'cancel_requested';
      order.cancelRequest = {
        requestedAt: plus(placed, 180),
        reason: 'Đặt nhầm size',
        outcome: 'pending',
      };
      events.push(
        placedEvent(),
        entry(order, plus(placed, 180), 'cancel_requested', 'Khách gửi yêu cầu huỷ', {
          fromStatus: 'to_ship',
          actor: { type: 'customer' },
          detail: 'Đặt nhầm size',
        }),
      );
      break;
    case 'returning':
      order.status = 'cancelled';
      order.deliveryRefusedAt = plus(placed, 48 * 60);
      order.cancellation = {
        by: 'shop',
        at: plus(placed, 48 * 60),
        reasonCode: 'refused',
        reason: 'Khách từ chối nhận hàng',
      };
      order.returnHandling = { state: 'pending' };
      events.push(
        placedEvent(),
        entry(order, plus(placed, 48 * 60), 'cancelled', 'Huỷ đơn: khách từ chối nhận', {
          staff: STAFF,
          fromStatus: 'to_receive',
          reasonCode: 'refused',
          detail: 'Khách từ chối nhận hàng',
        }),
      );
      break;
    case 'completed':
      order.status = 'completed';
      order.paymentStatus = 'paid';
      order.paidAt = plus(placed, 4000);
      order.deliveredAt = plus(placed, 4000);
      order.shipment = {
        carrier: 'J&T',
        trackingNumber: `JT-${spec.id.slice(-5)}`,
        handedOverAt: shipped,
        handedOverBy: STAFF,
      };
      events.push(
        placedEvent(),
        entry(order, shipped, 'shipped', 'Bàn giao vận chuyển', {
          staff: STAFF,
          fromStatus: 'to_ship',
          toStatus: 'to_receive',
          detail: `J&T, mã vận đơn ${order.shipment.trackingNumber}`,
        }),
        entry(order, plus(placed, 4000), 'delivered', 'Giao xong', {
          staff: ADMIN,
          fromStatus: 'to_receive',
        }),
      );
      break;
    case 'cancelled': {
      order.status = 'cancelled';
      const by = spec.id.endsWith('0') ? 'system' : spec.id.endsWith('1') ? 'customer' : 'shop';
      const reason =
        by === 'system'
          ? 'Đơn tự huỷ do quá hạn thanh toán'
          : by === 'customer'
            ? 'Khách yêu cầu huỷ'
            : 'Không liên lạc được với khách';
      order.cancellation = {
        by,
        at: plus(placed, 600),
        reason,
        reasonCode: by === 'shop' ? 'unreachable' : undefined,
      };
      order.stockRestoredAt = plus(placed, 600);
      events.push(
        placedEvent(),
        entry(order, plus(placed, 600), 'cancelled', 'Huỷ đơn', {
          fromStatus: 'to_ship',
          detail: reason,
          ...(by === 'shop'
            ? { staff: STAFF, reasonCode: 'unreachable' }
            : by === 'customer'
              ? { actor: { type: 'customer' as const } }
              : {}),
        }),
      );
      break;
    }
  }
  order.timeline = events.sort((a, b) => b.at.localeCompare(a.at));
  return order;
}

/** 45 orders. Tabs: 3 / 4 / 5 / 4 / 2 / 2 / 20 / 5 in the order of `DESK_BUCKETS`. */
export function buildDeskOrders(): DeskOrder[] {
  const plan: DeskBucket[] = [
    ...Array<DeskBucket>(3).fill('pending-payment'),
    ...Array<DeskBucket>(3).fill('to-confirm'),
    ...Array<DeskBucket>(4).fill('to-fulfil'),
    ...Array<DeskBucket>(3).fill('in-transit'),
    ...Array<DeskBucket>(2).fill('cancel-requests'),
    ...Array<DeskBucket>(2).fill('returning'),
    ...Array<DeskBucket>(20).fill('completed'),
    ...Array<DeskBucket>(5).fill('cancelled'),
  ];
  const fillers: Spec[] = plan.map((bucket, index) => ({
    id: `N2F261105${1000 + index}`,
    placedAt: hoursAgo(index * 3 + 3),
    name: NAMES[index % NAMES.length],
    phone: `09${String(10000000 + index * 7919).padStart(8, '0')}`,
    email: `khach${index}@example.com`,
    method: bucket === 'pending-payment' || index % 3 === 0 ? 'bank-transfer' : 'cod',
    bucket,
    lines:
      index % 4 === 0
        ? [
            [2, 1],
            [1, 2],
          ]
        : [[1, 1]],
    calls: bucket === 'to-confirm' ? [2, 3, 0][index % 3] : undefined,
  }));
  const specials: Spec[] = [
    {
      // 2026-11-08 00:30 (GMT+7): the first day of the date-range checks; needs a call.
      id: 'N2F2611081801',
      placedAt: '2026-11-08T00:30:00+07:00',
      name: 'Nguyễn Văn A',
      phone: '0912345678',
      email: 'a@x.vn',
      method: 'cod',
      bucket: 'to-confirm',
      lines: [[0, 2]],
      note: 'Giao giờ hành chính',
    },
    {
      // 2026-11-07 23:59 (GMT+7): the day before; confirmed COD, being packed.
      id: 'N2F2611072359',
      placedAt: '2026-11-07T23:59:00+07:00',
      name: 'Trần Thị B',
      phone: '0987654321',
      email: 'b@example.com',
      method: 'cod',
      bucket: 'to-fulfil',
      lines: [[0, 1]],
    },
    {
      // Whole history: call, internal note, confirmation, hand-over.
      id: 'N2F2611041777',
      placedAt: '2026-11-04T10:00:00+07:00',
      name: 'Phan Thị Cẩm',
      phone: '0933445566',
      email: 'cam@example.com',
      method: 'cod',
      bucket: 'in-transit',
      lines: [
        [0, 1],
        [1, 1],
      ],
      rich: true,
    },
  ];
  return [...specials, ...fillers].map(build);
}
