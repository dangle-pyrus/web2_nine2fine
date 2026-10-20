import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { IconComponent } from '../../../shared/ui/icon.component';
import { OverlayService } from '../../../shared/ui/overlay.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { getMedia } from '../../../../media/media-manifest';
import { ACCOUNT_API } from '../data-access/account-api';
import { Address } from '../data-access/account-models';
import { accountErrorMessage } from '../account-messages';

/** Figma `address-setting (1)` empty state (102:1416) and list (116:2014). */
@Component({
  selector: 'n2f-addresses-page',
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page-head">
      <h1>Địa chỉ nhận hàng</h1>
      @if (addresses()?.length) {
        <a class="pill" routerLink="/account/addresses/new"
          ><n2f-icon name="reiconPlus" size="18px" /> Thêm địa chỉ</a
        >
      }
    </div>
    @if (error()) {
      <p class="form-error" role="alert">{{ error() }}</p>
    }
    @if (addresses(); as list) {
      @if (!list.length) {
        <p class="lead">
          Bạn chưa có địa chỉ nhận hàng nào. Vui lòng thêm địa chỉ để thuận tiện cho việc mua sắm và
          nhận hàng.
        </p>
        <div class="empty">
          <img class="illustration" [src]="emptyImage.src" alt="" width="368" height="320" />
          <a class="pill" routerLink="/account/addresses/new"
            ><n2f-icon name="reiconPlus" size="18px" /> Thêm địa chỉ</a
          >
        </div>
      } @else {
        <ul class="list">
          @for (address of list; track address.id) {
            <li>
              <div class="info">
                <p class="who">
                  <n2f-icon name="reiconPin" size="22px" /><strong>{{ address.recipient }}</strong
                  ><span class="phone">{{ address.phone }}</span>
                </p>
                <p class="where">
                  {{ address.street }},<br />{{ address.ward.name }}, {{ address.province.name }}
                </p>
              </div>
              <div class="side">
                <div class="tools">
                  <a
                    class="tool"
                    [routerLink]="['/account/addresses', address.id, 'edit']"
                    [attr.aria-label]="'Sửa địa chỉ của ' + address.recipient"
                    title="Sửa"
                    ><n2f-icon name="reiconPen" size="22px"
                  /></a>
                  <button
                    type="button"
                    class="tool danger"
                    [attr.aria-label]="'Xóa địa chỉ của ' + address.recipient"
                    title="Xóa"
                    [disabled]="busyId() === address.id"
                    (click)="remove(address)"
                  >
                    <n2f-icon name="reiconTrash3" size="22px" />
                  </button>
                </div>
                <div class="badges">
                  @if (address.isDefault) {
                    <span class="badge default">Địa chỉ mặc định</span>
                  }
                  @if (address.isReturn) {
                    <span class="badge return">Địa chỉ trả hàng</span>
                  }
                  @if (!address.isDefault) {
                    <button
                      type="button"
                      class="badge action"
                      [disabled]="busyId() === address.id"
                      (click)="makeDefault(address)"
                    >
                      Đặt làm địa chỉ mặc định
                    </button>
                  }
                </div>
              </div>
            </li>
          }
        </ul>
      }
    } @else if (!error()) {
      <p class="state" role="status">Đang tải địa chỉ…</p>
    }
    <p class="sr-status" role="status">{{ status() }}</p>
  `,
  styleUrl: '../ui/account.scss',
  styles: `
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: calc(28 * var(--u) + 4px) 0;
      border-bottom: 1px solid var(--line);
    }
    .who {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 0;
      font-size: max(16px, calc(28 * var(--u)));
    }
    .who strong {
      font-weight: 700;
    }
    .phone {
      padding-left: 12px;
      border-left: 1px solid var(--ink);
      color: var(--muted);
    }
    .where {
      margin: 10px 0 0 34px;
      color: var(--muted);
      font-size: max(14px, calc(22 * var(--u)));
      line-height: 1.6;
    }
    .side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }
    .tools {
      display: flex;
      gap: 4px;
    }
    .tool {
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      background: none;
      color: var(--muted);
    }
    .tool:hover {
      color: var(--ink);
    }
    .tool.danger {
      color: var(--required);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .badge {
      padding: 4px 10px;
      border: 1px solid;
      border-radius: 6px;
      background: #fff;
      font: inherit;
      font-size: max(13px, calc(20 * var(--u)));
      white-space: nowrap;
    }
    .badge.default {
      border-color: #3b9dff;
      color: #1d6fd8;
    }
    .badge.return {
      border-color: #f5a524;
      color: #b45309;
    }
    .badge.action {
      min-height: 32px;
      border-color: #d9d9d9;
      background: #d9d9d9;
      color: var(--ink);
    }
    .badge.action:hover:not(:disabled) {
      border-color: var(--ink);
    }
    @media (max-width: 600px) {
      li {
        flex-direction: column;
      }
      .side {
        flex-direction: row-reverse;
        align-items: center;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressesPage {
  readonly emptyImage = getMedia('empty-address');
  readonly addresses = signal<Address[] | null>(null);
  readonly error = signal('');
  readonly status = signal('');
  readonly busyId = signal<string | null>(null);

  private readonly api = inject(ACCOUNT_API);
  private readonly overlay = inject(OverlayService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
  }

  makeDefault(address: Address): void {
    this.busyId.set(address.id);
    this.api
      .setDefaultAddress(address.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.addresses.set(list);
          this.busyId.set(null);
          this.status.set('Đã đặt làm địa chỉ mặc định.');
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  remove(address: Address): void {
    const data: ConfirmDialogData = {
      title: 'Xóa địa chỉ?',
      message: `${address.street}, ${address.ward.name}, ${address.province.name}`,
      confirmLabel: 'Xóa địa chỉ',
    };
    this.overlay
      .open(ConfirmDialog, data.title, 'modal', data)
      .closed.pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => {
          this.busyId.set(address.id);
          return this.api.deleteAddress(address.id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.status.set('Đã xóa địa chỉ.');
          this.load();
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  private load(): void {
    this.api
      .listAddresses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.addresses.set(list),
        error: (error: unknown) => this.fail(error),
      });
  }

  private fail(error: unknown): void {
    this.busyId.set(null);
    this.error.set(accountErrorMessage(error));
  }
}
