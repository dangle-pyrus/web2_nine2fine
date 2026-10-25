/**
 * Deterministic demo data for the admin mock backend. Everything here is fictional; dates are
 * relative to "now" so the dashboard always shows a live-looking day.
 */
import type {
  AdminCustomer,
  AdminOrder,
  AdminOrderEvent,
  AdminOrderItem,
  AdminProduct,
  AuditEntry,
  CustomerTier,
  InventoryMovement,
  PaymentState,
  Promotion,
  StaffMember,
} from '../../app/admin/data-access/models';
import type {
  OrderStatus,
  PaymentMethod,
  ReturnReason,
} from '../../app/features/orders/order-models';
import { STORE_POLICY } from '../../app/core/store-policy';
import { getMedia } from '../../media/media-manifest';
import { PRODUCTS } from '../products';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Small seeded PRNG so every reload of a fresh demo produces the same data. */
function rng(seed: number) {
  let state = seed;
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

const iso = (time: number) => new Date(time).toISOString();

export interface AdminSeed {
  products: AdminProduct[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
  promotions: Promotion[];
  staff: (StaffMember & { password: string })[];
  audit: AuditEntry[];
  movements: Record<string, InventoryMovement[]>;
  thresholds: Record<string, number>;
  sequence: number;
}

// ---------- Products ----------

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function productsSeed(now: number): AdminProduct[] {
  const fromCatalog: AdminProduct[] = PRODUCTS.map((product, index) => {
    const colors = [
      ...new Map(product.variants.map((variant) => [variant.color.name, variant.color])).values(),
    ];
    const sizes = [...new Set(product.variants.map((variant) => variant.size))].sort(
      (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
    );
    return {
      id: `p${product.id}`,
      slug: product.slug,
      name: product.name,
      type: product.type,
      description: product.description,
      status: 'active',
      category: product.category,
      genders: [...product.genders],
      moments: [...product.moments],
      tags: product.badge ? [product.badge === 'NEW' ? 'Mới' : 'Bán chạy'] : [],
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      cost: Math.round((product.price * 0.42) / 1000) * 1000,
      material: product.material,
      care: [...product.care],
      fitSummary: product.fit.summary,
      images: product.gallery.map((mediaId, imageIndex) => {
        const media = getMedia(mediaId);
        return { id: `${product.id}-img-${imageIndex}`, url: media.src, alt: media.alt, color: '' };
      }),
      colors,
      sizes,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        price: null,
        // Catalogue stock is tiny; scale it so the dashboard has believable numbers.
        inventory: variant.inventory === 0 ? 0 : variant.inventory * 4 + ((index * 3) % 7),
      })),
      seoTitle: `${product.name} | nine2fine`,
      seoDescription: product.description.slice(0, 150),
      createdAt: iso(Date.parse(product.createdAt)),
      updatedAt: iso(now - (index + 1) * 2 * DAY),
    };
  });

  const placeholder = getMedia('catalog-placeholder');
  const extra = (
    id: string,
    name: string,
    category: string,
    status: AdminProduct['status'],
    price: number,
    daysAgo: number,
  ): AdminProduct => {
    const colors = [
      { name: 'Be', hex: '#d8cbb5' },
      { name: 'Đen', hex: '#242323' },
    ];
    const sizes = ['S', 'M', 'L'];
    return {
      id,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      type: '',
      description: '',
      status,
      category,
      genders: ['nu'],
      moments: ['weekend'],
      tags: [],
      price,
      compareAtPrice: null,
      cost: Math.round(price * 0.4),
      material: '',
      care: [],
      fitSummary: '',
      images:
        status === 'draft'
          ? []
          : [{ id: `${id}-img-0`, url: placeholder.src, alt: name, color: '' }],
      colors,
      sizes,
      variants: colors.flatMap((color, colorIndex) =>
        sizes.map((size) => ({
          id: `${id}-${colorIndex}-${size}`,
          sku: `N2F-${id.toUpperCase()}-${colorIndex}-${size}`,
          color,
          size,
          price: null,
          inventory: status === 'draft' ? 0 : 6,
        })),
      ),
      seoTitle: '',
      seoDescription: '',
      createdAt: iso(now - daysAgo * DAY),
      updatedAt: iso(now - daysAgo * DAY),
    };
  };

  return [
    ...fromCatalog,
    extra('p21', 'Linen Weekend Shirt', 'tops', 'draft', 650000, 1),
    extra('p22', 'Pleated Midi Skirt', 'bottoms', 'draft', 720000, 3),
    extra('p23', 'Cropped Knit Cardigan', 'outerwear', 'hidden', 890000, 40),
  ];
}

