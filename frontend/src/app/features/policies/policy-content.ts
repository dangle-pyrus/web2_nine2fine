import { computed } from '@angular/core';
import { storeSettings, StoreSettingsValue } from '../../core/store-settings';

/** A paragraph, or a bulleted list when given as an array. */
export type PolicyBlock = string | string[];

/** A membership card picture with its requirement and perk, shown above the section text. */
export interface PolicyCard {
  image: string;
  name: string;
  requirement: string;
  perk: string;
}

export interface PolicySection {
  heading: string;
  cards?: PolicyCard[];
  blocks: PolicyBlock[];
}

export interface Policy {
  slug: string;
  /** Short name for menus and the footer. */
  label: string;
  title: string;
  summary: string;
  sections: PolicySection[];
}

/** ISO date of the last review of these texts. */
export const POLICIES_UPDATED_AT = '2026-10-18';

const vnd = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

/**
 * Published policies, written against the laws in force in October 2026: Luật Thương mại điện tử
 * 122/2025/QH15, Luật Bảo vệ quyền lợi người tiêu dùng 19/2023/QH15 (Nghị định 55/2024/NĐ-CP),
 * Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (Nghị định 356/2025/NĐ-CP), Luật Giao dịch điện tử
 * 20/2023/QH15 and the e-invoice rules (Nghị định 123/2020/NĐ-CP, amended by 70/2025/NĐ-CP).
 * Numbers come from the live store settings so the texts always match checkout, PDP and the account
 * flows. Have them reviewed by counsel before launch.
 */
