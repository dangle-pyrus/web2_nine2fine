import type { Permission } from '../core/permissions';

/** "G then <key>" jumps (Gmail/Linear style); listed in the "?" help and in Ctrl K. */
export const GO_TO: {
  key: string;
  label: string;
  link: string;
  permission: Permission | null;
}[] = [
  { key: 'h', label: 'Tổng quan', link: '/admin', permission: 'orders.view' },
  {
    key: 'o',
    label: 'Đơn hàng',
    link: '/admin/orders',
    permission: 'orders.view',
  },
  {
    key: 'r',
    label: 'Trả hàng',
    link: '/admin/returns',
    permission: 'orders.view',
  },
  {
    key: 'p',
    label: 'Sản phẩm',
    link: '/admin/products',
    permission: 'products.view',
  },
  {
    key: 'i',
    label: 'Tồn kho',
    link: '/admin/inventory',
    permission: 'inventory.view',
  },
  {
    key: 'c',
    label: 'Khách hàng',
    link: '/admin/customers',
    permission: 'customers.view',
  },
  {
    key: 'm',
    label: 'Khuyến mãi',
    link: '/admin/promotions',
    permission: 'promotions.view',
  },
  { key: 's', label: 'Cài đặt', link: '/admin/settings', permission: null },
];

/** Rows of the "?" help, grouped. */
export const SHORTCUT_HELP: {
  group: string;
  items: { keys: string[]; label: string }[];
}[] = [
  {
    group: 'Chung',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Tìm kiếm và lệnh nhanh' },
      { keys: ['/'], label: 'Đưa con trỏ vào ô tìm của trang' },
      { keys: ['?'], label: 'Mở bảng phím tắt này' },
    ],
  },
  {
    group: 'Chi tiết đơn hàng',
    items: [
      { keys: ['J'], label: 'Đơn sau trong danh sách đang lọc' },
      { keys: ['K'], label: 'Đơn trước trong danh sách đang lọc' },
    ],
  },
  {
    group: 'Đi tới',
    items: GO_TO.map((item) => ({
      keys: ['G', item.key.toUpperCase()],
      label: item.label,
    })),
  },
];
