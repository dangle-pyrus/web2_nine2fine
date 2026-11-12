import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_CONFIG } from '../../core/api-config';
import { AdmEmptyState } from '../ui/empty-state';

/**
 * Every back-office page except the orders desk (and, with `adminCatalogMode` `http`, products,
 * inventory and promotions; with `adminUsersMode` `http`, customers and staff; with `adminInsightsMode` `http`, the dashboard,
 * reports, store settings and audit log) while `adminOrdersMode` is `http` (BR-ADM-36): no
 * mock API is injected here, so no mock data shows up and no request leaves the page.
 */
@Component({
  selector: 'adm-unavailable-page',
  imports: [AdmEmptyState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-empty
      kind="first"
      image="/assets/illustrations/page_not_found.svg"
      heading="Chưa khả dụng"
      [description]="description"
    >
      <a class="adm-btn adm-btn--primary" routerLink="/admin/orders">Về Đơn hàng</a>
    </adm-empty>
  `,
})
export class AdminUnavailablePage {
  protected readonly description = `Trang này chưa được kết nối với dữ liệu thật. Hiện có ${this.available()}.`;

  private available(): string {
    const config = inject(API_CONFIG);
    const modules = ['Đơn hàng'];
    if (config.adminCatalogMode === 'http') modules.push('Sản phẩm', 'Tồn kho', 'Khuyến mãi');
    if (config.adminUsersMode === 'http') modules.push('Khách hàng', 'Cài đặt › Nhân viên');
    if (config.returnsMode === 'http') modules.push('Trả hàng');
    if (config.adminInsightsMode === 'http')
      modules.unshift('Tổng quan', 'Báo cáo', 'Cài đặt › Cửa hàng', 'Cài đặt › Nhật ký');
    return `${modules.slice(0, -1).join(', ')}${modules.length > 1 ? ' và ' : ''}${modules.at(-1)}`;
  }
}
