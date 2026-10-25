import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { storeSettings } from '../../core/store-settings';
import { policies } from './policy-content';

/** `/help`: contact channels, seller identity and the questions shoppers ask most. */
@Component({
  selector: 'n2f-help-page',
  imports: [RouterLink],
  template: `
    <div class="container help">
      <h1>Liên hệ & hỗ trợ</h1>
      <p class="lead">
        nine2fine luôn sẵn sàng hỗ trợ bạn. Khi hỏi về một đơn hàng, vui lòng gửi kèm mã đơn để được
        xử lý nhanh hơn.
      </p>

      <div class="channels">
        <a class="channel" [href]="info.hotlineHref">
          <span class="label">Hotline</span>
          <strong>{{ info.hotline }}</strong>
          <span class="hint">{{ info.hours }}</span>
        </a>
        <a class="channel" [href]="'mailto:' + info.email">
          <span class="label">Email</span>
          <strong>{{ info.email }}</strong>
          <span class="hint">Phản hồi trong vòng 24 giờ làm việc</span>
        </a>
        <a class="channel" routerLink="/track-order">
          <span class="label">Đơn hàng</span>
          <strong>Tra cứu đơn hàng</strong>
          <span class="hint">Xem trạng thái hoặc hủy đơn bằng mã đơn và số điện thoại</span>
        </a>
      </div>

      <section aria-labelledby="faq-title">
        <h2 id="faq-title">Câu hỏi thường gặp</h2>
        @for (item of faq(); track item.q) {
          <details>
            <summary>{{ item.q }}</summary>
            <p>
              {{ item.a }}
              @if (item.link) {
                <a [routerLink]="item.link.path">{{ item.link.label }}</a>
              }
            </p>
          </details>
        }
      </section>

      <section aria-labelledby="policy-list-title">
        <h2 id="policy-list-title">Chính sách</h2>
        <ul class="policy-list">
          @for (policy of policies; track policy.slug) {
            <li>
              <a [routerLink]="['/policies', policy.slug]">{{ policy.title }}</a>
              <span>{{ policy.summary }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="company" aria-labelledby="company-title">
        <h2 id="company-title">Thông tin doanh nghiệp</h2>
        <dl>
          <div>
            <dt>Đơn vị bán hàng</dt>
            <dd>{{ info.legalName }}</dd>
          </div>
          <div>
            <dt>Mã số doanh nghiệp</dt>
            <dd>{{ info.registrationNumber }}, do {{ info.registrationIssuer }} cấp</dd>
          </div>
          <div>
            <dt>Địa chỉ</dt>
            <dd>{{ info.address }}</dd>
          </div>
        </dl>
      </section>
    </div>
  `,
  styles: `
    .help {
      max-width: 960px;
      padding-block: 40px 96px;
    }
    h1 {
      margin: 0 0 10px;
      color: var(--heading);
      font-size: clamp(28px, 3.4vw, 44px);
      font-weight: 600;
    }
    .lead {
      max-width: 640px;
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .channels {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 28px;
    }
    .channel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
    }
    .channel:hover {
      border-color: var(--ink);
    }
    .channel .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .channel strong {
      font-size: 18px;
    }
    .channel .hint {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    section {
      margin-top: 48px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 600;
    }
    details {
      border-bottom: 1px solid var(--line);
    }
    summary {
      padding: 16px 0;
      font-weight: 600;
      cursor: pointer;
    }
    details p {
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.7;
    }
    details a,
    .policy-list a {
      color: var(--ink);
      font-weight: 600;
      text-decoration: underline;
    }
    .policy-list {
      display: grid;
      gap: 14px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .policy-list li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .policy-list span {
      color: var(--muted);
      font-size: 14px;
    }
    .company dl {
      display: grid;
      gap: 10px;
      margin: 0;
    }
    .company dt {
      color: var(--muted);
      font-size: 13px;
    }
    .company dd {
      margin: 2px 0 0;
    }
    @media (max-width: 760px) {
      .help {
        padding-block: 24px 64px;
      }
      .channels {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPage {
  get info() {
    return storeSettings().info;
  }
  get policies() {
    return policies();
  }
  /** Rebuilt from the live settings, like the policies. */
  readonly faq = computed(
    (): { q: string; a: string; link?: { label: string; path: string } }[] => {
      const P = storeSettings().policy;
      return [
        {
          q: 'Bao lâu tôi nhận được hàng?',
          a: `Đơn được giao trong ${P.deliveryWindow} kể từ khi xác nhận. Ngày giao dự kiến hiển thị ở bước thanh toán và trong chi tiết đơn.`,
          link: { label: 'Chính sách giao hàng', path: '/policies/shipping' },
        },
        {
          q: 'Tôi muốn hủy đơn đã đặt?',
          a: 'Bạn tự hủy được khi đơn còn "Chờ thanh toán" hoặc "Đang chuẩn bị hàng": thành viên vào Lịch sử mua hàng, khách không đăng nhập dùng trang Tra cứu đơn hàng. Đơn đã giao cho đơn vị vận chuyển vui lòng gọi hotline.',
          link: { label: 'Tra cứu đơn hàng', path: '/track-order' },
        },
        {
          q: 'Nhận hàng sai size, sai màu thì làm sao?',
          a: `Gửi yêu cầu trả hàng trong ${P.returnDays} ngày kể từ ngày nhận. nine2fine chịu toàn bộ phí gửi trả và hoàn tiền sau khi nhận lại hàng.`,
          link: { label: 'Chính sách trả hàng', path: '/policies/returns' },
        },
        {
          q: 'Tôi đã chuyển khoản nhưng đơn bị hủy?',
          a: `Đơn chuyển khoản được giữ ${P.paymentHoldMinutes} phút. Nếu tiền đến sau khi đơn đã hủy, nine2fine hoàn lại toàn bộ trong ${P.refundWorkingDays} ngày làm việc.`,
        },
        {
          q: 'Làm sao để lấy hóa đơn công ty?',
          a: 'Chọn "Xuất hóa đơn công ty" ở bước thanh toán và nhập thông tin công ty. Hóa đơn điện tử được gửi qua email bạn cung cấp.',
          link: { label: 'Chính sách thanh toán', path: '/policies/payment' },
        },
      ];
    },
  );
}
