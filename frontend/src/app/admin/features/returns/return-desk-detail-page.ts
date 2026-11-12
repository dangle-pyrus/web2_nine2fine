import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AdminApiError } from '../../data-access/models';
import {
  ADMIN_RETURN_DESK_API,
  AdminReturn,
  returnDeskErrorMessage,
} from '../../data-access/returns-api';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmPageHeader } from '../../ui/page-header';
import { routeParam } from '../../ui/route-param';
import { ReturnPanel } from './return-panel';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; ret: AdminReturn }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

/** `/admin/returns/:id`: one request with its actions (BR-RET-32, 42). */
@Component({
  selector: 'adm-return-desk-detail-page',
  imports: [RouterLink, AdmPageHeader, AdmEmptyState, ReturnPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    <adm-page-header
      [heading]="s.kind === 'ready' ? 'Trả hàng đơn #' + s.ret.orderCode : 'Trả hàng'"
    >
      <a subtitle class="link small" routerLink="/admin/returns">← Danh sách trả hàng</a>
    </adm-page-header>
    <div class="page-body">
      @switch (s.kind) {
        @case ('loading') {
          <p class="secondary" role="status">Đang tải yêu cầu…</p>
        }
        @case ('not-found') {
          <adm-empty
            heading="Không tìm thấy yêu cầu"
            description="Yêu cầu không tồn tại hoặc đã bị xoá."
          >
            <a class="adm-btn" routerLink="/admin/returns">Về danh sách</a>
          </adm-empty>
        }
        @case ('error') {
          <adm-empty kind="error" heading="Không tải được yêu cầu" [description]="s.message">
            <button type="button" class="adm-btn" (click)="retry()">Thử lại</button>
          </adm-empty>
        }
        @case ('ready') {
          <p class="small">
            <a [routerLink]="['/admin/orders', s.ret.orderCode]" data-testid="order-link"
              >Xem đơn gốc #{{ s.ret.orderCode }}</a
            >
          </p>
          <adm-return-panel [ret]="s.ret" (updated)="replace($event)" />
        }
      }
    </div>
  `,
})
export class ReturnDeskDetailPage {
  private readonly api = inject(ADMIN_RETURN_DESK_API);
  private readonly id = routeParam('id');
  private readonly tick = signal(0);
  protected readonly state = signal<LoadState>({ kind: 'loading' });

  constructor() {
    toObservable(computed(() => ({ id: this.id(), tick: this.tick() })))
      .pipe(
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap(({ id }) =>
          this.api.get(id).pipe(
            map((ret): LoadState => ({ kind: 'ready', ret })),
            catchError((error: unknown) =>
              of<LoadState>(
                error instanceof AdminApiError && error.code === 'not-found'
                  ? { kind: 'not-found' }
                  : { kind: 'error', message: returnDeskErrorMessage(error) },
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  replace(ret: AdminReturn): void {
    this.state.set({ kind: 'ready', ret });
  }

  retry(): void {
    this.tick.update((value) => value + 1);
  }
}