function buildPolicies({ policy: P, info: S, membership: M }: StoreSettingsValue): Policy[] {
  return [
    {
      slug: 'returns',
      label: 'Trả hàng & hoàn tiền',
      title: 'Chính sách trả hàng và hoàn tiền',
      summary: `Trả hàng trong ${P.returnDays} ngày kể từ ngày nhận. Miễn phí khi nine2fine giao sai hoặc sản phẩm lỗi.`,
      sections: [
        {
          heading: 'Thời hạn',
          blocks: [
            `Bạn có thể gửi yêu cầu trả hàng trong ${P.returnDays} ngày kể từ ngày nhận hàng thành công. Thời hạn này áp dụng cho mọi sản phẩm bán trên nine2fine.vn, kể cả sản phẩm giảm giá.`,
          ],
        },
        {
          heading: 'Trường hợp được trả hàng',
          blocks: [
            [
              'Giao sai size, sai màu hoặc sai sản phẩm so với đơn đã đặt.',
              'Sản phẩm bị lỗi sản xuất, rách, bẩn, phai màu hoặc hư hỏng khi nhận.',
              'Sản phẩm không vừa hoặc bạn không còn nhu cầu sử dụng.',
            ],
          ],
        },
        {
          heading: 'Điều kiện sản phẩm',
          blocks: [
            'Với lý do không vừa hoặc không còn nhu cầu, sản phẩm cần còn nguyên tem, nhãn, chưa qua sử dụng, chưa giặt và không có mùi lạ. Điều kiện này không áp dụng khi lỗi thuộc về nine2fine.',
            'Với sản phẩm lỗi hoặc giao sai, vui lòng đính kèm ảnh chụp sản phẩm và tem nhãn để nine2fine xử lý nhanh hơn.',
          ],
        },
        {
          heading: 'Cách gửi yêu cầu',
          blocks: [
            [
              'Thành viên: vào Tài khoản → Lịch sử mua hàng → chọn đơn → "Yêu cầu trả hàng", chọn sản phẩm, lý do và tài khoản nhận tiền hoàn.',
              `Khách mua không cần tài khoản: gọi ${S.hotline} hoặc gửi email đến ${S.email}, kèm mã đơn và số điện thoại đặt hàng.`,
              'nine2fine xác nhận yêu cầu trong vòng 24 giờ làm việc và hẹn đơn vị vận chuyển đến lấy hàng tại địa chỉ của bạn.',
            ],
          ],
        },
        {
          heading: 'Phí gửi trả',
          blocks: [
            [
              'Giao sai size, sai màu, sai sản phẩm hoặc sản phẩm lỗi: nine2fine chịu toàn bộ phí gửi trả và hoàn lại cả phí giao hàng ban đầu nếu bạn trả toàn bộ đơn.',
              `Không vừa hoặc không còn nhu cầu: phí gửi trả ${vnd(P.returnShippingFee)} được trừ vào số tiền hoàn.`,
            ],
          ],
        },
        {
          heading: 'Hoàn tiền',
          blocks: [
            'Số tiền hoàn bằng số tiền bạn thực trả cho các sản phẩm trả lại, tức giá bán sau khi trừ phần giảm giá của mã khuyến mãi được phân bổ theo giá trị từng sản phẩm.',
            `nine2fine kiểm tra hàng trong 2 ngày làm việc kể từ khi nhận lại, sau đó hoàn tiền trong ${P.refundWorkingDays} ngày làm việc.`,
            [
              'Đơn đã chuyển khoản: hoàn về tài khoản đã thanh toán.',
              'Đơn COD: hoàn bằng chuyển khoản vào tài khoản ngân hàng bạn cung cấp khi gửi yêu cầu.',
            ],
            'Nếu sản phẩm gửi về không đúng điều kiện, nine2fine sẽ liên hệ giải thích và gửi lại sản phẩm cho bạn miễn phí.',
          ],
        },
        {
          heading: 'Hủy đơn trước khi giao',
          blocks: [
            'Bạn có thể tự hủy đơn trong Tài khoản hoặc tại trang Tra cứu đơn hàng khi đơn đang ở trạng thái "Chờ thanh toán" hoặc "Đang chuẩn bị hàng". Khi đơn đã bàn giao cho đơn vị vận chuyển, vui lòng liên hệ hotline để được hỗ trợ.',
            `Đơn đã chuyển khoản bị hủy sẽ được hoàn tiền trong ${P.refundWorkingDays} ngày làm việc.`,
          ],
        },
      ],
    },
    {
      slug: 'shipping',
      label: 'Giao hàng',
      title: 'Chính sách giao hàng',
      summary: `Giao toàn quốc trong ${P.deliveryWindow}. Miễn phí cho đơn từ ${vnd(P.freeShippingFrom)}.`,
      sections: [
        {
          heading: 'Phạm vi và thời gian',
          blocks: [
            `nine2fine giao hàng đến tất cả tỉnh, thành phố trên toàn quốc. Thời gian giao dự kiến ${P.deliveryWindow} kể từ khi đơn được xác nhận (với đơn chuyển khoản là từ khi nhận được thanh toán), không tính ngày lễ, Tết.`,
            'Ngày giao dự kiến được hiển thị ở bước thanh toán và trong chi tiết đơn hàng. Khi đơn bàn giao cho đơn vị vận chuyển, bạn sẽ thấy tên đơn vị và mã vận đơn để theo dõi.',
          ],
        },
        {
          heading: 'Phí giao hàng',
          blocks: [
            [
              `Đơn có giá trị sản phẩm từ ${vnd(P.freeShippingFrom)}: miễn phí giao hàng.`,
              `Đơn dưới ${vnd(P.freeShippingFrom)}: phí ${vnd(P.shippingFee)} cho mọi địa chỉ.`,
            ],
            'Phí giao hàng luôn được hiển thị trong tóm tắt đơn hàng trước khi bạn bấm đặt hàng.',
          ],
        },
        {
          heading: 'Khi nhận hàng',
          blocks: [
            'Bạn được kiểm tra ngoại quan (số lượng, mẫu mã, màu, size trên tem) trước khi thanh toán và nhận hàng. Nếu sản phẩm sai hoặc hư hỏng, bạn có thể từ chối nhận và báo cho nine2fine để được giao lại hoặc hoàn tiền.',
            'Đơn vị vận chuyển sẽ liên hệ trước khi giao. Nếu giao không thành công sau 3 lần, đơn sẽ được trả về kho và nine2fine sẽ liên hệ bạn để giao lại.',
          ],
        },
      ],
    },
    {
      slug: 'payment',
      label: 'Thanh toán',
      title: 'Chính sách thanh toán',
      summary: 'Thanh toán khi nhận hàng (COD) hoặc chuyển khoản qua mã QR.',
      sections: [
        {
          heading: 'Giá bán',
          blocks: [
            'Giá niêm yết trên website bằng Đồng Việt Nam và đã bao gồm thuế giá trị gia tăng (VAT). Phí giao hàng (nếu có) được hiển thị riêng trước khi bạn đặt hàng.',
          ],
        },
        {
          heading: 'Phương thức thanh toán',
          blocks: [
            [
              'Thanh toán khi nhận hàng (COD): trả tiền mặt hoặc chuyển khoản cho nhân viên giao hàng.',
              `Chuyển khoản qua mã QR: sau khi đặt, bạn nhận một tài khoản nhận tiền dành riêng cho đơn. Chuyển đúng số tiền, hệ thống tự xác nhận. Đơn được giữ ${P.paymentHoldMinutes} phút, sau đó tự hủy nếu chưa nhận được tiền.`,
            ],
            `Nếu bạn đã chuyển tiền nhưng đơn đã hết hạn giữ, nine2fine hoàn lại toàn bộ số tiền trong ${P.refundWorkingDays} ngày làm việc.`,
          ],
        },
        {
          heading: 'Hóa đơn',
          blocks: [
            'nine2fine xuất hóa đơn điện tử cho mỗi đơn hàng. Nếu cần hóa đơn công ty, chọn "Xuất hóa đơn công ty" ở bước thanh toán và nhập tên, mã số thuế, địa chỉ công ty cùng email nhận hóa đơn. Thông tin hóa đơn không thể thay đổi sau khi hóa đơn đã được xuất.',
          ],
        },
        {
          heading: 'An toàn thanh toán',
          blocks: [
            'nine2fine không yêu cầu và không lưu thông tin thẻ, mật khẩu hay mã OTP ngân hàng của bạn. Nhân viên nine2fine không bao giờ đề nghị bạn chuyển khoản vào tài khoản khác ngoài tài khoản hiển thị trên trang thanh toán của đơn.',
          ],
        },
      ],
    },
    {
      slug: 'privacy',
      label: 'Bảo mật dữ liệu',
      title: 'Chính sách bảo vệ dữ liệu cá nhân',
      summary: 'Dữ liệu nào nine2fine thu thập, dùng để làm gì và quyền của bạn.',
      sections: [
        {
          heading: 'Bên kiểm soát và xử lý dữ liệu',
          blocks: [
            `${S.legalName} (mã số doanh nghiệp ${S.registrationNumber}), địa chỉ ${S.address}. Liên hệ về dữ liệu cá nhân: ${S.privacyEmail}.`,
          ],
        },
        {
          heading: 'Dữ liệu được thu thập',
          blocks: [
            [
              'Thông tin tài khoản: họ tên, email, ngày sinh (không bắt buộc), số điện thoại, mật khẩu (được mã hóa).',
              'Thông tin đơn hàng: người nhận, số điện thoại, địa chỉ giao hàng, ghi chú, sản phẩm đã mua, phương thức thanh toán, thông tin hóa đơn công ty (nếu có).',
              'Thông tin hoàn tiền: tên ngân hàng, số tài khoản, chủ tài khoản khi bạn yêu cầu hoàn tiền cho đơn COD.',
              'Nội dung bạn gửi: đánh giá sản phẩm, ảnh đính kèm yêu cầu trả hàng, yêu cầu hỗ trợ.',
              'Dữ liệu trên trình duyệt: giỏ hàng và danh sách yêu thích được lưu ngay trên thiết bị của bạn để không bị mất khi tải lại trang.',
            ],
          ],
        },
        {
          heading: 'Mục đích xử lý',
          blocks: [
            [
              'Tạo và quản lý tài khoản, xử lý đơn hàng, giao hàng, thanh toán, xuất hóa đơn, trả hàng và hoàn tiền.',
              'Chăm sóc khách hàng và giải quyết khiếu nại.',
              'Gửi thông tin ưu đãi, chỉ khi bạn đã đồng ý riêng cho mục đích này. Bạn có thể rút lại đồng ý bất cứ lúc nào.',
              'Thực hiện nghĩa vụ theo quy định của pháp luật về thuế, kế toán và thương mại điện tử.',
            ],
            'nine2fine không bán dữ liệu cá nhân của bạn.',
          ],
        },
        {
          heading: 'Chia sẻ dữ liệu',
          blocks: [
            'Dữ liệu chỉ được chia sẻ trong phạm vi cần thiết với: đơn vị vận chuyển (tên, số điện thoại, địa chỉ giao), ngân hàng và đơn vị hỗ trợ thanh toán, nhà cung cấp hóa đơn điện tử, và cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.',
          ],
        },
        {
          heading: 'Thời gian lưu trữ',
          blocks: [
            'Dữ liệu tài khoản được lưu đến khi bạn yêu cầu xóa tài khoản. Dữ liệu giao dịch và hóa đơn được lưu theo thời hạn mà pháp luật về kế toán, thuế và thương mại điện tử yêu cầu, sau đó được xóa hoặc ẩn danh.',
          ],
        },
        {
          heading: 'Quyền của bạn',
          blocks: [
            [
              'Được biết về việc xử lý dữ liệu, đồng ý hoặc không đồng ý, rút lại sự đồng ý.',
              'Xem, chỉnh sửa dữ liệu (trong mục Tài khoản) hoặc yêu cầu cung cấp bản sao dữ liệu.',
              'Yêu cầu xóa, hạn chế xử lý hoặc phản đối việc xử lý dữ liệu, trừ trường hợp pháp luật yêu cầu lưu giữ.',
              'Khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường thiệt hại theo quy định của pháp luật.',
            ],
            `Gửi yêu cầu đến ${S.privacyEmail}. nine2fine phản hồi trong vòng 72 giờ và hoàn tất trong thời hạn pháp luật quy định.`,
            'Người dưới 16 tuổi cần có sự đồng ý của cha mẹ hoặc người giám hộ trước khi tạo tài khoản hoặc đặt hàng.',
          ],
        },
        {
          heading: 'Bảo vệ dữ liệu',
          blocks: [
            'Dữ liệu được truyền qua kết nối mã hóa, mật khẩu được lưu dưới dạng băm, quyền truy cập nội bộ được giới hạn theo nhu cầu công việc. Khi xảy ra sự cố lộ lọt dữ liệu, nine2fine sẽ thông báo cho bạn và cơ quan có thẩm quyền theo quy định.',
          ],
        },
      ],
    },
    {
      slug: 'terms',
      label: 'Điều khoản sử dụng',
      title: 'Điều khoản sử dụng và mua hàng',
      summary: 'Quy định khi bạn sử dụng website và đặt hàng tại nine2fine.',
      sections: [
        {
          heading: 'Thông tin người bán',
          blocks: [
            `Website nine2fine.vn do ${S.legalName} sở hữu và vận hành. Giấy chứng nhận đăng ký doanh nghiệp số ${S.registrationNumber} do ${S.registrationIssuer} cấp. Địa chỉ: ${S.address}. Hotline: ${S.hotline}. Email: ${S.email}.`,
          ],
        },
        {
          heading: 'Tài khoản',
          blocks: [
            'Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và mã xác thực gửi về email. Không cần tài khoản để mua hàng; khách không đăng nhập có thể tra cứu và hủy đơn bằng mã đơn và số điện thoại hoặc email đã dùng khi đặt.',
          ],
        },
        {
          heading: 'Đặt hàng và xác lập hợp đồng',
          blocks: [
            'Trước khi đặt, bạn xem lại sản phẩm, số lượng, giá, phí giao hàng, mã giảm giá, tổng tiền, địa chỉ giao và phương thức thanh toán. Hợp đồng mua bán được xác lập khi nine2fine hiển thị xác nhận đặt hàng thành công kèm mã đơn.',
            'Nếu sản phẩm hết hàng hoặc thông tin giá bị sai sót rõ ràng sau khi đặt, nine2fine sẽ liên hệ để bạn chọn tiếp tục với thông tin đúng hoặc hủy đơn và được hoàn toàn bộ số tiền đã trả.',
          ],
        },
        {
          heading: 'Giá và khuyến mãi',
          blocks: [
            'Giá đã bao gồm VAT. Mỗi mã giảm giá có điều kiện áp dụng riêng (giá trị đơn tối thiểu, thời hạn, đối tượng) được hiển thị trong ví phiếu giảm giá và tại bước thanh toán. Mã không áp dụng được sẽ được báo rõ lý do trước khi bạn đặt hàng.',
          ],
        },
        {
          heading: 'Đánh giá sản phẩm',
          blocks: [
            'Chỉ khách đã mua và nhận sản phẩm mới được đánh giá sản phẩm đó. Đánh giá phải trung thực, không chứa thông tin cá nhân của người khác, nội dung xúc phạm hay quảng cáo. nine2fine không chỉnh sửa nội dung đánh giá và chỉ gỡ đánh giá vi phạm các quy định này.',
          ],
        },
        {
          heading: 'Sở hữu trí tuệ',
          blocks: [
            'Tên, logo nine2fine, hình ảnh, nội dung và thiết kế trên website thuộc quyền của nine2fine hoặc bên cấp phép. Không được sao chép, sử dụng cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản.',
          ],
        },
        {
          heading: 'Luật áp dụng',
          blocks: [
            'Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được giải quyết theo Chính sách giải quyết khiếu nại; nếu không thương lượng được, các bên có thể đưa ra hòa giải, trọng tài thương mại hoặc tòa án có thẩm quyền.',
          ],
        },
      ],
    },
    {
      slug: 'membership',
      label: 'Quyền lợi thành viên',
      title: 'Chính sách quyền lợi thành viên',
      summary:
        'Tạo tài khoản miễn phí để nhận ưu đãi đơn đầu, quà sinh nhật và lên hạng Silver, Gold theo chi tiêu.',
      sections: [
        {
          heading: 'Ai là thành viên',
          blocks: [
            'Mọi khách hàng tạo tài khoản trên nine2fine.vn đều là thành viên, không mất phí. Tài khoản mới bắt đầu ở hạng Bronze.',
          ],
        },
        {
          heading: 'Quyền lợi của mọi thành viên',
          blocks: [
            [
              `Giảm ${M.welcomePercent}% cho đơn hàng đầu tiên từ ${vnd(M.welcomeMinOrder)}.`,
              `Phiếu giảm ${vnd(M.birthdayAmount)} trong tháng sinh nhật cho đơn từ ${vnd(M.birthdayMinOrder)}. Vui lòng cập nhật ngày sinh trong Tài khoản → Hồ sơ trước tháng sinh nhật.`,
              'Lưu sản phẩm yêu thích và sổ địa chỉ để đặt hàng nhanh hơn.',
              'Xem lịch sử mua hàng, theo dõi đơn và gửi yêu cầu trả hàng ngay trong tài khoản.',
              'Đánh giá sản phẩm đã mua.',
            ],
          ],
        },
        {
          heading: 'Hạng thành viên',
          cards: [
            {
              image: '/assets/membership/card-bronze.webp',
              name: 'Bronze',
              requirement: 'Từ khi tạo tài khoản',
              perk: 'Quyền lợi của mọi thành viên',
            },
            {
              image: '/assets/membership/card-silver.webp',
              name: 'Silver',
              requirement: `Chi tiêu từ ${vnd(M.silverFrom)} trong kỳ`,
              perk: `Thêm phiếu giảm ${vnd(M.silverAmount)} cho đơn từ ${vnd(M.silverMinOrder)}`,
            },
            {
              image: '/assets/membership/card-gold.webp',
              name: 'Gold',
              requirement: `Chi tiêu từ ${vnd(M.goldFrom)} trong kỳ`,
              perk: `Thêm phiếu giảm ${vnd(M.goldAmount)} cho đơn từ ${vnd(M.goldMinOrder)}`,
            },
          ],
          blocks: [
            'Hạng cao hơn giữ toàn bộ quyền lợi của hạng thấp hơn. Hạng hiện tại và số tiền cần để lên hạng tiếp theo hiển thị trong Tài khoản → Hồ sơ.',
          ],
        },
        {
          heading: 'Cách tính chi tiêu',
          blocks: [
            [
              'Tính theo số tiền thực trả của đơn đã giao thành công, sau giảm giá, không gồm phí giao hàng.',
              'Đơn đã hủy và phần giá trị đã hoàn tiền khi trả hàng không được tính.',
              'Chỉ tính đơn đặt khi đã đăng nhập tài khoản. Đơn mua không cần tài khoản không được cộng dồn về sau.',
            ],
          ],
        },
        {
          heading: 'Lên hạng và xét lại hạng',
          blocks: [
            'Bạn được lên hạng ngay khi tổng chi tiêu đạt mức của hạng mới.',
            `Hạng được xét lại vào ngày ${M.reviewDay} hằng năm theo chi tiêu của năm đó. Nếu chưa đạt mức giữ hạng, hạng giảm một bậc và chi tiêu bắt đầu tính lại từ 0 cho kỳ mới.`,
          ],
        },
        {
          heading: 'Điều kiện dùng phiếu giảm giá',
          blocks: [
            [
              'Phiếu ưu đãi thành viên nằm trong Tài khoản → Phiếu giảm giá, kèm mã, điều kiện và hạn dùng.',
              'Mỗi phiếu dùng một lần, mỗi đơn áp dụng một mã và không quy đổi thành tiền mặt.',
            ],
          ],
        },
        {
          heading: 'Thay đổi chương trình',
          blocks: [
            'nine2fine có thể điều chỉnh quyền lợi hoặc mức xét hạng. Mọi thay đổi được đăng trên trang này ít nhất 30 ngày trước khi áp dụng và không ảnh hưởng đến hạng hoặc phiếu bạn đang có.',
          ],
        },
      ],
    },
    {
      slug: 'complaints',
      label: 'Giải quyết khiếu nại',
      title: 'Chính sách tiếp nhận và giải quyết khiếu nại',
      summary: 'Cách gửi khiếu nại và thời gian nine2fine xử lý.',
      sections: [
        {
          heading: 'Kênh tiếp nhận',
          blocks: [
            [
              `Hotline ${S.hotline} (${S.hours}).`,
              `Email ${S.email}.`,
              `Trực tiếp tại ${S.address}.`,
            ],
            'Vui lòng cung cấp mã đơn, số điện thoại đặt hàng, nội dung khiếu nại và hình ảnh liên quan (nếu có).',
          ],
        },
        {
          heading: 'Thời gian xử lý',
          blocks: [
            [
              'Xác nhận đã tiếp nhận trong vòng 24 giờ làm việc.',
              'Phản hồi kết quả trong vòng 7 ngày làm việc. Trường hợp phức tạp cần xác minh với đơn vị vận chuyển, nine2fine sẽ báo trước thời gian dự kiến.',
            ],
          ],
        },
        {
          heading: 'Nếu bạn chưa đồng ý với kết quả',
          blocks: [
            'Bạn có quyền yêu cầu cơ quan quản lý nhà nước về bảo vệ quyền lợi người tiêu dùng hỗ trợ, hoặc giải quyết tranh chấp bằng thương lượng, hòa giải, trọng tài hoặc tòa án theo Luật Bảo vệ quyền lợi người tiêu dùng.',
          ],
        },
      ],
    },
  ];
}

const current = computed(() => buildPolicies(storeSettings()));

/** The published policies for the current settings (a signal read: templates update on change). */
export function policies(): Policy[] {
  return current();
}

export function findPolicy(slug: string | null): Policy | undefined {
  return policies().find((policy) => policy.slug === slug);
}
