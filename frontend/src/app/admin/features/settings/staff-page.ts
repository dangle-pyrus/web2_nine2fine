import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminSession } from '../../core/admin-session';
import { API_CONFIG } from '../../../core/api-config';
import { DateTimePipe, RelativePipe } from '../../core/format.pipes';
import {
  PERMISSION_MATRIX,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Permission,
} from '../../core/permissions';
import { errorMessage } from '../../data-access/http-support';
import { ADMIN_STAFF_API, newIdempotencyKey } from '../../data-access/staff-api';
import { errorField, usersErrorMessage } from '../../data-access/users-errors';
import type {
  AccountEvent,
  AccountRole,
  StaffAccount,
  StaffCreateInput,
} from '../../data-access/users-models';
import { AdmBadge } from '../../ui/badge';
import { AdminDialogs } from '../../ui/dialogs';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';
import { ReasonDialog, ReasonDialogData } from '../../ui/reason-dialog';

const ROLES: AccountRole[] = ['admin', 'staff'];
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Permissions of features that are not built yet (Won't of Slice 7): no row in the matrix. */
const HIDDEN_PERMISSIONS: readonly Permission[] = [
  'dashboard.revenue',
  'orders.export',
  'returns.process',
  'products.cost',
  'settings.store',
  'settings.audit',
];

const ACTION_LABELS: Record<AccountEvent['action'], string> = {
  'staff-created': 'Tạo tài khoản',
  locked: 'Khóa tài khoản',
  unlocked: 'Mở khóa tài khoản',
  'role-changed': 'Đổi vai trò',
};

/**
 * Staff accounts and the fixed role matrix (BR-USR-18..25). Admin only. Every rule (`self-change`,
 * `last-admin`, session revoke) is the server's; this page shows its answer and keeps the dialog
 * open when a request fails.
 */
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
        <button type="button" class="adm-btn adm-btn--primary adm-btn--lg" (click)="create()">
          <adm-icon name="reiconPlus" [size]="16" /> Thêm nhân viên
        </button>
      </ng-container>
    </adm-page-header>
    <div class="page-body page-body--narrow">
      @if (notice(); as text) {
        <div class="banner banner--info" role="status" data-testid="staff-notice">
          <adm-icon name="reiconCheckCircle" />
          <div class="banner-body">
            <p>{{ text }}</p>
          </div>
          <button type="button" class="link small" (click)="notice.set('')">Đóng</button>
        </div>
      }
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
          <div class="stack" aria-busy="true">
            <div class="sk"></div>
            <div class="sk"></div>
            <div class="sk"></div>
          </div>
        } @else {
          <ul class="people">
            @for (member of staff(); track member.id) {
              <li
                [class.is-disabled]="member.status === 'disabled'"
                [attr.data-email]="member.email"
              >
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
                  @if (member.status === 'disabled') {
                    Đã khóa
                  } @else if (!member.passwordSet) {
                    Chờ đặt mật khẩu
                  } @else if (member.lastActiveAt) {
                    Hoạt động {{ member.lastActiveAt | admRelative }}
                  } @else {
                    Chưa đăng nhập
                  }
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
                    [cdkMenuTriggerData]="{ $implicit: member.id }"
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

      <ng-template #menu let-id>
        @let member = byId(id);
        @if (member) {
          <div class="adm">
            <div class="menu" cdkMenu>
              @for (role of roles; track role) {
                @if (role !== member.role) {
                  <button cdkMenuItem type="button" (click)="changeRole(member, role)">
                    <adm-icon name="reiconShieldUser" [size]="16" /> Đổi thành
                    {{ roleLabels[role] }}
                  </button>
                }
              }
              @if (member.status === 'active') {
                <button cdkMenuItem type="button" class="danger" (click)="lock(member)">
                  <adm-icon name="reiconCloseCircle" [size]="16" /> Khóa tài khoản
                </button>
              } @else {
                <button cdkMenuItem type="button" (click)="unlock(member)">
                  <adm-icon name="reiconCheckCircle" [size]="16" /> Mở khóa tài khoản
                </button>
              }
              <button cdkMenuItem type="button" (click)="history(member)">
                <adm-icon name="reiconHistory" [size]="16" /> Lịch sử thao tác
              </button>
            </div>
          </div>
        }
      </ng-template>

      <section class="section" aria-labelledby="matrix-title">
        <header>
          <h2 id="matrix-title">Quyền theo vai trò</h2>
        </header>
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
    .banner {
      margin-bottom: 16px;
    }
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
  private readonly api = inject(ADMIN_STAFF_API);
  private readonly dialogs = inject(AdminDialogs);
  protected readonly me = inject(AdminSession).user;
  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  /** Real API: the rows of features that are not connected yet are left out (BR-USR-05). */
  private readonly live = inject(API_CONFIG).adminUsersMode === 'http';
  protected readonly matrix = PERMISSION_MATRIX.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !this.live || !HIDDEN_PERMISSIONS.includes(item.permission),
    ),
  })).filter((group) => group.items.length);
  protected readonly staff = signal<StaffAccount[] | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.list().subscribe({
      next: (staff) => this.staff.set(staff),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  /**
   * The menu is built once per row and keeps the data it was first opened with, so it gets the id
   * and reads the current account here: after a lock the same menu offers "Mở khóa".
   */
  byId(id: string): StaffAccount | undefined {
    return this.staff()?.find((item) => item.id === id);
  }

  has(role: AccountRole, permission: string): boolean {
    return (ROLE_PERMISSIONS[role] as ReadonlySet<string>).has(permission);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts.at(-2)?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
  }

  create(): void {
    this.dialogs.modal<null, StaffAccount>(CreateStaffDialog, null).closed.subscribe((member) => {
      if (!member) return;
      this.staff.update((staff) => [...(staff ?? []).filter((m) => m.id !== member.id), member]);
      this.notice.set(
        `Đã tạo tài khoản cho ${member.email} và gửi thư hướng dẫn. Nếu nhân viên không nhận được thư, họ vẫn dùng Quên mật khẩu với email này.`,
      );
    });
  }

  changeRole(member: StaffAccount, role: AccountRole): void {
    this.open(
      {
        title: `Đổi ${member.name} thành ${ROLE_LABELS[role]}?`,
        message:
          (role === 'admin'
            ? 'Quản trị viên khoá được tài khoản và quản lý nhân viên.'
            : 'Người này sẽ mất quyền khoá tài khoản và quản lý nhân viên.') +
          ' Họ bị đăng xuất khỏi mọi máy và cần đăng nhập lại để có quyền mới.',
        confirmLabel: 'Đổi vai trò',
        required: false,
        run: (reason) => this.api.setRole(member.id, role, reason || undefined),
      },
      member,
    );
  }

  lock(member: StaffAccount): void {
    this.open(
      {
        title: `Khóa tài khoản ${member.name}?`,
        message:
          'Người này bị đăng xuất khỏi mọi máy và không đăng nhập được nữa. Lịch sử thao tác vẫn được giữ.',
        confirmLabel: 'Khóa tài khoản',
        danger: true,
        required: true,
        run: (reason) => this.api.lock(member.id, reason),
      },
      member,
    );
  }

  unlock(member: StaffAccount): void {
    this.open(
      {
        title: `Mở khóa tài khoản ${member.name}?`,
        message: 'Người này đăng nhập lại được như bình thường. Các phiên cũ không được khôi phục.',
        confirmLabel: 'Mở khóa tài khoản',
        required: false,
        run: (reason) => this.api.unlock(member.id, reason || undefined),
      },
      member,
    );
  }

  history(member: StaffAccount): void {
    this.dialogs.modal<StaffAccount, void>(AccountHistoryDialog, member);
  }

  private open(data: ReasonDialogData<StaffAccount>, member: StaffAccount): void {
    this.dialogs
      .modal<ReasonDialogData<StaffAccount>, StaffAccount>(ReasonDialog, data)
      .closed.subscribe((updated) => {
        if (!updated) return;
        this.staff.update(
          (staff) => staff?.map((item) => (item.id === member.id ? updated : item)) ?? null,
        );
      });
  }
}

/**
 * Two steps. The first collects name, email and role; the second shows the email and the role
 * again and only then sends (BR-USR-19, decision 7 of the 2026-11-11 review): a mistyped email
 * would let its owner claim the account with "Quên mật khẩu". One `Idempotency-Key` per intention:
 * it stays while the content is unchanged, so "Thử lại" after a lost reply cannot create twice.
 */
@Component({
  selector: 'adm-create-staff-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    @if (step() === 'form') {
      <form class="dialog" (ngSubmit)="next()" novalidate>
        <h2>Thêm nhân viên</h2>
        <p class="dialog-desc">
          Người này nhận thư hướng dẫn để tự đặt mật khẩu bằng "Quên mật khẩu", rồi đăng nhập trang
          quản trị.
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
              (ngModelChange)="name.set($event); serverErrors.set({})"
              [attr.aria-invalid]="tried() && !!nameError()"
              [attr.aria-describedby]="tried() && nameError() ? 'inv-name-error' : null"
            />
            @if (tried() && nameError(); as message) {
              <p class="error" id="inv-name-error">{{ message }}</p>
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
              (ngModelChange)="email.set($event); serverErrors.set({})"
              [attr.aria-invalid]="(tried() || !!serverErrors()['email']) && !!emailError()"
              [attr.aria-describedby]="
                emailError() && (tried() || serverErrors()['email']) ? 'inv-email-error' : null
              "
            />
            @if ((tried() || serverErrors()['email']) && emailError(); as message) {
              <p class="error" id="inv-email-error" role="alert">{{ message }}</p>
            }
          </div>
          <fieldset class="field">
            <legend class="field-label">Vai trò</legend>
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
                      ? 'Khoá / mở khoá khách, quản lý nhân viên và mọi quyền của nhân viên.'
                      : 'Xử lý đơn, tồn kho, xem khách hàng; không quản lý nhân viên.'
                  }}</span></span
                >
              </label>
            }
          </fieldset>
        </div>
        <div class="dialog-actions">
          <button type="button" class="adm-btn" (click)="ref.close()">Hủy bỏ</button>
          <button type="submit" class="adm-btn adm-btn--primary">Tiếp tục</button>
        </div>
      </form>
    } @else {
      <form class="dialog" (ngSubmit)="submit()" [attr.aria-busy]="saving()">
        <h2>Xác nhận trước khi tạo</h2>
        <p class="dialog-desc">
          Thư hướng dẫn đặt mật khẩu sẽ gửi tới email dưới đây. Ai nhận được thư và dùng "Quên mật
          khẩu" với email này sẽ vào được tài khoản với đúng vai trò bên dưới. Kiểm tra kỹ từng ký
          tự.
        </p>
        <div class="dialog-body">
          <dl class="dl" data-testid="confirm-summary">
            <div>
              <dt>Họ tên</dt>
              <dd>{{ cleanName() }}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <strong data-testid="confirm-email">{{ cleanEmail() }}</strong>
              </dd>
            </div>
            <div>
              <dt>Vai trò</dt>
              <dd>
                <strong data-testid="confirm-role">{{ labels[roleValue()] }}</strong>
              </dd>
            </div>
          </dl>
          <p class="error" role="alert" data-testid="create-failure">{{ failure() }}</p>
        </div>
        <div class="dialog-actions">
          <button type="button" class="adm-btn" [disabled]="saving()" (click)="back()">
            Quay lại sửa
          </button>
          <button
            type="submit"
            class="adm-btn adm-btn--primary"
            [class.is-busy]="saving()"
            [disabled]="saving()"
          >
            {{ failure() ? 'Thử lại' : 'Xác nhận và tạo' }}
          </button>
        </div>
      </form>
    }
  `,
})
export class CreateStaffDialog {
  private readonly api = inject(ADMIN_STAFF_API);
  readonly ref = inject<DialogRef<StaffAccount>>(DialogRef);
  readonly data = inject(DIALOG_DATA);
  protected readonly roles = ROLES;
  protected readonly labels = ROLE_LABELS;
  protected readonly step = signal<'form' | 'confirm'>('form');
  readonly name = signal('');
  readonly email = signal('');
  readonly roleValue = signal<AccountRole>('staff');
  readonly tried = signal(false);
  readonly saving = signal(false);
  readonly failure = signal('');
  /** Server errors by field (`duplicate` and `validation` point at one). */
  readonly serverErrors = signal<Record<string, string>>({});
  private key: { content: string; value: string } | null = null;

  protected readonly cleanName = computed(() => this.name().trim().replace(/\s+/g, ' '));
  protected readonly cleanEmail = computed(() => this.email().trim().toLowerCase());
  protected readonly nameError = computed(() => {
    const length = this.cleanName().length;
    if (length < 2) return 'Họ tên cần từ 2 ký tự.';
    if (length > 100) return 'Họ tên tối đa 100 ký tự.';
    return this.serverErrors()['name'] ?? '';
  });
  protected readonly emailError = computed(() => {
    const email = this.cleanEmail();
    if (!email) return 'Nhập email.';
    if (!EMAIL_PATTERN.test(email)) return 'Email chưa đúng định dạng.';
    if (email.length > 254) return 'Email tối đa 254 ký tự.';
    return this.serverErrors()['email'] ?? '';
  });

  next(): void {
    this.tried.set(true);
    if (this.nameError() || this.emailError()) return;
    this.failure.set('');
    this.step.set('confirm');
  }

  back(): void {
    this.failure.set('');
    this.step.set('form');
  }

  submit(): void {
    if (this.saving()) return;
    const input: StaffCreateInput = {
      name: this.cleanName(),
      email: this.cleanEmail(),
      role: this.roleValue(),
    };
    const content = JSON.stringify(input);
    if (this.key?.content !== content) this.key = { content, value: newIdempotencyKey() };
    this.saving.set(true);
    this.failure.set('');
    this.api.create(input, this.key.value).subscribe({
      next: (member) => this.ref.close(member),
      error: (error: unknown) => {
        this.saving.set(false);
        const field = errorField(error);
        const message = usersErrorMessage(error);
        if (field === 'email' || field === 'name') {
          this.serverErrors.set({ [field]: message });
          this.step.set('form');
          this.tried.set(true);
        } else {
          this.failure.set(message);
        }
      },
    });
  }
}

/** The 20 newest actions on one account (BR-USR-17, Should). */
@Component({
  selector: 'adm-account-history-dialog',
  imports: [DateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'adm adm-dialog' },
  template: `
    <div class="dialog" role="group" aria-labelledby="history-title">
      <h2 id="history-title">Lịch sử thao tác: {{ member.name }}</h2>
      <div class="dialog-body">
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
          <button type="button" class="adm-btn" (click)="load()">Thử lại</button>
        } @else if (!events()) {
          <p class="secondary" role="status">Đang tải…</p>
        } @else if (!events()!.length) {
          <p class="secondary">Chưa có thao tác nào.</p>
        } @else {
          <ol class="history" data-testid="history-list">
            @for (event of events(); track event.id) {
              <li>
                <p>
                  <strong>{{ actions[event.action] }}</strong>
                  @if (event.action === 'role-changed' || event.action === 'staff-created') {
                    <span class="secondary">
                      ·
                      @if (event.roleBefore) {
                        {{ labels[event.roleBefore] }} →
                      }
                      {{ event.roleAfter ? labels[event.roleAfter] : '' }}
                    </span>
                  }
                </p>
                <p class="small secondary">
                  {{ event.at | admDateTime }} · {{ event.actor.name }} ({{
                    labels[event.actor.role]
                  }})
                  @if (event.sessionsRevoked) {
                    · thu hồi {{ event.sessionsRevoked }} phiên
                  }
                </p>
                @if (event.reason) {
                  <p class="small">Lý do: {{ event.reason }}</p>
                }
              </li>
            }
          </ol>
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="adm-btn" (click)="ref.close()">Đóng</button>
      </div>
    </div>
  `,
  styles: `
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 12px;
      max-height: 50vh;
      overflow: auto;
    }
    .history li + li {
      border-top: 1px solid var(--adm-divider);
      padding-top: 12px;
    }
  `,
})
export class AccountHistoryDialog {
  private readonly api = inject(ADMIN_STAFF_API);
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly member = inject<StaffAccount>(DIALOG_DATA);
  protected readonly labels = ROLE_LABELS;
  protected readonly actions = ACTION_LABELS;
  protected readonly events = signal<AccountEvent[] | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.history(this.member.id).subscribe({
      next: (events) => this.events.set(events),
      error: (error: unknown) => this.error.set(usersErrorMessage(error)),
    });
  }
}
