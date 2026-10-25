import { Routes } from '@angular/router';
import { adminAuthGuard, requirePermission } from './core/admin-session';
import { provideAdmin } from './admin-providers';
import { AdminShell } from './layout/admin-shell';
import { unsavedChangesGuard } from './ui/unsaved-changes';

const T = (title: string) => `${title} | nine2fine Admin`;

/**
 * `/admin/**` — the whole back office, lazy-loaded from app.routes.ts and fully separate from the
 * storefront (own layout, styles, providers and mocks).
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    providers: provideAdmin(),
    children: [
      {
        path: 'login',
        title: T('Đăng nhập'),
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        // Outside the shell so only the sheets print; the session guard runs before the permission.
        path: 'print',
        canActivate: [adminAuthGuard],
        children: [
          {
            path: ':kind',
            title: T('In phiếu'),
            canActivate: [requirePermission('orders.view')],
            loadComponent: () => import('./features/print/print-page').then((m) => m.PrintPage),
          },
        ],
      },
      {
        path: '',
        component: AdminShell,
        canActivate: [adminAuthGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: T('Tổng quan'),
            loadComponent: () =>
              import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
          },
          {
            path: 'orders',
            canActivate: [requirePermission('orders.view')],
            children: [
              {
                path: '',
                title: T('Đơn hàng'),
                loadComponent: () =>
                  import('./features/orders/order-list-page').then((m) => m.OrderListPage),
              },
              {
                path: ':id',
                title: T('Chi tiết đơn hàng'),
                loadComponent: () =>
                  import('./features/orders/order-detail-page').then((m) => m.OrderDetailPage),
              },
            ],
          },
          {
            path: 'returns',
            title: T('Trả hàng'),
            canActivate: [requirePermission('orders.view')],
            loadComponent: () =>
              import('./features/returns/return-list-page').then((m) => m.ReturnListPage),
          },
          {
            path: 'products',
            canActivate: [requirePermission('products.view')],
            children: [
              {
                path: '',
                title: T('Sản phẩm'),
                loadComponent: () =>
                  import('./features/products/product-list-page').then((m) => m.ProductListPage),
              },
              {
                path: 'new',
                title: T('Thêm sản phẩm'),
                canActivate: [requirePermission('products.edit')],
                canDeactivate: [unsavedChangesGuard],
                loadComponent: () =>
                  import('./features/products/product-form-page').then((m) => m.ProductFormPage),
              },
              {
                path: ':id',
                title: T('Sản phẩm'),
                canDeactivate: [unsavedChangesGuard],
                loadComponent: () =>
                  import('./features/products/product-form-page').then((m) => m.ProductFormPage),
              },
            ],
          },
          {
            path: 'collections',
            title: T('Bộ sưu tập'),
            canActivate: [requirePermission('products.view')],
            loadComponent: () =>
              import('./features/content/collection-pages').then((m) => m.CollectionListPage),
          },
          {
            path: 'size-charts',
            title: T('Bảng size'),
            canActivate: [requirePermission('products.view')],
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () =>
              import('./features/content/size-chart-page').then((m) => m.SizeChartPage),
          },
          {
            path: 'reviews',
            title: T('Đánh giá sản phẩm'),
            canActivate: [requirePermission('products.view')],
            loadComponent: () =>
              import('./features/content/review-list-page').then((m) => m.ReviewListPage),
          },
          {
            path: 'content',
            title: T('Nội dung trang chủ'),
            canActivate: [requirePermission('products.view')],
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () =>
              import('./features/content/home-content-page').then((m) => m.HomeContentPage),
          },
          {
            path: 'reports',
            title: T('Báo cáo'),
            canActivate: [requirePermission('dashboard.revenue')],
            loadComponent: () =>
              import('./features/reports/reports-page').then((m) => m.ReportsPage),
          },
          {
            path: 'inventory',
            title: T('Tồn kho'),
            canActivate: [requirePermission('inventory.view')],
            loadComponent: () =>
              import('./features/inventory/inventory-page').then((m) => m.InventoryPage),
          },
          {
            path: 'customers',
            canActivate: [requirePermission('customers.view')],
            children: [
              {
                path: '',
                title: T('Khách hàng'),
                loadComponent: () =>
                  import('./features/customers/customer-list-page').then((m) => m.CustomerListPage),
              },
              {
                path: ':id',
                title: T('Khách hàng'),
                loadComponent: () =>
                  import('./features/customers/customer-detail-page').then(
                    (m) => m.CustomerDetailPage,
                  ),
              },
            ],
          },
          {
            path: 'promotions',
            canActivate: [requirePermission('promotions.view')],
            children: [
              {
                path: '',
                title: T('Khuyến mãi'),
                loadComponent: () =>
                  import('./features/promotions/promotion-list-page').then(
                    (m) => m.PromotionListPage,
                  ),
              },
              {
                path: 'new',
                title: T('Tạo mã giảm giá'),
                canActivate: [requirePermission('promotions.edit')],
                canDeactivate: [unsavedChangesGuard],
                loadComponent: () =>
                  import('./features/promotions/promotion-form-page').then(
                    (m) => m.PromotionFormPage,
                  ),
              },
              {
                path: ':id',
                title: T('Mã giảm giá'),
                canDeactivate: [unsavedChangesGuard],
                loadComponent: () =>
                  import('./features/promotions/promotion-form-page').then(
                    (m) => m.PromotionFormPage,
                  ),
              },
            ],
          },
          {
            path: 'settings',
            children: [
              {
                path: '',
                title: T('Cài đặt'),
                loadComponent: () =>
                  import('./features/settings/settings-index-page').then(
                    (m) => m.SettingsIndexPage,
                  ),
              },
              {
                path: 'store',
                title: T('Thông tin cửa hàng'),
                canActivate: [requirePermission('settings.store')],
                canDeactivate: [unsavedChangesGuard],
                loadComponent: () =>
                  import('./features/settings/store-settings-page').then(
                    (m) => m.StoreSettingsPage,
                  ),
              },
              {
                path: 'staff',
                title: T('Nhân viên & phân quyền'),
                canActivate: [requirePermission('settings.staff')],
                loadComponent: () =>
                  import('./features/settings/staff-page').then((m) => m.StaffPage),
              },
              {
                path: 'audit',
                title: T('Nhật ký hoạt động'),
                canActivate: [requirePermission('settings.audit')],
                loadComponent: () =>
                  import('./features/settings/audit-log-page').then((m) => m.AuditLogPage),
              },
            ],
          },
          {
            path: '**',
            title: T('Không tìm thấy trang'),
            loadComponent: () =>
              import('./features/not-found-page').then((m) => m.AdminNotFoundPage),
          },
        ],
      },
    ],
  },
];
