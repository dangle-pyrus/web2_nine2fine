import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_CONFIG } from '../../../core/api-config';
import { AdminSession } from '../../core/admin-session';
import type { Permission } from '../../core/permissions';
import { AdmIcon } from '../../ui/icon';
import { AdmPageHeader } from '../../ui/page-header';

const GROUPS: {
  link: string;
  icon: string;
  title: string;
  description: string;
  permission: Permission;
}[] = [
  {
    link: 'store',
    icon: 'reiconShop',
    title: 'Cửa hàng',
    description: 'Thông tin pháp lý, liên hệ, phí vận chuyển, đổi trả và hạng thành viên.',
    permission: 'settings.store',
  },
  {
    link: 'staff',
    icon: 'reiconShieldUser',
    title: 'Nhân viên và phân quyền',
    description: 'Thêm nhân viên, đổi vai trò, khóa tài khoản.',
    permission: 'settings.staff',
  },
  {
    link: 'audit',
    icon: 'reiconHistory',
    title: 'Nhật ký hoạt động',
    description: 'Ai đã làm gì, lúc nào, trên đơn hàng, sản phẩm và cài đặt.',
    permission: 'settings.audit',
  },
];

/** Settings home (4.4): only the groups the current role can open. */
@Component({
  selector: 'adm-settings-index-page',
  imports: [RouterLink, AdmPageHeader, AdmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <adm-page-header heading="Cài đặt" />
    <div class="page-body page-body--narrow">
      @if (groups().length) {
        <ul class="groups">
          @for (group of groups(); track group.link) {
            <li>
              <a [routerLink]="group.link">
                <span class="icon"><adm-icon [name]="group.icon" [size]="20" /></span>
                <span>
                  <span class="title">{{ group.title }}</span>
                  <span class="secondary small desc">{{ group.description }}</span>
                </span>
                <adm-icon class="chev" name="reiconChevronRight" [size]="16" />
              </a>
            </li>
          }
        </ul>
      } @else {
        <p class="secondary">
          Vai trò của bạn không có quyền thay đổi cài đặt. Liên hệ quản trị viên nếu cần.
        </p>
      }
    </div>
  `,
  styles: `
    .groups {
      list-style: none;
      margin: 0;
      padding: 0;
      max-width: 720px;
      border: 1px solid var(--adm-divider);
      border-radius: var(--adm-radius-lg);
      overflow: hidden;
    }
    li + li {
      border-top: 1px solid var(--adm-divider);
    }
    a {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      color: inherit;
      text-decoration: none;
      transition: background-color 120ms ease-out;
    }
    a:hover {
      background: var(--adm-muted);
    }
    .icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--adm-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    a:hover .icon {
      background: var(--adm-bg);
    }
    .title {
      display: block;
      font-weight: 500;
    }
    .desc {
      display: block;
      margin-top: 2px;
    }
    .chev {
      margin-left: auto;
      color: var(--adm-text-tertiary);
    }
  `,
})
export class SettingsIndexPage {
  private readonly session = inject(AdminSession);
  /** Orders desk (real API): only the groups whose slice is connected (Slice 7 staff, Slice 8). */
  private readonly desk = inject(API_CONFIG).adminOrdersMode !== 'mock';
  private readonly live = new Set<string>([
    ...(inject(API_CONFIG).adminUsersMode === 'http' ? ['staff'] : []),
    ...(inject(API_CONFIG).adminInsightsMode === 'http' ? ['store', 'audit'] : []),
  ]);
  protected readonly groups = computed(() =>
    GROUPS.filter(
      (group) =>
        this.session.permissions().has(group.permission) &&
        (!this.desk || this.live.has(group.link)),
    ).map((group) =>
      this.desk && group.link === 'store'
        ? {
            ...group,
            title: 'Thông tin cửa hàng',
            description: 'Thông tin pháp lý, liên hệ, phí vận chuyển và thanh toán.',
          }
        : this.desk && group.link === 'audit'
          ? {
              ...group,
              description: 'Ai đã làm gì, lúc nào, trên đơn hàng, tồn kho, tài khoản và cài đặt.',
            }
          : group,
    ),
  );
}
