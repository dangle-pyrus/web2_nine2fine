import { Routes } from '@angular/router';
import { StoreLayout } from './layouts/store-layout';
import { AuthLayout } from './layouts/auth-layout';
import { accountGuard } from './features/account/account-guard';

const addressForm = () =>
  import('./features/account/addresses/address-form-page').then((m) => m.AddressFormPage);
const catalog = () => import('./features/catalog/catalog-page').then((m) => m.CatalogPage);

export const routes: Routes = [
  {
    path: 'auth',
    component: AuthLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Đăng nhập | nine2fine',
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Tạo tài khoản | nine2fine',
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        title: 'Quên mật khẩu | nine2fine',
        loadComponent: () =>
          import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
    ],
  },
  {
    path: '',
    component: StoreLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'nine2fine | Thời trang đi làm đến đi chơi',
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
        // Store header renders transparently over the hero (Figma header (2), plan 7).
        data: { headerOverlay: true },
      },
      {
        path: 'new-in',
        title: 'New In | nine2fine',
        loadComponent: catalog,
        data: { title: 'New in.' },
      },
      {
        path: 'shop',
        title: 'Shop | nine2fine',
        loadComponent: catalog,
        data: { title: 'The everyday edit.' },
      },
      {
        path: 'shop/nam',
        title: 'Thời trang Nam | nine2fine',
        loadComponent: catalog,
        data: { gender: 'nam' },
      },
      {
        path: 'shop/nu',
        title: 'Thời trang Nữ | nine2fine',
        loadComponent: catalog,
        data: { gender: 'nu' },
      },
      { path: 'shop/:category', title: 'Bộ sưu tập | nine2fine', loadComponent: catalog },
      {
        path: 'shop-by-moment/:moment',
        title: 'Shop by Moment | nine2fine',
        loadComponent: catalog,
      },
      {
        path: 'search',
        title: 'Tìm kiếm | nine2fine',
        loadComponent: catalog,
        data: { kind: 'search' },
      },
      {
        path: 'wishlist',
        title: 'Yêu thích | nine2fine',
        // Members only: guests are sent to sign in (user decision 2026-10-11).
        canActivate: [accountGuard],
        loadComponent: catalog,
        data: { kind: 'wishlist' },
      },
      {
        path: 'product/:slug',
        title: 'Sản phẩm | nine2fine',
        loadComponent: () => import('./features/product/product-page').then((m) => m.ProductPage),
      },
      {
        path: 'cart',
        title: 'Giỏ hàng | nine2fine',
        loadComponent: () => import('./features/cart/cart-view').then((m) => m.CartView),
      },
      {
        path: 'checkout',
        title: 'Thanh toán | nine2fine',
        loadComponent: () =>
          import('./features/checkout/checkout-page').then((m) => m.CheckoutPage),
      },
      {
        path: 'order-success/:orderId',
        title: 'Đặt hàng thành công | nine2fine',
        loadComponent: () =>
          import('./features/checkout/order-success-page').then((m) => m.OrderSuccessPage),
      },
      {
        path: 'payment/:orderId',
        title: 'Thanh toán chuyển khoản | nine2fine',
        loadComponent: () => import('./features/checkout/payment-page').then((m) => m.PaymentPage),
      },
      {
        path: 'track-order',
        title: 'Tra cứu đơn hàng | nine2fine',
        loadComponent: () =>
          import('./features/tracking/track-order-page').then((m) => m.TrackOrderPage),
      },
      { path: 'policies', pathMatch: 'full', redirectTo: 'policies/returns' },
      {
        path: 'policies/:slug',
        title: 'Chính sách | nine2fine',
        loadComponent: () => import('./features/policies/policy-page').then((m) => m.PolicyPage),
      },
      {
        path: 'help',
        title: 'Liên hệ & hỗ trợ | nine2fine',
        loadComponent: () => import('./features/policies/help-page').then((m) => m.HelpPage),
      },
      {
        path: 'account',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./features/account/account-layout').then((m) => m.AccountLayout),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            title: 'Hồ sơ tài khoản | nine2fine',
            loadComponent: () =>
              import('./features/account/profile/profile-page').then((m) => m.ProfilePage),
          },
          {
            path: 'addresses',
            title: 'Địa chỉ nhận hàng | nine2fine',
            loadComponent: () =>
              import('./features/account/addresses/addresses-page').then((m) => m.AddressesPage),
          },
          {
            path: 'addresses/new',
            title: 'Thêm địa chỉ | nine2fine',
            loadComponent: addressForm,
          },
          {
            path: 'addresses/:id/edit',
            title: 'Sửa địa chỉ | nine2fine',
            loadComponent: addressForm,
          },
          {
            path: 'orders',
            title: 'Lịch sử mua hàng | nine2fine',
            loadComponent: () =>
              import('./features/account/orders/orders-page').then((m) => m.OrdersPage),
          },
          {
            path: 'orders/:orderId',
            title: 'Chi tiết đơn hàng | nine2fine',
            loadComponent: () =>
              import('./features/account/orders/order-detail-page').then((m) => m.OrderDetailPage),
          },
          {
            path: 'orders/:orderId/return',
            title: 'Yêu cầu trả hàng | nine2fine',
            loadComponent: () =>
              import('./features/account/orders/return-request-page').then(
                (m) => m.ReturnRequestPage,
              ),
          },
          {
            path: 'vouchers',
            title: 'Phiếu giảm giá | nine2fine',
            loadComponent: () =>
              import('./features/account/vouchers/vouchers-page').then((m) => m.VouchersPage),
          },
          { path: 'wishlist', redirectTo: '/wishlist' },
        ],
      },
      {
        path: '**',
        title: 'Không tìm thấy trang | nine2fine',
        loadComponent: () => import('./shared/ui/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
