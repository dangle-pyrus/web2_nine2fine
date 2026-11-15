import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminApiError } from '../../data-access/models';
import {
  ADMIN_RETURN_DESK_API,
  AdminReturn,
  returnDeskErrorMessage,
} from '../../data-access/returns-api';
import { AdmIcon } from '../../ui/icon';
import { ReturnPanel } from './return-panel';

/**
 * One return request as a right-hand drawer over the list (BR-RET-32, 42): the panel with its
 * actions. Closes with `true` when a step changed the request so the list reloads.
 */
@Component({
  selector: 'adm-return-detail-drawer',
  imports: [AdmIcon, ReturnPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm' },
  template: `
    <div class="drawer od">
      <header>
        <h2>
          @if (ret(); as r) { Trả hàng đơn #{{ r.orderCode }} } @else { Trả hàng }
        </h2>
        <button
          type="button"
          class="adm-btn adm-btn--sm adm-btn--icon"
          aria-label="Đóng"
          (click)="close()"
        >
          <adm-icon name="reiconX" [size]="16" />
        </button>
      </header>
      <div class="drawer-body">
        @if (ret(); as r) {
          <p>
            <a
              class="link"
              [href]="'/admin/orders?order=' + r.orderCode"
              (click)="openOrder($event, r)"
              data-testid="order-link"
              >Xem đơn gốc #{{ r.orderCode }}</a
            >
          </p>
          <adm-return-panel [ret]="r" [sticky]="true" (updated)="replace($event)" />
        } @else if (error()) {
          <p role="alert">{{ error() }}</p>
          <div><button type="button" class="adm-btn" (click)="load()">Thử lại</button></div>
        } @else {
          <p class="secondary" role="status">Đang tải yêu cầu…</p>
        }
      </div>
    </div>
  `,
})
export class ReturnDetailDrawer {
  private readonly api = inject(ADMIN_RETURN_DESK_API);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly router = inject(Router);
  private readonly id = inject<{ id: string }>(DIALOG_DATA).id;
  private changed = false;
  protected readonly ret = signal<AdminReturn | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.get(this.id).subscribe({
      next: (ret) => this.ret.set(ret),
      error: (e: unknown) =>
        this.error.set(
          e instanceof AdminApiError && e.code === 'not-found'
            ? 'Yêu cầu không tồn tại hoặc đã bị xoá.'
            : returnDeskErrorMessage(e),
        ),
    });
  }

  replace(ret: AdminReturn): void {
    this.changed = true;
    this.ret.set(ret);
  }

  openOrder(event: Event, ret: AdminReturn): void {
    event.preventDefault();
    this.close();
    void this.router.navigate(['/admin/orders'], { queryParams: { order: ret.orderCode } });
  }

  close(): void {
    this.ref.close(this.changed);
  }
}
