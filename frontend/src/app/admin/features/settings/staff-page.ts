import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import { RelativePipe } from '../../core/format.pipes';
import { PERMISSION_MATRIX, ROLE_LABELS, ROLE_PERMISSIONS } from '../../core/permissions';
import { ADMIN_SETTINGS_API } from '../../data-access/admin-apis';
import { errorMessage } from '../../data-access/http-support';
import {
  AdminApiError,
  type StaffInput,
  type StaffMember,
  type StaffRole,
} from '../../data-access/models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { AdminToastService } from '../../ui/toast';

const ROLES: StaffRole[] = ['admin', 'staff'];

/** Staff accounts and the fixed role matrix (Phụ lục A: two roles, permissions not editable per user). */
@Component({
  selector: 'adm-staff-page',
  imports: [
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    AdmPageHeader,
    AdmBadge,
    AdmIcon,
    AdmEmptyState,
    RelativePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Nhân viên và phân quyền" back="/admin/settings">
      <ng-container actions>
        <button type="button" class="adm-btn adm-btn--primary adm-btn--lg" (click)="invite()">
          <adm-icon name="reiconPlus" [size]="16" /> Mời nhân viên
        </button>
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--narrow">
      <section class="section" aria-labelledby="staff-title">
        <header>
          <h2 id="staff-title">Tài khoản ({{ staff()?.length ?? 0 }})</h2>
        </header>
        @if (error() && !staff()) {
          <adm-empty
            kind="error"
            heading="Không tải được danh sách nhân viên"
            [description]="error()"
          >
            <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
          </adm-empty>
        } @else if (!staff()) {
          <div class="stack">
            <div class="sk"></div>
            <div class="sk"></div>
            <div class="sk"></div>
          </div>
        } @else {
          <ul class="people">
            @for (member of staff(); track member.id) {
              <li [class.is-disabled]="member.status === 'disabled'">
                <span class="avatar" aria-hidden="true">{{ initials(member.name) }}</span>
                <div class="who">
                  <p class="name">
                    {{ member.name }}
                    @if (member.id === me()?.id) {
                      <span class="tertiary small">(bạn)</span>
                    }
                  </p>
                  <p class="small secondary">{{ member.email }}</p>
                </div>
                <p class="small tertiary seen">
                  {{
                    member.status === 'disabled'
                      ? 'Đã khóa'
                      : member.lastActiveAt
                        ? 'Hoạt động ' + (member.lastActiveAt | admRelative)
                        : 'Chưa đăng nhập'
                  }}
                </p>
                <adm-badge
                  [label]="roleLabels[member.role]"
                  [tone]="member.role === 'admin' ? 'info' : 'neutral'"
                />
                @if (member.id !== me()?.id) {
                  <button
                    type="button"
                    class="adm-btn adm-btn--icon adm-btn--ghost"
                    [attr.aria-label]="'Thao tác với ' + member.name"
                    [cdkMenuTriggerFor]="menu"
                    [cdkMenuTriggerData]="{ $implicit: member }"
                  >
                    <adm-icon name="reiconMoreH" />
                  </button>
                } @else {
                  <span class="menu-spacer"></span>
                }
              </li>
            }
          </ul>
        }
      </section>

      <ng-template #menu let-member>
        <div class="adm">
          <div class="menu" cdkMenu>
            @for (role of roles; track role) {
              @if (role !== member.role && member.status === 'active') {
                <button cdkMenuItem type="button" (click)="changeRole(member, role)">
                  <adm-icon name="reiconShieldUser" [size]="16" /> Đổi thành {{ roleLabels[role] }}
                </button>
              }
            }
            @if (member.status === 'active') {
              <button
                cdkMenuItem
                type="button"
                class="danger"
                (click)="setStatus(member, 'disabled')"
              >
                <adm-icon name="reiconCloseCircle" [size]="16" /> Khóa tài khoản
              </button>
            } @else {
              <button cdkMenuItem type="button" (click)="setStatus(member, 'active')">
                <adm-icon name="reiconCheckCircle" [size]="16" /> Mở khóa tài khoản
              </button>
            }
          </div>
        </div>
      </ng-template>

      <section class="section" aria-labelledby="matrix-title">
        <header><h2 id="matrix-title">Quyền theo vai trò</h2></header>
        <p class="section-desc small">
          Quyền gắn với vai trò, không chỉnh riêng từng người. Mục không có quyền sẽ ẩn khỏi giao
          diện.
        </p>
        <div class="table-wrap">
          <table class="table matrix">
            <thead>
              <tr>
                <th>Quyền</th>
                @for (role of roles; track role) {
                  <th class="center">{{ roleLabels[role] }}</th>
                }
              </tr>
            </thead>
            @for (group of matrix; track group.module) {
              <tbody>
                <tr class="group-row">
                  <td [attr.colspan]="roles.length + 1">
                    <strong>{{ group.module }}</strong>
                  </td>
                </tr>
                @for (item of group.items; track item.permission) {
                  <tr>
                    <td>{{ item.label }}</td>
                    @for (role of roles; track role) {
                      <td class="center">
                        @if (has(role, item.permission)) {
                          <adm-icon name="reiconCheck" [size]="16" aria-label="Có" />
                        } @else {
                          <span class="tertiary" aria-label="Không">—</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>
      </section>
    </div>
  `,
  styles: `
    .people {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
    }
    .people li {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) auto auto 36px;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
    }
    .people li + li {
      border-top: 1px solid var(--adm-divider);
    }
    .people li.is-disabled .who,
    .people li.is-disabled .avatar {
      opacity: 0.5;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--adm-muted);
      font-size: 12px;
      font-weight: 600;
      color: var(--adm-text-secondary);
    }
    .name {
      font-weight: 500;
    }
    .menu-spacer {
      width: 36px;
    }
    .matrix .center {
      text-align: center;
      width: 160px;
    }
    .matrix .group-row td {
      background: var(--adm-muted);
    }
    @media (max-width: 767px) {
      .people li {
        grid-template-columns: 36px minmax(0, 1fr) 36px;
      }
      .people .seen,
      .people adm-badge {
        grid-column: 2;
        justify-self: start;
      }
      .matrix .center {
        width: auto;
      }
    }
  `,
})
export class StaffPage {
  private readonly api = inject(ADMIN_SETTINGS_API);
  private readonly dialogs = inject(AdminDialogs);
  private readonly toast = inject(AdminToastService);
  protected readonly me = inject(AdminSession).user;
  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly matrix = PERMISSION_MATRIX;
  protected readonly staff = signal<StaffMember[] | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.listStaff().subscribe({
      next: (staff) => this.staff.set(staff),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  has(role: StaffRole, permission: string): boolean {
    return (ROLE_PERMISSIONS[role] as ReadonlySet<string>).has(permission);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
  }

  invite(): void {
    this.dialogs.modal<null, StaffMember>(InviteStaffDialog, null).closed.subscribe((member) => {
      if (!member) return;
      this.staff.update((staff) => [...(staff ?? []), member]);
      this.toast.show(`Đã gửi lời mời đến ${member.email}`);
    });
  }

  changeRole(member: StaffMember, role: StaffRole): void {
    this.dialogs
      .confirm({
        title: `Đổi ${member.name} thành ${ROLE_LABELS[role]}?`,
        message:
          role === 'admin'
            ? 'Quản trị viên xem được doanh thu, giá vốn, hủy đơn và thay đổi mọi cài đặt.'
            : 'Người này sẽ mất quyền xem doanh thu, giá vốn, hủy đơn và cài đặt.',
        confirmLabel: 'Đổi vai trò',
      })
      .subscribe(
        (ok) =>
          ok && this.update(member, { role }, `Đã đổi ${member.name} thành ${ROLE_LABELS[role]}`),
      );
  }

  setStatus(member: StaffMember, status: StaffMember['status']): void {
    if (status === 'active') {
      this.update(member, { status }, `Đã mở khóa ${member.name}`);
      return;
    }
    this.dialogs
      .confirm({
        title: `Khóa tài khoản ${member.name}?`,
        message:
          'Người này bị đăng xuất và không đăng nhập được nữa. Lịch sử thao tác vẫn được giữ.',
        confirmLabel: 'Khóa tài khoản',
        danger: true,
      })
      .subscribe((ok) => ok && this.update(member, { status }, `Đã khóa ${member.name}`));
  }

  private update(
    member: StaffMember,
    input: Partial<StaffInput> & { status?: StaffMember['status'] },
    message: string,
  ): void {
    this.api.updateStaff(member.id, input).subscribe({
      next: (updated) => {
        this.staff.update(
          (staff) => staff?.map((item) => (item.id === updated.id ? updated : item)) ?? null,
        );
        this.toast.show(message);
      },
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }
}

@Component({
  selector: 'adm-invite-staff-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <form class="dialog" (ngSubmit)="submit()">
      <h2>Mời nhân viên</h2>
      <p class="dialog-desc">
        Người được mời nhận email để đặt mật khẩu và đăng nhập trang quản trị.
      </p>
      <div class="dialog-body">
        <div class="field">
          <label class="req" for="inv-name">Họ tên</label>
          <input
            id="inv-name"
            class="input"
            name="name"
            autocomplete="off"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            [attr.aria-invalid]="tried() && !name().trim()"
          />
          @if (tried() && !name().trim()) {
            <p class="error">Nhập họ tên.</p>
          }
        </div>
        <div class="field">
          <label class="req" for="inv-email">Email</label>
          <input
            id="inv-email"
            class="input"
            type="email"
            name="email"
            autocomplete="off"
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            [attr.aria-invalid]="tried() && !!emailError()"
          />
          @if (tried() && emailError(); as message) {
            <p class="error">{{ message }}</p>
          }
        </div>
        <div class="field">
          <span class="field-label">Vai trò</span>
          @for (role of roles; track role) {
            <label class="check">
              <input
                type="radio"
                name="role"
                [value]="role"
                [checked]="role === roleValue()"
                (change)="roleValue.set(role)"
              />
              <span
                >{{ labels[role]
                }}<span class="check-desc">{{
                  role === 'admin'
                    ? 'Toàn quyền, gồm doanh thu, giá vốn và cài đặt.'
                    : 'Xử lý đơn, trả hàng, tồn kho; không xem doanh thu.'
                }}</span></span
              >
            </label>
          }
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
        <button type="submit" class="adm-btn adm-btn--primary" [class.is-busy]="saving()">
          Gửi lời mời
        </button>
      </div>
    </form>
  `,
})
export class InviteStaffDialog {
  private readonly api = inject(ADMIN_SETTINGS_API);
  readonly ref = inject<DialogRef<StaffMember>>(DialogRef);
  readonly data = inject(DIALOG_DATA);
  protected readonly roles = ROLES;
  protected readonly labels = ROLE_LABELS;
  readonly name = signal('');
  readonly email = signal('');
  readonly roleValue = signal<StaffRole>('staff');
  readonly tried = signal(false);
  readonly saving = signal(false);
  readonly serverEmailError = signal('');
  readonly emailError = computed(() => {
    const email = this.email().trim();
    if (!email) return 'Nhập email.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Email chưa đúng định dạng.';
    return this.serverEmailError();
  });

  submit(): void {
    this.tried.set(true);
    this.serverEmailError.set('');
    if (!this.name().trim() || this.emailError()) return;
    this.saving.set(true);
    this.api
      .inviteStaff({
        name: this.name().trim(),
        email: this.email().trim().toLowerCase(),
        role: this.roleValue(),
      })
      .subscribe({
        next: (member) => this.ref.close(member),
        error: (error: unknown) => {
          this.saving.set(false);
          this.serverEmailError.set(
            error instanceof AdminApiError && error.fields['email']
              ? error.fields['email']
              : errorMessage(error),
          );
        },
      });
  }
}
