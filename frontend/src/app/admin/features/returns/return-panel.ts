import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DateTimePipe, MoneyPipe } from '../../core/format.pipes';
import type { BadgeSpec } from '../../core/status';
import {
  AdminReturn,
  AdminReturnAction,
  AdminReturnState,
  RETURN_REASON_LABELS,
  RETURN_STATE_LABELS,
} from '../../data-access/returns-api';
import { AdminDialogs } from '../../ui/dialogs';
import { mediaSrc } from '../content/media-picker';
import { AdmBadge } from '../../ui/badge';
import { AdmCopyButton } from '../../ui/copy-button';
import { AdmIcon } from '../../ui/icon';
import {
  ReturnActionDialog,
  ReturnActionDialogData,
  ReturnActionOutcome,
} from './return-action-dialog';

const TONES: Record<AdminReturnState, BadgeSpec['tone']> = {
  requested: 'warning',
  approved: 'info',
  received: 'warning',
  refunded: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
};

const ACTION_LABELS: Record<AdminReturnAction, string> = {
  approve: 'Duyệt',
  reject: 'Từ chối / đóng',
  receive: 'Nhận hàng & kiểm',
  refund: 'Xác nhận đã hoàn tiền',
};

const HISTORY_LABELS: Record<string, string> = {
  return_requested: 'Khách gửi yêu cầu',
  return_approved: 'Đã duyệt',
  return_rejected: 'Từ chối / đóng',
  return_received: 'Đã nhận hàng trả',
  return_refunded: 'Đã hoàn tiền',
  return_cancelled: 'Khách huỷ yêu cầu',
};

/**
 * "Yêu cầu trả hàng" block (Slice 9, BR-RET-32, 42, 43), used by the return drawer and by the
 * order detail drawer. The buttons are exactly `allowedActions`; staff never see the refund button or the
 * full account number. The block changes only with the server's answer.
 */
