/**
 * Fixed role × permission matrix (guideline 6.13, Phụ lục A.4: roles match the backend `Role` enum).
 * Hidden, not disabled: UI checks these to hide menus and buttons (8.2); the backend must enforce
 * the same matrix.
 */
import type { StaffRole } from '../data-access/models';

export type Permission =
  | 'dashboard.revenue'
  | 'orders.view'
  | 'orders.process'
  | 'orders.cancel'
  | 'orders.export'
  | 'returns.process'
  | 'products.view'
  | 'products.edit'
  | 'products.delete'
  | 'products.cost'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'customers.view'
  | 'customers.edit'
  | 'customers.contact'
  | 'promotions.view'
  | 'promotions.edit'
  | 'settings.store'
  | 'settings.staff'
  | 'settings.audit';

const ALL: readonly Permission[] = [
  'dashboard.revenue',
  'orders.view',
  'orders.process',
  'orders.cancel',
  'orders.export',
  'returns.process',
  'products.view',
  'products.edit',
  'products.delete',
  'products.cost',
  'inventory.view',
  'inventory.adjust',
  'customers.view',
  'customers.edit',
  'customers.contact',
  'promotions.view',
  'promotions.edit',
  'settings.store',
  'settings.staff',
  'settings.audit',
];

export const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<Permission>> = {
  admin: new Set(ALL),
  staff: new Set<Permission>([
    'orders.view',
    'orders.process',
    'returns.process',
    'products.view',
    'inventory.view',
    'inventory.adjust',
    'customers.view',
    'promotions.view',
  ]),
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Quản trị viên',
  staff: 'Nhân viên',
};

/** Rows of the read-only matrix shown in Settings → Nhân viên & phân quyền. */
export const PERMISSION_MATRIX: {
  module: string;
  items: { permission: Permission; label: string }[];
}[] = [
  {
    module: 'Tổng quan',
    items: [{ permission: 'dashboard.revenue', label: 'Xem doanh thu' }],
  },
  {
    module: 'Đơn hàng',
    items: [
      { permission: 'orders.view', label: 'Xem' },
      { permission: 'orders.process', label: 'Xử lý (xác nhận, giao hàng)' },
      { permission: 'orders.cancel', label: 'Hủy đơn' },
      { permission: 'orders.export', label: 'Xuất file' },
      { permission: 'returns.process', label: 'Duyệt trả hàng' },
    ],
  },
  {
    module: 'Sản phẩm & tồn kho',
    items: [
      { permission: 'products.view', label: 'Xem' },
      { permission: 'products.edit', label: 'Tạo, sửa' },
      { permission: 'products.delete', label: 'Xóa' },
      { permission: 'products.cost', label: 'Xem giá vốn' },
      { permission: 'inventory.adjust', label: 'Điều chỉnh tồn kho' },
    ],
  },
  {
    module: 'Khách hàng',
    items: [
      { permission: 'customers.view', label: 'Xem' },
      { permission: 'customers.edit', label: 'Sửa ghi chú, khóa tài khoản' },
      { permission: 'customers.contact', label: 'Xem đầy đủ SĐT, email' },
    ],
  },
  {
    module: 'Khuyến mãi',
    items: [
      { permission: 'promotions.view', label: 'Xem' },
      { permission: 'promotions.edit', label: 'Tạo, sửa, tắt' },
    ],
  },
  {
    module: 'Cài đặt',
    items: [
      { permission: 'settings.store', label: 'Thông tin & chính sách cửa hàng' },
      { permission: 'settings.staff', label: 'Nhân viên & phân quyền' },
      { permission: 'settings.audit', label: 'Nhật ký hoạt động' },
    ],
  },
];
