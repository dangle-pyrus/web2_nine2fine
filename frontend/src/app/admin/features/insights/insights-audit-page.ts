import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DateTimePipe } from '../../core/format.pipes';
import { ADMIN_AUDIT_LOG_API } from '../../data-access/insights-api';
import { insightsErrorMessage } from '../../data-access/insights-errors';
import type { AuditEntry, AuditQuery, AuditTargetType } from '../../data-access/insights-models';
import { ROLE_LABELS } from '../../core/permissions';
import { AdmEmptyState } from '../../ui/empty-state';
import { AdmIcon } from '../../ui/icon';
import { loader } from '../../ui/list-state';
import { AdmPageHeader } from '../../ui/page-header';
import { AdmPager } from '../../ui/pager';
import { AdmSkeletonRows } from '../../ui/skeleton';
import { type RangeErrors, shiftDay, todayVn, validateDayRange } from './insights-format';

/** Longest range the server accepts (BR-AUD-03). */
const MAX_AUDIT_DAYS = 92;
const PAGE_SIZES = [20, 50] as const;

const TARGETS: { value: AuditTargetType | ''; label: string }[] = [
  { value: '', label: 'Mọi đối tượng' },
  { value: 'order', label: 'Đơn hàng' },
  { value: 'inventory', label: 'Tồn kho' },
  { value: 'customer', label: 'Khách hàng' },
  { value: 'staff', label: 'Nhân viên' },
  { value: 'settings', label: 'Cài đặt' },
];
const TARGET_VALUES = TARGETS.map((target) => target.value);

/**
 * Cài đặt › Nhật ký hoạt động on the real API (Slice 8, BR-AUD-01..05). Read-only, admin only.
 * Filters (object type, day range) and the page live in the URL; there is no product / voucher
 * filter and no free-text search (they are Won't).
 */
@Component({
  selector: 'adm-insights-audit-page',
  imports: [
    FormsModule,
    RouterLink,
    AdmPageHeader,
    AdmIcon,
    AdmPager,
    AdmSkeletonRows,
    AdmEmptyState,
    DateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-audit-page.html',
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }
    .filters .field {
      width: 180px;
    }
    .filters > .adm-btn {
      align-self: flex-end;
    }
    .nowrap {
      white-space: nowrap;
    }
    .changes {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 2px;
    }
    .after {
      color: var(--adm-text);
    }
  `,
})
export class InsightsAuditPage {
  private readonly api = inject(ADMIN_AUDIT_LOG_API);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly targets = TARGETS;
  protected readonly sizes = PAGE_SIZES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly today = todayVn();

  private readonly defaults = () => ({ from: shiftDay(todayVn(), -29), to: todayVn() });
  protected readonly fromDraft = signal(this.defaults().from);
  protected readonly toDraft = signal(this.defaults().to);
  protected readonly errors = signal<RangeErrors>({});
  protected readonly query = signal<AuditQuery>({
    ...this.defaults(),
    targetType: '',
    page: 1,
    limit: 20,
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const fallback = this.defaults();
      const from = params.get('from') ?? fallback.from;
      const to = params.get('to') ?? (params.get('from') ? todayVn() : fallback.to);
      const type = (params.get('targetType') ?? '') as AuditTargetType | '';
      const page = Math.max(1, Number(params.get('page')) || 1);
      const limit = Number(params.get('limit')) === 50 ? 50 : 20;
      const problems = validateDayRange(from, to, todayVn(), MAX_AUDIT_DAYS);
      this.fromDraft.set(from);
      this.toDraft.set(to);
      this.errors.set(problems);
      const range = problems.from || problems.to ? fallback : { from, to };
      this.query.set({
        ...range,
        targetType: TARGET_VALUES.includes(type) ? type : '',
        page,
        limit,
      });
    });
  }

  protected readonly view = loader(
    this.query,
    (query) => this.api.list(query),
    insightsErrorMessage,
  );
  protected readonly page = computed(() => (this.view.state().error ? null : this.view.data()));

  /** Where a row leads, when the target still exists and the role may open it. */
  protected link(entry: AuditEntry): string[] | null {
    const { type, id } = entry.target;
    if (type === 'settings') return ['/admin/settings/store'];
    if (!id) return null;
    if (type === 'order') return ['/admin/orders', id];
    if (type === 'customer') return ['/admin/customers', id];
    return null;
  }

  protected go(patch: Partial<AuditQuery>, keepPage = false): void {
    const next = { ...this.query(), ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        from: next.from,
        to: next.to,
        targetType: next.targetType || null,
        page: keepPage && next.page > 1 ? next.page : null,
        limit: next.limit === 20 ? null : next.limit,
      },
      replaceUrl: true,
    });
  }

  protected setType(value: AuditTargetType | ''): void {
    this.go({ targetType: value, page: 1 });
  }

  protected apply(): void {
    const from = this.fromDraft();
    const to = this.toDraft();
    const problems = validateDayRange(from, to, todayVn(), MAX_AUDIT_DAYS);
    this.errors.set(problems);
    if (problems.from || problems.to) return;
    this.go({ from, to, page: 1 });
  }

  protected setPage(page: number): void {
    this.go({ page }, true);
  }

  protected setLimit(limit: number): void {
    this.go({ limit, page: 1 });
  }

  protected reload(): void {
    this.view.reload();
  }
}