// ---------- Customers ----------

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Huỳnh'];
const MIDDLE = ['Thị', 'Văn', 'Minh', 'Ngọc', 'Hoài', 'Thanh', 'Gia', 'Bảo'];
const GIVEN = [
  'An',
  'Bình',
  'Chi',
  'Dung',
  'Giang',
  'Hà',
  'Hải',
  'Khánh',
  'Linh',
  'Mai',
  'Nam',
  'Ngân',
  'Phúc',
  'Quân',
  'Trang',
  'Tú',
  'Vy',
  'Yến',
  'Thảo',
  'Long',
  'Hùng',
  'My',
  'Duy',
  'Như',
];
const STREETS = [
  '12 Lê Lợi',
  '45 Nguyễn Huệ',
  '88 Hai Bà Trưng',
  '7 Trần Hưng Đạo',
  '102 Võ Văn Tần',
  '23 Lý Tự Trọng',
  '56 Pasteur',
  '9 Điện Biên Phủ',
];
const PLACES = [
  { ward: 'Phường Bến Nghé', province: 'TP. Hồ Chí Minh' },
  { ward: 'Phường Tân Định', province: 'TP. Hồ Chí Minh' },
  { ward: 'Phường Hàng Bạc', province: 'Hà Nội' },
  { ward: 'Phường Thạch Thang', province: 'Đà Nẵng' },
  { ward: 'Phường Linh Trung', province: 'TP. Hồ Chí Minh' },
];

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.');
}

function customersSeed(now: number, random: ReturnType<typeof rng>): AdminCustomer[] {
  return Array.from({ length: 28 }, (_, index) => {
    const family = FAMILY[index % FAMILY.length];
    const given = GIVEN[index % GIVEN.length];
    const middle = random.pick(MIDDLE);
    const name = `${family} ${middle} ${given}`;
    const place = random.pick(PLACES);
    const phone = `09${String(10000000 + ((index * 7919) % 89999999)).padStart(8, '0')}`;
    return {
      id: `c${String(index + 1).padStart(3, '0')}`,
      name,
      email: `${slugify(given)}.${slugify(family)}${index + 1}@gmail.com`,
      phone,
      tier: 'member' as CustomerTier,
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      status: index === 17 ? 'blocked' : 'active',
      createdAt: iso(now - (200 - index * 5) * DAY),
      birthDate: index % 3 === 0 ? `199${index % 10}-0${(index % 9) + 1}-1${index % 9}` : null,
      marketingOptIn: index % 2 === 0,
      tags: index % 6 === 0 ? ['VIP'] : index === 17 ? ['Bom hàng'] : [],
      note: index === 17 ? 'Từ chối nhận 2 đơn COD liên tiếp.' : '',
      returnCount: 0,
      averageOrderValue: 0,
      usualSizes: [],
      addresses: [
        {
          recipient: name,
          phone,
          line: `${random.pick(STREETS)}, ${place.ward}, ${place.province}`,
          isDefault: true,
        },
      ],
      recentOrders: [],
    };
  });
}

// ---------- Orders ----------

const CARRIERS = ['GHN', 'GHTK', 'Viettel Post'];
const REASONS: ReturnReason[] = ['wrong-size', 'not-fit', 'defective', 'wrong-color'];

export function paymentStateOf(
  order: Pick<AdminOrder, 'status' | 'payment' | 'refund'>,
): PaymentState {
  if (order.refund?.refundedAt) return 'refunded';
  if (order.payment.paid) return 'paid';
  if (order.status === 'cancelled') return 'void';
  if (order.payment.method === 'cod') return 'cod';
  return 'unpaid';
}

export function orderIdFor(time: number, sequence: number): string {
  return `N2F${iso(time).slice(2, 10).replace(/-/g, '')}${String(sequence).padStart(3, '0')}`;
}

function event(at: number, title: string, detail?: string, author?: string): AdminOrderEvent {
  return {
    id: `e${at.toString(36)}${Math.round(Math.random() * 1e6).toString(36)}`,
    at: iso(at),
    kind: 'system',
    title,
    detail,
    author,
  };
}

