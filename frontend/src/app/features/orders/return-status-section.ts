import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { PricePipe } from '../../shared/commerce/price.pipe';
import { Order, ReturnCase } from './order-models';
import { RETURN_REASONS, RETURN_STATE_LABEL } from './order-returns';
import { formatDate, formatDateTime } from './order-status';
import { RETURNS_API, ReturnAudience, returnErrorMessage } from './returns-api';

/**
 * "Yêu cầu trả hàng" block of an API order (Slice 9, BR-RET-20, 23): state, lines, refund amount,
 * where the refund goes (bank + last 4 digits only), the shop's note and the cancel button while the
 * request is still waiting. Photos are same-origin URLs that need the session cookie.
 */
@Component({
  selector: 'n2f-return-status',
  imports: [PricePipe],
  template: `
    @let r = request();
    <section class="return" aria-labelledby="return-state-title" data-testid="return-status">
      <h2 class="caps" id="return-state-title">Yêu cầu trả hàng</h2>
      <p class="state" [class]="'state ' + r.state" data-testid="return-state">
        {{ stateLabel(r) }}
      </p>
      @if (r.state === 'rejected' && r.rejectNote) {
        <p class="note">Lý do: {{ r.rejectNote }}</p>
      }
      @if (r.state === 'approved') {
        @if (r.instructions || r.approveNote) {
          <p class="note">{{ r.instructions || r.approveNote }}</p>
        }
        @if (r.carrier || r.trackingNumber) {
          <p class="note">
            Đơn vị vận chuyển: {{ r.carrier }}
            {{ r.trackingNumber ? '· Mã ' + r.trackingNumber : '' }}
          </p>
        }
      }
      <dl>
        <div>
          <dt>Gửi lúc</dt>
          <dd>{{ dateTime(r.requestedAt) }}</dd>
        </div>
        <div>
          <dt>Lý do</dt>
          <dd>{{ reasonLabel(r) }}</dd>
        </div>
        <div>
          <dt>Sản phẩm trả</dt>
          <dd>
            @for (line of r.lines; track line.variantId) {
              <span class="line"
                >{{ line.name }} ({{ line.color }} / {{ line.size }}) × {{ line.quantity }}
                @if (
                  line.acceptedQuantity !== undefined && line.acceptedQuantity !== line.quantity
                ) {
                  <small>(đạt {{ line.acceptedQuantity }})</small>
                }
              </span>
            }
          </dd>
        </div>
        @if (r.state !== 'rejected' && r.state !== 'cancelled') {
          <div>
            <dt>
              {{
                r.state === 'refunded'
                  ? 'Đã hoàn'
                  : r.amount.final
                    ? 'Số tiền hoàn'
                    : 'Dự kiến hoàn'
              }}
            </dt>
            <dd data-testid="return-amount">
              {{ r.refundedAmount ?? r.amount.amount | vnd }}
              <small data-testid="return-amount-breakdown">
                Tiền hàng {{ r.amount.goodsAmount | vnd }}
                @if (r.amount.shippingRefund) {
                  · hoàn phí giao ban đầu +{{ r.amount.shippingRefund | vnd }}
                }
                @if (r.amount.returnShippingFee) {
                  · phí gửi trả −{{ r.amount.returnShippingFee | vnd }}
                }
              </small>
              @if (!r.amount.final) {
                <small>Dự kiến, chốt sau khi nine2fine kiểm hàng.</small>
              }
            </dd>
          </div>
          <div>
            <dt>Hoàn về</dt>
            <dd data-testid="return-refund-to">
              @if (r.refundTo.type === 'account') {
                {{ r.refundTo.bank }} · ****{{ r.refundTo.last4 }} · {{ r.refundTo.accountName }}
              } @else {
                Tài khoản đã thanh toán đơn này
              }
            </dd>
          </div>
        }
        @if (r.state === 'received' && r.expectedRefundBy) {
          <div>
            <dt>Dự kiến hoàn</dt>
            <dd>Trước {{ date(r.expectedRefundBy) }}</dd>
          </div>
        }
        @if (r.detail) {
          <div>
            <dt>Mô tả</dt>
            <dd>{{ r.detail }}</dd>
          </div>
        }
      </dl>
      @if (r.photos.length) {
        <ul class="photos" aria-label="Ảnh bạn đã gửi">
          @for (photo of r.photos; track photo.id) {
            <li>
              <img [src]="photo.url" alt="Ảnh minh chứng" width="72" height="72" loading="lazy" />
            </li>
          }
        </ul>
      }
      <!-- RET-08: cancel only while the shop has not acted yet (state requested). -->
      @if (r.canCancel && r.state === 'requested') {
        @if (confirming()) {
          <p class="note" role="status">
            Huỷ yêu cầu trả hàng này? Bạn có thể gửi lại nếu còn hạn.
          </p>
          <div class="actions">
            <button type="button" class="pill" [disabled]="busy()" (click)="cancel()">
              {{ busy() ? 'Đang huỷ…' : 'Xác nhận huỷ' }}
            </button>
            <button
              type="button"
              class="pill outline"
              [disabled]="busy()"
              (click)="confirming.set(false)"
            >
              Giữ yêu cầu
            </button>
          </div>
        } @else {
          <div class="actions">
            <button
              type="button"
              class="pill outline"
              data-testid="return-cancel"
              (click)="confirming.set(true)"
            >
              Huỷ yêu cầu trả hàng
            </button>
          </div>
        }
      } @else if (r.state === 'approved') {
        <p class="hint">
          Yêu cầu đã được duyệt nên không huỷ trực tuyến được. Cần hỗ trợ vui lòng liên hệ
          nine2fine.
        </p>
      }
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .return {
      margin-top: 24px;
      padding: 20px 24px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .state {
      margin: 8px 0 0;
      font-size: 17px;
      font-weight: 700;
    }
    .note,
    .hint {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    dl {
      display: grid;
      gap: 10px;
      margin: 16px 0 0;
    }
    dl div {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 12px;
    }
    dt {
      color: var(--muted);
      font-size: 14px;
    }
    dd {
      margin: 0;
    }
    small {
      display: block;
      color: var(--muted);
      font-size: 13px;
    }
    .line {
      display: block;
    }
    .photos {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .photos img {
      border-radius: 8px;
      object-fit: cover;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    @media (max-width: 700px) {
      dl div {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnStatusSection {
  readonly order = input.required<Order>();
  readonly request = input.required<ReturnCase>();
  /** A guest cancels through `/orders/{code}/return/cancel` with the lookup grant. */
  readonly audience = input<ReturnAudience>('member');
  /** The order moved on (cancelled request, lost race): the page reloads it. */
  readonly changed = output<void>();

  private readonly api = inject(RETURNS_API);
  readonly busy = signal(false);
  readonly confirming = signal(false);
  readonly error = signal('');

  stateLabel(request: ReturnCase): string {
    return RETURN_STATE_LABEL[request.state];
  }
  reasonLabel(request: ReturnCase): string {
    return (
      RETURN_REASONS.find((reason) => reason.value === request.reason)?.label ?? request.reason
    );
  }
  date(iso: string): string {
    return formatDate(iso);
  }
  dateTime(iso: string): string {
    return formatDateTime(iso);
  }

  cancel(): void {
    this.busy.set(true);
    this.error.set('');
    this.api
      .cancel(this.order().id, this.audience())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.confirming.set(false);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.error.set(returnErrorMessage(error, this.audience()));
          this.confirming.set(false);
          // The request moved on (approved by the shop meanwhile): show where it is now.
          this.changed.emit();
        },
      });
  }
}
