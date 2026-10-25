import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdmEmptyState } from '../ui/empty-state';

@Component({
  selector: 'adm-not-found-page',
  imports: [AdmEmptyState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-empty
      kind="first"
      image="/assets/illustrations/page_not_found.svg"
      heading="Không tìm thấy trang"
      description="Đường dẫn có thể đã thay đổi hoặc bạn không có quyền xem trang này."
    >
      <a class="adm-btn adm-btn--primary" routerLink="/admin">Về Tổng quan</a>
    </adm-empty>
  `,
})
export class AdminNotFoundPage {}
