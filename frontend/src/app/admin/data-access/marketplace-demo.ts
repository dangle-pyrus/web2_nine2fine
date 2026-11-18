/**
 * DỮ LIỆU MẪU – KẾT NỐI SÀN Ở CHẾ ĐỘ DEMO (2026-11-15).
 *
 * nine2fine chưa kết nối thật với Shopee, TikTok Shop hay Lazada. Mọi con số "trên sàn" ở màn Tồn
 * kho và các dòng đơn sàn ở Tổng quan đều được SINH TẤT ĐỊNH tại trình duyệt từ SKU (hàm băm) và
 * số "Có thể bán" thật của Website, để trình diễn giao diện đa kênh. File này không gọi API ngoài,
 * không ghi gì lên máy chủ; cấu hình kết nối kênh chỉ lưu trong localStorage của trình duyệt.
 *
 * Mọi kênh bán từ đúng một số "Có thể bán" (không chia tỉ lệ, không tồn đệm, 2026-11-17).
 *
 * Khi có kết nối thật, thay file này bằng một adapter gọi API của từng sàn (cùng các kiểu bên
 * dưới) là màn hình dùng được ngay.
 */

export type ChannelKey = 'website' | 'shopee' | 'tiktok' | 'lazada';
export type MarketplaceKey = Exclude<ChannelKey, 'website'>;
export type SyncState = 'synced' | 'pending' | 'error';

export interface SalesChannel {
  key: ChannelKey;
  name: string;
  /** Two-letter mark drawn in the brand colour (compact places such as the inventory table). */
  short: string;
  color: string;
  /** Brand logo in `public/assets/brand` (recent orders on Tổng quan). */
  logo: string;
  /** True for Shopee / TikTok Shop / Lazada: every figure is sample data. */
  demo: boolean;
}

export const CHANNELS: SalesChannel[] = [
  {
    key: 'website',
    name: 'Website',
    short: 'N2',
    color: '#111111',
    logo: '/assets/brand/logo.svg',
    demo: false,
  },
  {
    key: 'shopee',
    name: 'Shopee',
    short: 'SP',
    color: '#ee4d2d',
    logo: '/assets/brand/shopee-logo.svg',
    demo: true,
  },
  {
    key: 'tiktok',
    name: 'TikTok Shop',
    short: 'TT',
    color: '#111111',
    logo: '/assets/brand/tiktokshop-logo.svg',
    demo: true,
  },
  {
    key: 'lazada',
    name: 'Lazada',
    short: 'LZ',
    color: '#1a237e',
    logo: '/assets/brand/lazada-logo.svg',
    demo: true,
  },
];

export const MARKETPLACES = CHANNELS.filter(
  (channel): channel is SalesChannel & { key: MarketplaceKey } => channel.demo,
);

export function channelOf(key: ChannelKey): SalesChannel {
  return CHANNELS.find((channel) => channel.key === key)!;
}

// ---------- Channel setup (localStorage, demo) ----------

/** What the "cấu hình kênh" page keeps per marketplace: the connection and the SKU links. */
export interface ChannelSetup {
  connected: boolean;
  shopName: string;
  shopId: string;
  /** SKU -> linked on purpose (true) or unlinked on purpose (false); the sample default otherwise. */
  links: Record<string, boolean>;
}

export type ChannelSetups = Record<MarketplaceKey, ChannelSetup>;

const SETUP_KEY = 'n2f.admin.marketplace.setup';

function defaultSetups(): ChannelSetups {
  return {
    shopee: { connected: true, shopName: 'nine2fine Official', shopId: '328417905', links: {} },
    tiktok: { connected: true, shopName: 'nine2fine.vn', shopId: '7494021183', links: {} },
    lazada: { connected: false, shopName: 'nine2fine Store', shopId: 'VN3380912', links: {} },
  };
}

export function readSetups(): ChannelSetups {
  const base = defaultSetups();
  try {
    const value = JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}') as Partial<ChannelSetups>;
    for (const key of Object.keys(base) as MarketplaceKey[])
      base[key] = { ...base[key], ...(value[key] ?? {}) };
  } catch {
    /* Storage unavailable or damaged: the defaults stand. */
  }
  return base;
}

export function saveSetups(setups: ChannelSetups): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setups));
  } catch {
    /* Storage unavailable: the setup lasts for this page only. */
  }
}

/** Listing code of a SKU on a marketplace (sample). */
export function listingCode(sku: string, channel: MarketplaceKey): string {
  const prefix = { shopee: 'SP', tiktok: 'TT', lazada: 'LZ' }[channel];
  return `${prefix}-${hash(`${sku}|${channel}|code`).toString(36).toUpperCase().slice(0, 8)}`;
}

// ---------- Deterministic sample figures ----------

/** FNV-1a: the same SKU always gives the same sample numbers. */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export interface ChannelStock {
  /** Units this channel should show: the real "Có thể bán", the same on every channel. */
  expected: number;
  /** Units the channel shows now; differs from `expected` when a push is pending or failed. */
  listed: number;
  state: SyncState;
  /** `false` when the SKU is not linked to a listing on that marketplace (sample). */
  linked: boolean;
  /** `false` when the marketplace itself is not connected (then `linked` is `false` too). */
  connected: boolean;
}