@Component({
  selector: 'adm-return-panel',
  imports: [RouterLink, AdmBadge, AdmCopyButton, AdmIcon, MoneyPipe, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = ret();
    <section class="return-panel" aria-labelledby="return-panel-title" data-testid="return-panel">
      <header class="head">
        <h2 id="return-panel-title">Yêu cầu trả hàng</h2>
        <adm-badge [spec]="badge()" data-testid="return-badge" />
      </header>
      @if (notice(); as text) {
        <p role="status" data-testid="return-notice">{{ text }}</p>
      }

      <section class="part" aria-labelledby="rp-person">
        <h3 id="rp-person">Người nhận</h3>
        <ul class="person frame">
          <li>
            <adm-icon name="reiconUserCircle" [size]="18" />
            <span class="cell-title">{{ r.recipient.name }}</span>
          </li>
          <li>
            <adm-icon name="reiconPhone" [size]="18" /> <span>{{ r.recipient.phone }}</span>
          </li>
          <li>
            <adm-icon name="reiconEnvelope" [size]="18" /> <span>{{ r.recipient.email }}</span>
          </li>
        </ul>
      </section>

      <section class="part" aria-labelledby="rp-info">
        <h3 id="rp-info">Thông tin yêu cầu</h3>
        <dl class="info frame">
          <div>
            <dt>Gửi lúc</dt>
            <dd>{{ r.requestedAt | admDateTime }}</dd>
          </div>
          <div>
            <dt>Lý do</dt>
            <dd>
              {{ reasonLabel() }}
              <span class="secondary"
                >({{ r.fault === 'shop' ? 'lỗi của shop' : 'lỗi của khách' }})</span
              >
            </dd>
          </div>
          @if (r.detail) {
            <div>
              <dt>Mô tả</dt>
              <dd>{{ r.detail }}</dd>
            </div>
          }
          @if (r.conditionAck) {
            <div>
              <dt>Khách xác nhận</dt>
              <dd>Còn nguyên tem nhãn, chưa qua sử dụng, chưa giặt</dd>
            </div>
          }
          @if (r.approveNote) {
            <div>
              <dt>Hướng dẫn đã gửi</dt>
              <dd>{{ r.approveNote }}</dd>
            </div>
          }
          @if (r.carrier || r.trackingNumber) {
            <div>
              <dt>Vận chuyển</dt>
              <dd>{{ r.carrier }} {{ r.trackingNumber }}</dd>
            </div>
          }
          @if (r.rejectNote) {
            <div>
              <dt>Lý do từ chối</dt>
              <dd>{{ r.rejectNote }}</dd>
            </div>
          }
          @if (r.receiveNote) {
            <div>
              <dt>Ghi chú kiểm hàng</dt>
              <dd>{{ r.receiveNote }}</dd>
            </div>
          }
        </dl>
      </section>

      <section class="part" aria-labelledby="rp-lines">
        <h3 id="rp-lines">Sản phẩm trả</h3>
        <ul class="lines frame" aria-label="Sản phẩm trả">
          @for (line of r.lines; track line.variantId) {
            <li>
              <img class="thumb" [src]="src(line.mediaId)" alt="" />
              <div class="line-main">
                <span class="cell-title">{{ line.name }}</span>
                <p class="small secondary">{{ line.color }} / {{ line.size }} × {{ line.quantity }}</p>
                @if (line.acceptedQuantity !== undefined) {
                  <p class="small secondary">
                    Đạt {{ line.acceptedQuantity }}@if (line.disposition) { ·
                    {{ line.disposition === 'restock' ? 'Nhập lại kho' : 'Hỏng, không nhập' }} }
                  </p>
                }
              </div>
              <p class="num">{{ line.goodsAmount | admMoney }}</p>
            </li>
          }
        </ul>
      </section>

      <section class="part" aria-labelledby="rp-money">
        <h3 id="rp-money">Hoàn tiền</h3>
        <dl class="info frame" data-testid="return-money">
          <div>
            <dt>Tiền hàng</dt>
            <dd>{{ r.amount.goodsAmount | admMoney }}</dd>
          </div>
          @if (r.amount.shippingRefund) {
            <div>
              <dt>Hoàn phí giao</dt>
              <dd>{{ r.amount.shippingRefund | admMoney }}</dd>
            </div>
          }
          @if (r.amount.returnShippingFee) {
            <div>
              <dt>Phí gửi trả</dt>
              <dd>−{{ r.amount.returnShippingFee | admMoney }}</dd>
            </div>
          }
          <div>
            <dt>
              {{
                r.refundedAmount !== undefined
                  ? 'Đã hoàn'
                  : r.amount.final
                    ? 'Số tiền hoàn (đã chốt)'
                    : 'Dự kiến hoàn'
              }}
            </dt>
            <dd data-testid="return-amount">
              <strong>{{ r.refundedAmount ?? r.amount.amount | admMoney }}</strong>
            </dd>
          </div>
          @if (r.refundTo.type !== 'account') {
            <div>
              <dt>Hoàn về</dt>
              <dd data-testid="return-refund-to">
                @if (r.paymentMethod === 'cod') {
                  Khách chưa khai tài khoản nhận hoàn tiền
                  <div class="cell-sub">Liên hệ khách qua {{ r.recipient.phone }} để lấy số tài khoản.</div>
                } @else {
                  Tài khoản đã chuyển khoản thanh toán đơn
                }
              </dd>
            </div>
          }
          @if (r.refundReference) {
            <div>
              <dt>Mã giao dịch</dt>
              <dd>{{ r.refundReference }}</dd>
            </div>
          }
        </dl>
      </section>

      @if (r.refundTo.type === 'account') {
        <section class="part" aria-labelledby="rp-account">
          <h3 id="rp-account">Tài khoản nhận hoàn tiền</h3>
          <dl class="info frame" data-testid="return-refund-to">
            <div>
              <dt>Ngân hàng</dt>
              <dd>{{ r.refundTo.bank }}</dd>
            </div>
            <div>
              <dt>Số tài khoản</dt>
              <dd>
                @if (r.refundTo.accountNumber) {
                  <span class="mono" data-testid="return-account-number">{{
                    r.refundTo.accountNumber
                  }}</span>
                  <adm-copy [value]="r.refundTo.accountNumber" label="số tài khoản" />
                } @else {
                  <span class="mono">****{{ r.refundTo.last4 }}</span>
                }
              </dd>
            </div>
            <div>
              <dt>Chủ tài khoản</dt>
              <dd>
                {{ r.refundTo.accountName }}
                @if (r.refundTo.accountName) {
                  <adm-copy [value]="r.refundTo.accountName" label="tên chủ tài khoản" />
                }
              </dd>
            </div>
          </dl>
          @if (!r.refundTo.accountNumber) {
            <p class="cell-sub" data-testid="admin-only-note">
              @if (r.state === 'refunded') {
                Đã hoàn tiền: số tài khoản đầy đủ đã được xoá.
              } @else if (!sticky()) {
                Số đầy đủ xem ở
                <a class="link" routerLink="/admin/returns" [queryParams]="{ return: r.id }"
                  >màn Trả hàng</a
                > (quản
                trị viên).
              } @else {
                Chỉ quản trị viên xem số đầy đủ và chuyển tiền.
              }
            </p>
          }
        </section>
      }

      @if (r.photos.length) {
        <section class="part" aria-labelledby="rp-photos">
          <h3 id="rp-photos">Ảnh khách gửi</h3>
          <ul class="photos frame" aria-label="Ảnh khách gửi">
            @for (photo of r.photos; track photo.id) {
              <li>
                <a [href]="photo.url" target="_blank" rel="noopener">
                  <img
                    [src]="photo.url"
                    alt="Ảnh minh chứng"
                    width="96"
                    height="96"
                    loading="lazy"
                  />
                </a>
              </li>
            }
          </ul>
        </section>
      }

      <section class="part" aria-labelledby="rp-history">
        <h3 id="rp-history">Lịch sử xử lý</h3>
        <ol class="history frame" aria-label="Lịch sử xử lý">
          @for (entry of r.history; track $index) {
            <li>
              <span class="marker" aria-hidden="true"></span>
              <div>
                <p class="title">{{ historyLabel(entry.kind) }}</p>
                <p class="meta">
                  {{ entry.at | admDateTime }} ·
                  {{
                    entry.actor.type === 'customer'
                      ? 'Khách'
                      : entry.actor.type === 'system'
                        ? 'Hệ thống'
                        : entry.actor.name
                  }}
                </p>
                @if (entry.note) {
                  <p class="meta">{{ entry.note }}</p>
                }
              </div>
            </li>
          }
        </ol>
      </section>

      @if (r.allowedActions.length) {
        <div class="actions" [class.is-sticky]="sticky()" data-testid="return-actions">
          @for (action of r.allowedActions; track action) {
            <button
              type="button"
              class="adm-btn adm-btn--lg"
              [class.adm-btn--primary]="action !== 'reject'"
              [class.push]="action !== 'reject'"
              [attr.data-action]="action"
              (click)="open(action)"
            >
              {{ labels[action] }}
            </button>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .return-panel {
      display: grid;
      gap: 28px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    h2,
    h3 {
      margin: 0;
      font-size: 20px;
      line-height: 28px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
    h3 {
      margin-bottom: 12px;
    }
    .frame {
      margin: 0;
      padding: 16px;
      border-radius: var(--adm-radius-lg);
      background: var(--adm-muted);
    }
    .info {
      display: grid;
      gap: 10px;
    }
    .info div {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 12px;
    }
    .info dt {
      color: var(--adm-text-secondary);
    }
    .info dd {
      margin: 0;
    }
    .lines,
    .photos,
    .history {
      list-style: none;
      display: grid;
      gap: 12px;
    }
    .lines li {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px;
    }
    .thumb {
      width: 48px;
      height: 48px;
      border-radius: var(--adm-radius-md);
      background: var(--adm-muted-strong);
      object-fit: cover;
    }
    .person {
      list-style: none;
      display: grid;
      gap: 10px;
    }
    .person li {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .person adm-icon {
      color: var(--adm-text-tertiary);
    }
    .photos {
      grid-auto-flow: column;
      grid-auto-columns: max-content;
      justify-content: start;
      gap: 8px;
    }
    .photos img {
      border-radius: var(--adm-radius-md);
      object-fit: cover;
    }
    .history {
      gap: 16px;
    }
    .history li {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr);
      gap: 12px;
    }
    .marker {
      width: 8px;
      height: 8px;
      margin-top: 7px;
      border-radius: 50%;
      background: var(--adm-text-tertiary);
    }
    .title {
      margin: 0;
      font-weight: 500;
    }
    .meta {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--adm-text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .actions.is-sticky {
      position: sticky;
      bottom: -24px;
      margin: 0 -24px -24px;
      padding: 16px 24px;
      background: #fff;
      box-shadow: 0 -8px 16px -8px rgba(0, 0, 0, 0.1);
    }
    .push {
      margin-left: auto;
    }
  `,
})
export class ReturnPanel {
  readonly ret = input.required<AdminReturn>();
  /** In a drawer the buttons stay at the bottom of the scrolled body. */
  readonly sticky = input(false);
  /** The server answered a write (or showed it was lost): the host replaces its copy. */
  readonly updated = output<AdminReturn>();

  private readonly dialogs = inject(AdminDialogs);
  protected readonly labels = ACTION_LABELS;
  protected readonly src = mediaSrc;
  protected readonly notice = signal('');
  protected readonly badge = computed<BadgeSpec>(() => ({
    label: RETURN_STATE_LABELS[this.ret().state],
    tone: TONES[this.ret().state],
  }));
  protected readonly canRefund = computed(() => this.ret().allowedActions.includes('refund'));

  protected reasonLabel(): string {
    return RETURN_REASON_LABELS[this.ret().reason];
  }
  protected historyLabel(kind: string): string {
    return HISTORY_LABELS[kind] ?? kind;
  }

  protected open(kind: AdminReturnAction): void {
    this.notice.set('');
    this.dialogs
      .modal<ReturnActionDialogData, ReturnActionOutcome>(ReturnActionDialog, {
        ret: this.ret(),
        kind,
      })
      .closed.subscribe((outcome) => {
        if (!outcome) return;
        this.notice.set(outcome.message);
        if (outcome.ret) this.updated.emit(outcome.ret);
      });
  }
}