const FAILURE_REASONS = [
  'Không liên lạc được người nhận',
  'Khách hẹn giao lại hôm sau',
  'Khách từ chối nhận hàng',
  'Sai địa chỉ giao hàng',
];

function ordersSeed(
  now: number,
  products: AdminProduct[],
  customers: AdminCustomer[],
  random: ReturnType<typeof rng>,
) {
  const active = products.filter((product) => product.status === 'active');
  const orders: AdminOrder[] = [];
  let sequence = 0;

  // [ageInHours, status] pairs: recent orders still move, older ones are settled.
  const plan: [number, OrderStatus][] = [];
  for (let i = 0; i < 4; i++) plan.push([random.int(1, 20), 'pending-payment']);
  for (let i = 0; i < 9; i++) plan.push([random.int(2, 40), 'processing']);
  for (let i = 0; i < 6; i++) plan.push([random.int(26, 70), 'shipping']);
  for (let i = 0; i < 4; i++) plan.push([random.int(50, 96), 'delivering']);
  for (let i = 0; i < 3; i++) plan.push([random.int(0, 6), 'pending-confirmation']);
  for (let i = 0; i < 2; i++) plan.push([random.int(60, 100), 'delivery-failed']);
  plan.push([random.int(24 * 6, 24 * 10), 'returned-to-sender']);
  for (let i = 0; i < 3; i++) plan.push([random.int(24 * 5, 24 * 14), 'return-requested']);
  for (let i = 0; i < 2; i++) plan.push([random.int(24 * 15, 24 * 40), 'returned']);
  for (let i = 0; i < 7; i++) plan.push([random.int(3, 24 * 50), 'cancelled']);
  for (let i = 0; i < 70; i++) plan.push([random.int(24 * 4, 24 * 60), 'completed']);
  // A steady trickle of today's orders for the dashboard.
  for (let i = 0; i < 6; i++)
    plan.push([
      random.int(0, 9),
      random.pick(['processing', 'pending-payment', 'processing'] as OrderStatus[]),
    ]);

  plan.sort((a, b) => b[0] - a[0]);

  for (const [age, status] of plan) {
    const placed = now - age * HOUR - random.int(0, 59) * MINUTE;
    const customer =
      random.next() < 0.12
        ? null
        : random.pick(customers.filter((item) => item.status === 'active'));
    const lineCount = random.int(1, 3);
    const items: AdminOrderItem[] = [];
    for (let i = 0; i < lineCount; i++) {
      const product = random.pick(active);
      const variant =
        random.pick(product.variants.filter((item) => item.inventory > 0)) ?? product.variants[0];
      if (items.some((item) => item.variantId === variant.id)) continue;
      items.push({
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        image: product.images[0]?.url ?? '',
        productSlug: product.slug,
        name: product.name,
        color: variant.color.name,
        size: variant.size,
        quantity: random.next() < 0.15 ? 2 : 1,
        unitPrice: variant.price ?? product.price,
        compareAtPrice: product.compareAtPrice ?? undefined,
        mediaId: 'catalog-placeholder',
      });
    }
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const discount = random.next() < 0.2 ? Math.round((subtotal * 0.1) / 1000) * 1000 : 0;
    const shippingFee = STORE_POLICY.shippingFee;
    const shippingDiscount = subtotal >= STORE_POLICY.freeShippingFrom ? shippingFee : 0;
    const total = subtotal - discount + shippingFee - shippingDiscount;

    const method: PaymentMethod =
      status === 'pending-payment'
        ? 'bank-transfer'
        : ['pending-confirmation', 'delivery-failed', 'returned-to-sender'].includes(status)
          ? 'cod'
          : random.pick(['cod', 'cod', 'bank-transfer', 'card'] as PaymentMethod[]);
    const settled = ['completed', 'return-requested', 'returned'].includes(status);
    const paid =
      method === 'card' ||
      (method === 'bank-transfer' && status !== 'pending-payment' && status !== 'cancelled') ||
      (method === 'cod' && settled);
    const labels: Record<PaymentMethod, string> = {
      cod: 'Thanh toán khi nhận hàng (COD)',
      'bank-transfer': 'Chuyển khoản ngân hàng',
      card: 'Visa •••• 4242',
    };
    const recipient = customer?.name ?? random.pick(['Lý Thu Hà', 'Phan Quốc Bảo', 'Tạ Minh Châu']);
    const phone = customer?.phone ?? '0938123456';
    const address =
      customer?.addresses[0].line ?? '15 Lê Thánh Tôn, Phường Bến Nghé, TP. Hồ Chí Minh';
    const [street, ward, province] = address.split(', ');

    const id = orderIdFor(placed, ++sequence);
    const events: AdminOrderEvent[] = [
      event(placed, 'Khách đặt hàng', `${items.length} sản phẩm · ${labels[method]}`),
    ];
    const order: AdminOrder = {
      id,
      placedAt: iso(placed),
      status,
      paymentState: 'unpaid',
      items,
      pricing: { subtotal, discount, shippingFee, shippingDiscount, total },
      shippingAddress: { recipient, phone, street, ward, province },
      payment: { method, label: labels[method], paid },
      voucherCode: discount ? 'WELCOME10' : undefined,
      note: random.next() < 0.15 ? 'Giao giờ hành chính giúp mình nhé.' : undefined,
      customer: {
        id: customer?.id ?? null,
        name: recipient,
        email: customer?.email ?? 'guest.order@gmail.com',
        phone,
        orderCount: 1,
        returnCount: 0,
      },
      events,
      tags: [],
      returnDays: STORE_POLICY.returnDays,
    };

    if (status === 'pending-payment') {
      order.paymentDueAt = iso(placed + 24 * HOUR);
    }
    if (paid && method !== 'cod') {
      order.paidAt = iso(placed + (method === 'card' ? 0 : 35 * MINUTE));
      events.push(event(Date.parse(order.paidAt), 'Đã nhận thanh toán', labels[method]));
    }
    const confirmedAt = placed + 2 * HOUR;
    if (
      !['pending-payment', 'pending-confirmation', 'cancelled'].includes(status) &&
      confirmedAt < now
    ) {
      events.push(
        event(
          Math.min(confirmedAt, now - MINUTE),
          'Đơn hàng được xác nhận',
          undefined,
          'Trần Thu Hà',
        ),
      );
    }
    if (
      [
        'shipping',
        'delivering',
        'delivery-failed',
        'returned-to-sender',
        'completed',
        'return-requested',
        'returned',
      ].includes(status)
    ) {
      const shippedAt = Math.min(placed + 20 * HOUR, now - 2 * HOUR);
      const carrier = random.pick(CARRIERS);
      order.delivery = {
        carrier,
        trackingCode: `${carrier === 'GHN' ? 'GHN' : carrier === 'GHTK' ? 'S' : 'VTP'}${random.int(10000000, 99999999)}`,
        estimatedAt: iso(shippedAt + 3 * DAY),
      };
      events.push(
        event(
          shippedAt,
          `Đã bàn giao cho ${carrier}`,
          `Mã vận đơn ${order.delivery.trackingCode}`,
          'Trần Thu Hà',
        ),
      );
      if (status !== 'shipping') {
        const outAt = Math.min(shippedAt + 40 * HOUR, now - HOUR);
        events.push(event(outAt, 'Shipper đang giao hàng'));
        if (status === 'delivery-failed' || status === 'returned-to-sender') {
          const failedAt = Math.min(outAt + 4 * HOUR, now - 40 * MINUTE);
          const reason = random.pick(FAILURE_REASONS);
          order.deliveryFailure = { at: iso(failedAt), reason, attempts: 1 };
          events.push(event(failedAt, 'Giao hàng không thành công', reason, carrier));
          if (status === 'returned-to-sender') {
            const backAt = Math.min(failedAt + 2 * DAY, now - HOUR);
            events.push(
              event(
                backAt,
                'Đã hoàn về shop',
                'Hàng đã nhập lại kho · Không thu được tiền COD',
                'Trần Thu Hà',
              ),
            );
          }
        } else if (status !== 'delivering') {
          const deliveredAt = Math.min(outAt + 5 * HOUR, now - 30 * MINUTE);
          order.delivery.deliveredAt = iso(deliveredAt);
          events.push(event(deliveredAt, 'Giao hàng thành công'));
          if (method === 'cod')
            events.push(
              event(deliveredAt, 'Đã thu tiền COD', `${total.toLocaleString('vi-VN')} ₫`),
            );
        }
      }
    }
    if (status === 'cancelled') {
      const by = random.pick(['customer', 'shop', 'system'] as const);
      order.cancelledBy =
        method === 'bank-transfer' && !paid ? 'system' : by === 'system' ? 'customer' : by;
      order.cancelledAt = iso(Math.min(placed + 3 * HOUR, now - MINUTE));
      events.push(
        event(
          Date.parse(order.cancelledAt),
          order.cancelledBy === 'shop'
            ? 'Shop hủy đơn'
            : order.cancelledBy === 'system'
              ? 'Đơn tự hủy do quá hạn thanh toán'
              : 'Khách hủy đơn',
          order.cancelledBy === 'shop' ? 'Lý do: Hết hàng' : undefined,
          order.cancelledBy === 'shop' ? 'Nguyễn Quản Trị' : undefined,
        ),
      );
      if (paid) {
        order.refund = {
          amount: total,
          destination: labels[method],
          reason: 'Đơn hàng đã hủy',
          expectedBy: iso(Date.parse(order.cancelledAt) + 5 * DAY),
          refundedAt: iso(Date.parse(order.cancelledAt) + 2 * DAY),
        };
      }
    }
    if (status === 'return-requested' || status === 'returned') {
      const delivered = Date.parse(order.delivery!.deliveredAt!);
      const requestedAt = Math.min(delivered + 2 * DAY, now - HOUR);
      const reason = random.pick(REASONS);
      const amount = items[0].unitPrice * items[0].quantity;
      order.returnRequest = {
        requestedAt: iso(requestedAt),
        lines: [{ index: 0, quantity: items[0].quantity }],
        reason,
        detail:
          reason === 'defective' ? 'Áo bị sút chỉ ở tay trái.' : 'Mặc thử thấy rộng hơn bảng size.',
        photoCount: 0,
        refundAccount:
          method === 'cod'
            ? {
                bank: 'Vietcombank',
                accountNumber: '0071000123456',
                accountName: recipient.toUpperCase(),
              }
            : null,
        amount,
        returnShippingFee: reason === 'defective' ? 0 : STORE_POLICY.returnShippingFee,
      };
      events.push(
        event(
          requestedAt,
          'Khách gửi yêu cầu trả hàng',
          `Lý do: ${reason === 'defective' ? 'Lỗi sản phẩm' : 'Không vừa'}`,
        ),
      );
      if (status === 'returned') {
        order.returnRequest.decision = {
          status: 'approved',
          decidedAt: iso(requestedAt + 5 * HOUR),
          note: '',
        };
        events.push(
          event(requestedAt + 5 * HOUR, 'Đã duyệt yêu cầu trả hàng', undefined, 'Trần Thu Hà'),
        );
        order.refund = {
          amount: amount - order.returnRequest.returnShippingFee,
          destination: method === 'cod' ? 'Vietcombank •••• 3456' : labels[method],
          reason: 'Trả hàng',
          expectedBy: iso(requestedAt + 6 * DAY),
          refundedAt: iso(requestedAt + 4 * DAY),
          items: items[0].quantity,
        };
        events.push(
          event(
            requestedAt + 4 * DAY,
            'Đã nhận hàng trả và hoàn tiền',
            `${order.refund.amount.toLocaleString('vi-VN')} ₫`,
            'Trần Thu Hà',
          ),
        );
      }
    }
    if (orders.length === 20 && status === 'completed') {
      order.tags = ['Khách quen'];
    }
    order.paymentState = paymentStateOf(order);
    order.events = events.sort((a, b) => b.at.localeCompare(a.at));
    orders.push(order);
  }

  // One completed order whose return was rejected, to show that branch.
  const rejected = orders.find(
    (order) =>
      order.status === 'completed' &&
      order.delivery?.deliveredAt &&
      Date.parse(order.delivery.deliveredAt) > now - 12 * DAY,
  );
  if (rejected) {
    const requestedAt = Date.parse(rejected.delivery!.deliveredAt!) + DAY;
    rejected.returnRequest = {
      requestedAt: iso(requestedAt),
      lines: [{ index: 0, quantity: 1 }],
      reason: 'changed-mind',
      detail: 'Không còn thích màu này.',
      photoCount: 0,
      refundAccount: null,
      amount: rejected.items[0].unitPrice,
      returnShippingFee: STORE_POLICY.returnShippingFee,
      decision: {
        status: 'rejected',
        decidedAt: iso(requestedAt + 6 * HOUR),
        note: 'Sản phẩm đã qua sử dụng, mất tem mác.',
      },
    };
    rejected.events.unshift(
      event(
        requestedAt + 6 * HOUR,
        'Đã từ chối yêu cầu trả hàng',
        'Sản phẩm đã qua sử dụng, mất tem mác.',
        'Trần Thu Hà',
      ),
    );
  }

  return { orders: orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt)), sequence };
}

