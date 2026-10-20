import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from './empty-state.component';

@Component({
  selector: 'n2f-not-found',
  imports: [RouterLink, EmptyStateComponent],
  template:
    '<n2f-empty-state image="/assets/illustrations/page_not_found.svg" heading="Cuộc hẹn này chưa có ở đây." description="Trang bạn tìm không tồn tại hoặc đã được chuyển đi."><a class="button dark" routerLink="/shop">Khám phá bộ sưu tập</a></n2f-empty-state>',
})
export class NotFoundPage {}
