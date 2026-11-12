import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
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
import { AdmBadge } from '../../ui/badge';
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
 * "Yêu cầu trả hàng" block (Slice 9, BR-RET-32, 42, 43), used by `/admin/returns/:id` and by the
 * order detail. The buttons are exactly `allowedActions`; staff never see the refund button or the
 * full account number. The block changes only with the server's answer.
 */
@Component({
  selector: 'adm-return-panel',
  imports: [AdmBadge, MoneyPipe, DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = ret();
    <section
      class="card return-panel"
      aria-labelledby="return-panel-title"
      data-testid="return-panel"
    >
      <header class="head">
        <h2 id="return-panel-title">Yêu cầu trả hàng</h2>
        <adm-badge [spec]="badge()" data-testid="return-badge" />
        @if (r.overdue) {
          <span class="chip chip--static">Quá hạn xử lý</span>
        }
      </header>
      @if (notice(); as text) {
        <p class="small" role="status" data-testid="return-notice">{{ text }}</p>
      }
      <dl class="info">
        <div>
          <dt>Gửi lúc</dt>
          <dd>{{ r.requestedAt | admDateTime }}</dd>
        </div>
        <div>
          <dt>Người nhận</dt>
          <dd>{{ r.recipient.name }} · {{ r.recipient.phone }} · {{ r.recipient.email }}</dd>
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

      <table class="table" aria-label="Sản phẩm trả">
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th class="num">Khách trả</th>
            <th class="num">Đạt</th>
            <th>Xử lý</th>
            <th class="num">Tiền hàng</th>
          </tr>
        </thead>
        <tbody>
          @for (line of r.lines; track line.variantId) {
            <tr>
              <td>
                {{ line.name }}
                <div class="cell-sub">{{ line.color }} / {{ line.size }} · {{ line.sku }}</div>
              </td>
              <td class="num">{{ line.quantity }}</td>
              <td class="num">{{ line.acceptedQuantity ?? '—' }}</td>
              <td>
                {{
                  line.disposition === 'restock'
                    ? 'Nhập lại kho'
                    : line.disposition === 'writeoff'
                      ? 'Hỏng, không nhập'
                      : '—'
                }}
              </td>
              <td class="num">{{ line.goodsAmount | admMoney }}</td>
            </tr>
          }
        </tbody>
      </table>

      <dl class="info amount" data-testid="return-money">
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
        <div>
          <dt>Hoàn về</dt>
          <dd data-testid="return-refund-to">
            @if (r.refundTo.type === 'account') {
              {{ r.refundTo.bank }} ·
              @if (r.refundTo.accountNumber) {
                <span data-testid="return-account-number">{{ r.refundTo.accountNumber }}</span>
              } @else {
                ****{{ r.refundTo.last4 }}
              }
              · {{ r.refundTo.accountName }}
            } @else {
              Tài khoản đã thanh toán đơn
            }
            @if (r.state === 'received' && !canRefund() && r.refundTo.type === 'account') {
              <div class="cell-sub" data-testid="admin-only-note">
                Chỉ quản trị viên chuyển tiền.
              </div>
            }
          </dd>
        </div>
        @if (r.refundReference) {
          <div>
            <dt>Mã giao dịch</dt>
            <dd>{{ r.refundReference }}</dd>
          </div>
        }
      </dl>

      @if (r.photos.length) {
        <ul class="photos" aria-label="Ảnh khách gửi">
          @for (photo of r.photos; track photo.id) {
            <li>
              <a [href]="photo.url" target="_blank" rel="noopener">
                <img [src]="photo.url" alt="Ảnh minh chứng" width="96" height="96" loading="lazy" />
              </a>
            </li>
          }
        </ul>
      }

      <h3 class="small">Lịch sử xử lý</h3>
      <ol class="history" aria-label="Lịch sử xử lý">
        @for (entry of r.history; track $index) {
          <li>
            <span class="secondary">{{ entry.at | admDateTime }}</span>
            {{ historyLabel(entry.kind) }}
            <span class="secondary"
              >·
              {{
                entry.actor.type === 'customer'
                  ? 'Khách'
                  : entry.actor.type === 'system'
                    ? 'Hệ thống'
                    : entry.actor.name
              }}</span
            >
            @if (entry.note) {
              <div class="cell-sub">{{ entry.note }}</div>
            }
          </li>
        }
      </ol>

      @if (r.allowedActions.length) {
        <div class="actions" data-testid="return-actions">
          @for (action of r.allowedActions; track action) {
            <button
              type="button"
              class="adm-btn"
              [class.adm-btn--primary]="action !== 'reject'"
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
      gap: 16px;
      padding: 20px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .head h2 {
      margin: 0;
      font-size: 16px;
    }
    .info {
      display: grid;
      gap: 8px;
      margin: 0;
    }
    .info div {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
    }
    .info dt {
      color: var(--adm-text-secondary, #6b7280);
    }
    .info dd {
      margin: 0;
    }
    .photos,
    .history {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .history {
      flex-direction: column;
      gap: 6px;
    }
    .photos img {
      border-radius: 6px;
      object-fit: cover;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class ReturnPanel {
  readonly ret = input.required<AdminReturn>();
  /** The server answered a write (or showed it was lost): the host replaces its copy. */
  readonly updated = output<AdminReturn>();

  private readonly dialogs = inject(AdminDialogs);
  protected readonly labels = ACTION_LABELS;
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