export function refreshCustomerStats(customers: AdminCustomer[], orders: AdminOrder[]): void {
  const byCustomer = new Map<string, AdminOrder[]>();
  for (const order of orders) {
    if (!order.customer.id) continue;
    const list = byCustomer.get(order.customer.id) ?? [];
    list.push(order);
    byCustomer.set(order.customer.id, list);
  }
  for (const customer of customers) {
    const list = byCustomer.get(customer.id) ?? [];
    const counted = list.filter((order) => order.status !== 'cancelled');
    customer.orderCount = list.length;
    customer.totalSpent = counted.reduce(
      (sum, order) => sum + order.pricing.total - (order.refund?.amount ?? 0),
      0,
    );
    customer.lastOrderAt = list[0]?.placedAt ?? null;
    customer.returnCount = list.filter(
      (order) => order.status === 'returned' || order.status === 'return-requested',
    ).length;
    customer.averageOrderValue = counted.length
      ? Math.round(customer.totalSpent / counted.length)
      : 0;
    customer.tier =
      customer.totalSpent >= 5_000_000
        ? 'gold'
        : customer.totalSpent >= 2_000_000
          ? 'silver'
          : 'member';
    const sizes = new Map<string, number>();
    for (const order of list)
      for (const item of order.items)
        sizes.set(item.size, (sizes.get(item.size) ?? 0) + item.quantity);
    customer.usualSizes = [...sizes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([size]) => size);
    for (const order of list) {
      order.customer.orderCount = list.length;
      order.customer.returnCount = customer.returnCount;
    }
  }
}

