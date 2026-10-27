import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MoneyPipe } from '../../core/format.pipes';
import { ADMIN_PRODUCTS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import type { AdminOrderItem, AdminVariant, ShippingAddress } from '../../data-access/models';

/** Fixing a typo in the address before hand-over saves a failed delivery (Đợt 2). */
@Component({
  selector: 'adm-address-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Sửa địa chỉ giao hàng</h2>
      <p class="dialog-desc">Địa chỉ cũ được ghi vào lịch sử đơn để đối chiếu khi cần.</p>
      <div class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label for="recipient" class="req">Người nhận</label>
            <input
              id="recipient"
              class="input"
              name="recipient"
              [(ngModel)]="value.recipient"
              [attr.aria-invalid]="tried() && !!errors()['recipient']"
            />
            @if (tried() && errors()['recipient']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
          <div class="field">
            <label for="phone" class="req">Số điện thoại</label>
            <input
              id="phone"
              class="input num"
              name="phone"
              inputmode="tel"
              [(ngModel)]="value.phone"
              [attr.aria-invalid]="tried() && !!errors()['phone']"
            />
            @if (tried() && errors()['phone']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
        </div>
        <div class="field">
          <label for="street" class="req">Số nhà, tên đường</label>
          <input
            id="street"
            class="input"
            name="street"
            [(ngModel)]="value.street"
            [attr.aria-invalid]="tried() && !!errors()['street']"
          />
          @if (tried() && errors()['street']; as error) {
            <p class="error">{{ error }}</p>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="ward" class="req">Phường/Xã</label>
            <input
              id="ward"
              class="input"
              name="ward"
              [(ngModel)]="value.ward"
              [attr.aria-invalid]="tried() && !!errors()['ward']"
            />
            @if (tried() && errors()['ward']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
          <div class="field">
            <label for="province" class="req">Tỉnh/Thành phố</label>
            <input
              id="province"
              class="input"
              name="province"
              [(ngModel)]="value.province"
              [attr.aria-invalid]="tried() && !!errors()['province']"
            />
            @if (tried() && errors()['province']; as error) {
              <p class="error">{{ error }}</p>
            }
          </div>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary">Lưu địa chỉ</button>
      </div>
    </form>
  `,
})
export class AddressDialog {
  readonly ref = inject(DialogRef);
  readonly value: ShippingAddress = { ...inject<ShippingAddress>(DIALOG_DATA) };
  readonly tried = signal(false);

  errors(): Record<string, string> {
    const value = this.value;
    const errors: Record<string, string> = {};
    if (!value.recipient.trim()) errors['recipient'] = 'Nhập tên người nhận.';
    if (!/^0\d{9}$/.test(value.phone.replace(/\s/g, '')))
      errors['phone'] = 'Gồm 10 chữ số, bắt đầu bằng 0.';
    if (!value.street.trim()) errors['street'] = 'Nhập số nhà, tên đường.';
    if (!value.ward.trim()) errors['ward'] = 'Nhập phường/xã.';
    if (!value.province.trim()) errors['province'] = 'Nhập tỉnh/thành phố.';
    return errors;
  }

  submit(): void {
    this.tried.set(true);
    if (!Object.keys(this.errors()).length) this.ref.close(this.value);
  }
}

export interface ChangeItemData {
  item: AdminOrderItem;
  /** Variants already on the order, which cannot be picked twice. */
  taken: string[];
  paid: boolean;
}

interface VariantOption {
  variant: AdminVariant;
  label: string;
  delta: number;
  disabled: string | null;
}

/** "Khách nhắn đổi sang size M": swap a line to another variant of the same product (Đợt 2). */
@Component({
  selector: 'adm-change-item-dialog',
  imports: [FormsModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Đổi màu hoặc size</h2>
      <p class="dialog-desc">
        {{ data.item.name }}, đang là {{ data.item.color }} / {{ data.item.size }}, số lượng
        {{ data.item.quantity }}.
      </p>
      <div class="dialog-body">
        @if (error(); as message) {
          <p class="error">{{ message }}</p>
        } @else if (!options()) {
          <p class="secondary">Đang tải biến thể…</p>
        } @else {
          <fieldset class="variants">
            <legend class="sr-only">Biến thể mới</legend>
            @for (option of options(); track option.variant.id) {
              <label class="check" [class.is-disabled]="option.disabled">
                <input
                  type="radio"
                  name="variant"
                  [value]="option.variant.id"
                  [disabled]="!!option.disabled"
                  [checked]="picked() === option.variant.id"
                  (change)="picked.set(option.variant.id)"
                />
                <span
                  >{{ option.label }}
                  @if (option.delta) {
                    <span class="num secondary">
                      ({{ option.delta > 0 ? 'thêm ' : 'bớt '
                      }}{{ abs(option.delta) | admMoney }})</span
                    >
                  }
                  <span class="check-desc">{{
                    option.disabled ?? 'Còn ' + option.variant.inventory + ' trong kho'
                  }}</span></span
                >
              </label>
            } @empty {
              <p class="secondary">Sản phẩm này không có biến thể nào khác.</p>
            }
          </fieldset>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!picked()">
          Đổi biến thể
        </button>
      </div>
    </form>
  `,
  styles: `
    .variants {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border: 0;
      padding: 0;
      margin: 0;
      max-height: 360px;
      overflow: auto;
    }
    .is-disabled {
      opacity: 0.55;
    }
  `,
})
export class ChangeItemDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<ChangeItemData>(DIALOG_DATA);
  private readonly products = inject(ADMIN_PRODUCTS_API);
  protected readonly variants = signal<{ list: AdminVariant[]; price: number } | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly abs = Math.abs;
  readonly picked = signal('');

  protected readonly options = computed<VariantOption[] | null>(() => {
    const loaded = this.variants();
    if (!loaded) return null;
    const { item, taken, paid } = this.data;
    return loaded.list
      .filter((variant) => variant.id !== item.variantId)
      .map((variant) => {
        const delta = ((variant.price ?? loaded.price) - item.unitPrice) * item.quantity;
        return {
          variant,
          label: `${variant.color.name} / ${variant.size}`,
          delta,
          disabled: taken.includes(variant.id)
            ? 'Đã có trong đơn'
            : variant.inventory < item.quantity
              ? 'Hết hàng'
              : delta > 0 && paid
                ? 'Đắt hơn: đơn đã thanh toán nên không đổi được'
                : null,
        };
      });
  });

  constructor() {
    this.products.get(this.data.item.productId).subscribe({
      next: (product) => this.variants.set({ list: product.variants, price: product.price }),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  submit(): void {
    if (this.picked()) this.ref.close(this.picked());
  }
}

const FAILURE_REASONS = [
  'Không liên lạc được người nhận',
  'Khách hẹn giao lại hôm sau',
  'Khách từ chối nhận hàng',
  'Sai địa chỉ giao hàng',
  'Khác',
];

/** Record what the carrier reported, so the next step (call, redeliver, return) is clear. */
@Component({
  selector: 'adm-delivery-failed-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Báo giao không thành công</h2>
      <p class="dialog-desc">
        Đơn chuyển sang "Giao không thành công". Sau đó bạn chọn giao lại hoặc hoàn về kho.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label for="reason" class="req">Lý do hãng vận chuyển báo</label>
          <select id="reason" class="select" name="reason" [(ngModel)]="reason">
            <option value="" disabled>Chọn lý do</option>
            @for (item of reasons; track item) {
              <option [value]="item">{{ item }}</option>
            }
          </select>
        </div>
        @if (reason === 'Khác') {
          <div class="field">
            <label for="other" class="req">Lý do khác</label>
            <input id="other" class="input" name="other" [(ngModel)]="other" />
          </div>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!value()">
          Lưu trạng thái
        </button>
      </div>
    </form>
  `,
})
export class DeliveryFailedDialog {
  readonly ref = inject(DialogRef);
  protected readonly reasons = FAILURE_REASONS;
  reason = '';
  other = '';
  value(): string {
    return this.reason === 'Khác' ? this.other.trim() : this.reason;
  }
  submit(): void {
    if (this.value()) this.ref.close({ reason: this.value() });
  }
}

/** Ending a failed delivery: the parcel comes back and, usually, goes back on the shelf. */
@Component({
  selector: 'adm-return-to-sender-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="ref.close({ restock })">
      <h2>Hoàn đơn #{{ data.id }} về kho?</h2>
      <p class="dialog-desc">
        Dùng khi hãng vận chuyển đã trả hàng về shop. Đơn kết thúc ở "Đã hoàn về shop" và không mở
        lại được.
      </p>
      <div class="dialog-body">
        <label class="check">
          <input type="checkbox" name="restock" [(ngModel)]="restock" />
          <span
            >Nhập lại {{ data.quantity }} sản phẩm vào kho<span class="check-desc"
              >Bỏ chọn nếu hàng bị hư hỏng khi vận chuyển.</span
            ></span
          >
        </label>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--danger">Hoàn về kho</button>
      </div>
    </form>
  `,
})
export class ReturnToSenderDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ id: string; quantity: number }>(DIALOG_DATA);
  restock = true;
}

const SUGGESTED_TAGS = ['Khách quen', 'Gói quà', 'Giao gấp', 'Ưu tiên', 'Đã gọi xác nhận'];

/** Bulk "Gắn tag": one tag added to every selected order, existing tags kept. */
@Component({
  selector: 'adm-tag-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Gắn tag cho {{ data.count }} đơn</h2>
      <p class="dialog-desc">Tag chỉ nhân viên thấy. Tag sẵn có của từng đơn được giữ nguyên.</p>
      <div class="dialog-body">
        <div class="field">
          <label for="tag" class="req">Tag</label>
          <input
            id="tag"
            class="input"
            name="tag"
            autocomplete="off"
            maxlength="40"
            [(ngModel)]="tag"
          />
        </div>
        <div class="row wrap" role="group" aria-label="Tag hay dùng">
          @for (item of suggested; track item) {
            <button type="button" class="chip" (click)="tag = item">{{ item }}</button>
          }
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [disabled]="!tag.trim()">
          Gắn tag
        </button>
      </div>
    </form>
  `,
  styles: `
    .wrap {
      flex-wrap: wrap;
    }
  `,
})
export class TagDialog {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ count: number }>(DIALOG_DATA);
  protected readonly suggested = SUGGESTED_TAGS;
  tag = '';
  submit(): void {
    if (this.tag.trim()) this.ref.close(this.tag.trim());
  }
}