/** What one channel shows for a SKU, from the real "Có thể bán" of the website. */
export function channelStock(
  sku: string,
  available: number,
  channel: ChannelKey,
  setup?: ChannelSetup,
): ChannelStock {
  // One stock for every channel: each shows the same "Có thể bán".
  const expected = Math.max(0, available);
  if (channel === 'website')
    return { expected, listed: expected, state: 'synced', linked: true, connected: true };
  if (setup && !setup.connected)
    return { expected, listed: 0, state: 'synced', linked: false, connected: false };
  const h = hash(`${sku}|${channel}`);
  const link = setup?.links[sku];
  if (link === false || (link === undefined && channel === 'lazada' && h % 9 === 0))
    return { expected, listed: 0, state: 'synced', linked: false, connected: true };
  if (h % 23 === 0)
    return {
      expected,
      listed: expected + 1 + (h % 3),
      state: 'error',
      linked: true,
      connected: true,
    };
  if (h % 13 === 0)
    return {
      expected,
      listed: Math.max(0, expected - 1),
      state: 'pending',
      linked: true,
      connected: true,
    };
  return { expected, listed: expected, state: 'synced', linked: true, connected: true };
}

/**
 * Units held by unshipped orders of one channel. The website figure is the real `reserved`; the
 * marketplace figures are sample numbers, kept small enough that the SKU's status does not change.
 */
export function channelHeld(
  sku: string,
  channel: ChannelKey,
  item: { reserved: number; available: number; lowStockThreshold: number },
  setup?: ChannelSetup,
): number {
  if (channel === 'website') return item.reserved;
  if (setup && !setup.connected) return 0;
  const h = hash(`${sku}|${channel}|held`);
  if (h % 4 !== 0) return 0;
  const held = 1 + (h % 3);
  return item.available - held > item.lowStockThreshold ? held : 0;
}

/** True when a marketplace shows another number than "Có thể bán" (lệch tồn). */
export function isMismatch(stock: ChannelStock): boolean {
  return stock.linked && stock.listed !== stock.expected;
}

/** Minutes since the last (sample) sync of each channel when the page opens. */
export const INITIAL_SYNC_MINUTES: Record<ChannelKey, number> = {
  website: 0,
  shopee: 3,
  tiktok: 7,
  lazada: 14,
};

// ---------- Sync log (sample) ----------

export interface SyncLogEntry {
  id: string;
  /** Minutes ago. */
  ago: number;
  channel: MarketplaceKey;
  sku: string;
  change: string;
  ok: boolean;
  message: string;
}

/** A dozen sample lines built from real SKUs, with two sample failures. */
export function sampleSyncLog(skus: { sku: string; available: number }[]): SyncLogEntry[] {
  const pool = skus.length ? skus : [{ sku: 'N2F-DEMO-M', available: 8 }];
  const keys: MarketplaceKey[] = ['shopee', 'tiktok', 'lazada'];
  return Array.from({ length: 12 }, (_, index) => {
    const item = pool[(index * 7) % pool.length];
    const channel = keys[index % keys.length];
    const h = hash(`${item.sku}|log|${index}`);
    const before = item.available + 1 + (h % 3);
    const failed = index === 3 || index === 8;
    return {
      id: `log-${index}`,
      ago: 2 + index * 9 + (h % 5),
      channel,
      sku: item.sku,
      change: `${before} → ${item.available}`,
      ok: !failed,
      message: failed
        ? channel === 'tiktok'
          ? 'Phiên kết nối hết hạn, cần kết nối lại (mẫu)'
          : 'Sàn từ chối: SKU chưa liên kết mã sản phẩm trên sàn (mẫu)'
        : 'Đã cập nhật số lượng',
    };
  });
}

// ---------- Marketplace orders on Tổng quan (sample) ----------

export interface SampleChannelOrder {
  code: string;
  channel: MarketplaceKey;
  customerName: string;
  total: number;
  status: 'to_ship' | 'to_receive' | 'completed';
  /** Minutes before now; the dashboard keeps the ones inside the selected period. */
  ago: number;
}

/** Mixed into "Đơn hàng gần đây" by time and shown like website rows (the API only knows `website`). */
export const SAMPLE_CHANNEL_ORDERS: SampleChannelOrder[] = [
  {
    code: 'SPE2611150412',
    channel: 'shopee',
    customerName: 'Lê Hoàng Yến',
    total: 459_000,
    status: 'to_ship',
    ago: 26,
  },
  {
    code: 'TTS5781203391',
    channel: 'tiktok',
    customerName: 'Nguyễn Minh Khang',
    total: 689_000,
    status: 'to_ship',
    ago: 48,
  },
  {
    code: 'LZD1129043371',
    channel: 'lazada',
    customerName: 'Trần Thu Hà',
    total: 590_000,
    status: 'to_receive',
    ago: 310,
  },
  {
    code: 'SPE2611140987',
    channel: 'shopee',
    customerName: 'Phạm Quốc Bảo',
    total: 1_180_000,
    status: 'to_receive',
    ago: 1_530,
  },
  {
    code: 'TTS5781199812',
    channel: 'tiktok',
    customerName: 'Đỗ Ngọc Anh',
    total: 390_000,
    status: 'completed',
    ago: 4_210,
  },
  {
    code: 'LZD1129001245',
    channel: 'lazada',
    customerName: 'Vũ Thanh Tâm',
    total: 1_290_000,
    status: 'completed',
    ago: 18_900,
  },
];