// ---------- Promotions, staff, audit ----------

function promotionsSeed(now: number): Promotion[] {
  const base = { maxDiscount: null, categories: [], perCustomerLimit: 1, enabled: true };
  return [
    {
      ...base,
      id: 'promo1',
      code: 'WELCOME10',
      title: 'Chào thành viên mới',
      type: 'percent',
      value: 10,
      maxDiscount: 100000,
      minSubtotal: 300000,
      usageLimit: null,
      used: 214,
      startsAt: iso(now - 120 * DAY),
      endsAt: null,
      createdAt: iso(now - 121 * DAY),
    },
    {
      ...base,
      id: 'promo2',
      code: 'FREESHIP',
      title: 'Miễn phí vận chuyển cuối tuần',
      type: 'free-shipping',
      value: 0,
      minSubtotal: 500000,
      usageLimit: 500,
      used: 388,
      perCustomerLimit: 3,
      startsAt: iso(now - 20 * DAY),
      endsAt: iso(now + 10 * DAY),
      createdAt: iso(now - 21 * DAY),
    },
    {
      ...base,
      id: 'promo3',
      code: 'THUDONG20',
      title: 'Bộ sưu tập Thu Đông',
      type: 'percent',
      value: 20,
      maxDiscount: 200000,
      minSubtotal: 800000,
      categories: ['outerwear', 'dresses'],
      usageLimit: 300,
      used: 0,
      startsAt: iso(now + 6 * DAY),
      endsAt: iso(now + 20 * DAY),
      createdAt: iso(now - 2 * DAY),
    },
    {
      ...base,
      id: 'promo4',
      code: 'FLASH50K',
      title: 'Flash sale giữa tháng',
      type: 'fixed',
      value: 50000,
      minSubtotal: 400000,
      usageLimit: 200,
      used: 200,
      startsAt: iso(now - 45 * DAY),
      endsAt: iso(now - 43 * DAY),
      createdAt: iso(now - 50 * DAY),
    },
    {
      ...base,
      id: 'promo5',
      code: 'VIP150',
      title: 'Tri ân khách hàng Vàng',
      type: 'fixed',
      value: 150000,
      minSubtotal: 1500000,
      usageLimit: null,
      used: 37,
      startsAt: iso(now - 60 * DAY),
      endsAt: iso(now + 60 * DAY),
      enabled: false,
      createdAt: iso(now - 61 * DAY),
    },
  ];
}

