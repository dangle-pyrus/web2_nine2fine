/**
 * Báo cáo mở rộng (nâng cấp admin 2026-11-15): `GET /api/admin/reports-extra?from&to`, chỉ đọc, chỉ quản trị viên
 * (backend/src/modules/insights-extra). Cùng quy tắc ngày như `/admin/reports/sales`. Tiền là số nguyên VND, tỉ lệ 0..1.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { adminBase, adminErrors, toParams } from './http-support';

export interface ExtraReport {
  generatedAt: string;
  from: string;
  to: string;
  days: number;
  customers: {
    buyers: number;
    newBuyers: number;
    returningBuyers: number;
    repeatBuyers: number;
    repeatRate: number;
    newOrders: number;
    returningOrders: number;
    newSpend: number;
    returningSpend: number;
    members: number;
    guests: number;
  };
  operations: {
    medianMinutes: { confirm: number | null; handover: number | null; deliver: number | null };
    counts: {
      placed: number;
      cancelled: number;
      confirmed: number;
      handedOver: number;
      delivered: number;
    };
    onTime: { delivered: number; onTime: number; rate: number };
    cancelReasons: { code: string; actor: string; orders: number }[];
  };
  returns: {
    reason: string;
    fault: string;
    requests: number;
    refunded: number;
    refundedAmount: number;
  }[];
  promotions: {
    orders: number;
    ordersWithVoucher: number;
    share: number;
    orderValue: number;
    voucherOrderValue: number;
    totalDiscount: number;
    codes: {
      code: string;
      kind: 'discount' | 'shipping';
      orders: number;
      discount: number;
      orderValue: number;
    }[];
  };
  provinces: { code: string; name: string; orders: number; orderValue: number }[];
  /** 7 rows (Thứ Hai .. Chủ nhật) x 24 hours, Vietnam time; orders placed. */
  heatmap: number[][];
}

@Injectable({ providedIn: 'root' })
export class InsightsExtraApi {
  private readonly http = inject(HttpClient);
  /** `adminBase()` reads API_CONFIG, so it must run in the injection context (field initializer). */
  private readonly base = `${adminBase()}/reports-extra`;

  get(query: { from: string; to: string }): Observable<ExtraReport> {
    return this.http.get<ExtraReport>(this.base, { params: toParams(query) }).pipe(adminErrors());
  }
}
