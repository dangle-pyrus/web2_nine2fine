import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdmEmptyState } from '../ui/empty-state';

/**
 * Every back-office page except the orders desk while `adminOrdersMode` is `http` (BR-ADM-36): no
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
      description="Trang này chưa được kết nối với dữ liệu thật. Hiện chỉ có Đơn hàng."
    >
      <a class="adm-btn adm-btn--primary" routerLink="/admin/orders">Về Đơn hàng</a>
    </adm-empty>
  `,
})
export class AdminUnavailablePage {}