function staffSeed(now: number): (StaffMember & { password: string })[] {
  return [
    {
      id: 's1',
      name: 'Nguyễn Quản Trị',
      email: 'admin@nine2fine.vn',
      role: 'admin',
      status: 'active',
      createdAt: iso(now - 300 * DAY),
      lastActiveAt: iso(now - 5 * MINUTE),
      password: 'admin123',
    },
    {
      id: 's2',
      name: 'Trần Thu Hà',
      email: 'staff@nine2fine.vn',
      role: 'staff',
      status: 'active',
      createdAt: iso(now - 200 * DAY),
      lastActiveAt: iso(now - 2 * HOUR),
      password: 'staff123',
    },
    {
      id: 's3',
      name: 'Lê Minh Khoa',
      email: 'kho@nine2fine.vn',
      role: 'staff',
      status: 'active',
      createdAt: iso(now - 90 * DAY),
      lastActiveAt: iso(now - 26 * HOUR),
      password: 'staff123',
    },
    {
      id: 's4',
      name: 'Phạm Gia Hân',
      email: 'han.pg@nine2fine.vn',
      role: 'staff',
      status: 'disabled',
      createdAt: iso(now - 150 * DAY),
      lastActiveAt: iso(now - 40 * DAY),
      password: 'staff123',
    },
  ];
}

