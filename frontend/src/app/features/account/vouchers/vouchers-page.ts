import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { getMedia } from '../../../../media/media-manifest';
import { ACCOUNT_API } from '../data-access/account-api';
import { Voucher } from '../data-access/account-models';
import { formatDate } from '../../orders/order-status';

type VoucherState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Voucher[] };

/** Figma `voucher (1)` empty state (116:2480) and ticket list (116:2798). */
@Component({
  selector: 'n2f-vouchers-page',
  imports: [RouterLink, IconComponent],
  template: `
    <h1>Phiếu giảm giá của bạn</h1>
    @switch (state().status) {
      @case ('loading') {
        <p class="state" role="status">Đang tải phiếu giảm giá…</p>
      }
      @case ('error') {
        <p class="form-error" role="alert">Chưa thể tải phiếu giảm giá. Vui lòng thử lại.</p>
      }
      @default {
        @if (!vouchers().length) {
          <p class="lead">Bạn chưa có mã giảm giá nào.</p>
          <img class="illustration" [src]="emptyImage.src" alt="" width="550" height="320" />
        } @else {
          <ul class="tickets">
            @for (voucher of vouchers(); track voucher.id) {
              <li class="ticket">
                <div class="stub">
                  <img src="/assets/brand/logo.svg" alt="nine2fine" width="140" height="28" />
                </div>
                <div class="body">
                  <p class="headline">
                    <strong>{{ voucher.headline }}</strong> {{ voucher.subline }}
                  </p>
                  <p class="terms">HSD: {{ expiry(voucher) }} - {{ voucher.conditions }}</p>
                  <div class="foot">
                    <span class="code-label">Mã:</span>
                    <code>{{ voucher.code }}</code>
                    <button
                      type="button"
                      class="copy"
                      [attr.aria-label]="'Sao chép mã ' + voucher.code"
                      [title]="copiedId() === voucher.id ? 'Đã sao chép' : 'Sao chép mã'"
                      (click)="copy(voucher)"
                    >
                      <n2f-icon
                        [name]="copiedId() === voucher.id ? 'reiconCopySuccess' : 'reiconCopy'"
                        size="18px"
                      />
                    </button>
                    <a class="use" routerLink="/shop">Dùng ngay</a>
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      }
    }
    <p class="sr-status" role="status">{{ copiedId() ? 'Đã sao chép mã giảm giá.' : '' }}</p>
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    h1 {
      margin-bottom: calc(40 * var(--u));
    }
    .tickets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
      gap: 16px 20px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ticket {
      --notch: 14px;
      position: relative;
      display: grid;
      grid-template-columns: minmax(96px, 30%) 1fr;
      min-height: 150px;
      border-radius: 6px;
      background: #f9f9f9;
      box-shadow: 0 2px 6px #0002;
      /* Side notches cut out of the ticket edge, as in Figma. */
      mask:
        radial-gradient(circle var(--notch) at 0 50%, #0000 98%, #000) left / 51% 100% no-repeat,
        radial-gradient(circle var(--notch) at 100% 50%, #0000 98%, #000) right / 51% 100% no-repeat;
    }
    .stub {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 12px 16px 20px;
      border-right: 2px dashed #d9d9d9;
    }
    .stub img {
      width: min(100%, 140px);
      height: auto;
    }
    .body {
      display: flex;
      flex-direction: column;
      padding: 16px 24px 16px 18px;
    }
    .headline {
      margin: 0;
      font-size: 13px;
    }
    .headline strong {
      font-size: 22px;
      font-weight: 800;
    }
    .terms {
      margin: 6px 0 12px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: auto;
    }
    .code-label {
      color: var(--muted);
      font-size: 12px;
    }
    code {
      padding: 3px 6px;
      border-radius: 4px;
      background: #d9d9d9;
      font-family: inherit;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .copy {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
    }
    .use {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      margin-left: auto;
      padding: 0 18px;
      border-radius: 999px;
      background: var(--brand);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
    }
    .use:hover {
      background: var(--brand-hover);
      color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VouchersPage {
  readonly emptyImage = getMedia('empty-vouchers');
  readonly copiedId = signal<string | null>(null);
  readonly state = toSignal(
    inject(ACCOUNT_API)
      .listVouchers()
      .pipe(
        map((items): VoucherState => ({ status: 'ready', items })),
        catchError(() => of<VoucherState>({ status: 'error' })),
      ),
    { initialValue: { status: 'loading' } as VoucherState },
  );

  vouchers(): Voucher[] {
    const state = this.state();
    return state.status === 'ready' ? state.items : [];
  }

  expiry(voucher: Voucher): string {
    return formatDate(voucher.expiresAt);
  }

  copy(voucher: Voucher): void {
    navigator.clipboard
      ?.writeText(voucher.code)
      .then(() => this.copiedId.set(voucher.id))
      .catch(() => this.copiedId.set(null));
  }
}