function auditSeed(now: number, orders: AdminOrder[], products: AdminProduct[]): AuditEntry[] {
  const entries: AuditEntry[] = [
    {
      id: 'a1',
      at: iso(now - 30 * MINUTE),
      actor: 'Trần Thu Hà',
      action: 'Xác nhận đơn hàng',
      target: { type: 'order', id: orders[3].id, label: `#${orders[3].id}` },
    },
    {
      id: 'a2',
      at: iso(now - 3 * HOUR),
      actor: 'Nguyễn Quản Trị',
      action: 'Sửa giá sản phẩm',
      target: { type: 'product', id: products[1].id, label: products[1].name },
      before: '620.000 ₫',
      after: `${products[1].price.toLocaleString('vi-VN')} ₫`,
    },
    {
      id: 'a3',
      at: iso(now - 5 * HOUR),
      actor: 'Lê Minh Khoa',
      action: 'Điều chỉnh tồn kho',
      target: {
        type: 'inventory',
        id: products[0].variants[0].id,
        label: `${products[0].name} – ${products[0].variants[0].color.name} / ${products[0].variants[0].size}`,
      },
      before: '8',
      after: '12',
    },
    {
      id: 'a4',
      at: iso(now - 26 * HOUR),
      actor: 'Nguyễn Quản Trị',
      action: 'Tạo mã giảm giá',
      target: { type: 'promotion', id: 'promo3', label: 'THUDONG20' },
    },
    {
      id: 'a5',
      at: iso(now - 2 * DAY),
      actor: 'Nguyễn Quản Trị',
      action: 'Khóa tài khoản nhân viên',
      target: { type: 'staff', id: 's4', label: 'Phạm Gia Hân' },
      before: 'Đang hoạt động',
      after: 'Đã khóa',
    },
    {
      id: 'a6',
      at: iso(now - 4 * DAY),
      actor: 'Nguyễn Quản Trị',
      action: 'Sửa chính sách cửa hàng',
      target: { type: 'settings', id: 'store', label: 'Phí vận chuyển' },
      before: '35.000 ₫',
      after: '30.000 ₫',
    },
  ];
  return entries;
}

export function createSeed(now = Date.now()): AdminSeed {
  const random = rng(20261025);
  const products = productsSeed(now);
  const customers = customersSeed(now, random);
  const { orders, sequence } = ordersSeed(now, products, customers, random);
  refreshCustomerStats(customers, orders);
  const movements: Record<string, InventoryMovement[]> = {};
  const thresholds: Record<string, number> = {};
  for (const product of products) {
    for (const variant of product.variants) {
      thresholds[variant.id] = 5;
      movements[variant.id] = [
        {
          id: `m-${variant.id}`,
          at: product.createdAt,
          change: variant.inventory,
          after: variant.inventory,
          reason: 'received',
          note: 'Nhập kho ban đầu',
          author: 'Lê Minh Khoa',
        },
      ];
    }
  }
  return {
    products,
    orders,
    customers,
    promotions: promotionsSeed(now),
    staff: staffSeed(now),
    audit: auditSeed(now, orders, products),
    movements,
    thresholds,
    sequence,
  };
}
