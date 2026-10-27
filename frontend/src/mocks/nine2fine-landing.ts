import {
  LandingCampaign,
  LandingContent,
  LandingEdit,
  LandingShop,
} from '../app/features/home/landing-content';

function campaign(
  id: string,
  eyebrow: string,
  title: string,
  description: string,
  href: string,
  mediaId: string,
  mobileMediaId = mediaId,
): LandingCampaign {
  return { kind: 'campaign', id, eyebrow, title, description, href, mediaId, mobileMediaId };
}

function edit(id: string, label: string, cards: LandingEdit['cards']): LandingEdit {
  return { kind: 'products', id, label, cards };
}

function shop(
  id: string,
  label: string,
  sort: LandingShop['sort'],
  href: string,
  queryParams?: LandingShop['queryParams'],
): LandingShop {
  return { kind: 'shop', id, label, sort, href, queryParams };
}

/** Brand copy with temporary editorial imagery. No reference photo represents a nine2fine SKU. */
export const NINE2FINE_LANDING: LandingContent = {
  categories: [
    { label: 'Áo', href: '/shop/tops', mediaId: 'uniqlo-category-05' },
    { label: 'Quần & chân váy', href: '/shop/bottoms', mediaId: 'uniqlo-category-02' },
    { label: 'Đầm', href: '/shop/dresses', mediaId: 'uniqlo-category-07' },
    { label: 'Áo khoác', href: '/shop/outerwear', mediaId: 'uniqlo-category-01' },
  ],
  moments: [
    { label: 'Đi làm', href: '/shop-by-moment/work' },
    { label: 'Hẹn tối', href: '/shop-by-moment/dinner' },
    { label: 'Dự tiệc', href: '/shop-by-moment/event' },
    { label: 'Cuối tuần', href: '/shop-by-moment/weekend' },
  ],
  blocks: [
    {
      ...campaign(
        'from-nine-to-fine',
        'nine2fine · Đi làm tới đi chơi',
        'From Nine to Fine.',
        'Chín giờ vào làm, tám giờ ra phố.\nVẫn bộ đồ ấy, vẫn là bạn.',
        '/shop',
        'uniqlo-campaign-01',
      ),
      titleLang: 'en',
    },
    { kind: 'categories', id: 'categories' },
    shop('bestsellers', 'Bán chạy', 'bestselling', '/shop', { sort: 'bestselling' }),
    campaign(
      'the-first-layer',
      '09:00 · Sáng đi làm',
      'Khoác vội, vẫn ra dáng.',
      'Lỡ báo thức? Sơ mi, quần suông, áo khoác.\nVào làm như đã chọn đồ từ tối.',
      '/shop/outerwear',
      'uniqlo-campaign-02',
      'uniqlo-campaign-02-mobile',
    ),
    edit('work-edit', 'Mặc gì sáng mai?', [
      {
        title: 'Khoác vào là đi',
        caption: 'Xem áo khoác',
        href: '/shop/outerwear',
        mediaId: 'uniqlo-product-1-1-09',
      },
      {
        title: 'Quần mặc cả tuần',
        caption: 'Xem quần & chân váy',
        href: '/shop/bottoms',
        mediaId: 'uniqlo-product-1-2-65',
      },
      {
        title: 'Sơ mi cho họp sáng',
        caption: 'Xem áo sơ mi',
        href: '/shop/tops',
        mediaId: 'uniqlo-product-1-3-00',
      },
      {
        title: 'Thêm chút màu cho tuần làm',
        caption: 'Mặc đi làm',
        href: '/shop-by-moment/work',
        mediaId: 'uniqlo-product-1-4-55',
      },
    ]),
    campaign(
      'everyday-foundations',
      'Tủ đồ mỗi ngày',
      'Mở tủ là có đồ để mặc.',
      'Vài món nền trung tính,\nphối kiểu nào cũng đẹp.',
      '/shop/bottoms',
      'uniqlo-campaign-03',
      'uniqlo-campaign-03-mobile',
    ),
    edit('colour-edit', 'Hôm nay màu gì?', [
      {
        title: 'Áo sáng màu cho ngày xám',
        caption: 'Xem áo sáng màu',
        href: '/shop/tops',
        mediaId: 'uniqlo-product-2-1-41',
      },
      {
        title: 'Hồng nhẹ cho hẹn tối',
        caption: 'Mặc hẹn tối',
        href: '/shop-by-moment/dinner',
        mediaId: 'uniqlo-product-2-2-10',
      },
      {
        title: 'Be, xám, khó sai',
        caption: 'Xem áo khoác',
        href: '/shop/outerwear',
        mediaId: 'uniqlo-product-2-3-37',
      },
      {
        title: 'Sơ mi xanh cho sáng thứ Hai',
        caption: 'Xem áo sơ mi',
        href: '/shop/tops',
        mediaId: 'uniqlo-product-2-4-57',
      },
    ]),
    campaign(
      'off-the-clock',
      '17:30 · Tan làm',
      'Tắt máy. Chưa vội về.',
      'Không kịp về thay đồ? Xắn tay áo, mở cúc cổ.\nRồi đi luôn.',
      '/shop-by-moment/dinner',
      'editorial-story-1730',
    ),
    campaign(
      'after-hours',
      '20:00 · Hẹn tối',
      'Giờ này là của bạn.',
      '“Tối nay rảnh không?” lúc 17:00.\nMột chiếc đầm, đi được ngay.',
      '/shop/dresses',
      'editorial-story-2000',
    ),
    campaign(
      'make-an-entrance',
      'Dự tiệc',
      'Tiệc công ty? Có đồ rồi.',
      'Nổi bật vừa đủ để được nhớ,\nkhông quá đà để phải ngại.',
      '/shop-by-moment/event',
      'editorial-moment-event',
    ),
    campaign(
      'weekend-mode',
      'Cuối tuần',
      'Tắt chuông. Ngủ nướng.',
      'Dậy muộn, cà phê chậm, không ai giục.\nMặc gì thoải mái mà vẫn đẹp.',
      '/shop-by-moment/weekend',
      'uniqlo-campaign-07',
      'uniqlo-campaign-07-mobile',
    ),
    edit('weekend-edit', 'Ngày không báo thức', [
      {
        title: 'Áo màu tươi cho ngày nghỉ',
        caption: 'Xem áo',
        href: '/shop/tops',
        mediaId: 'uniqlo-product-3-1-19',
      },
      {
        title: 'Áo thun ra quán quen',
        caption: 'Mặc cuối tuần',
        href: '/shop-by-moment/weekend',
        mediaId: 'uniqlo-product-3-2-30',
      },
      {
        title: 'Gam xám, vẫn có điểm nhấn',
        caption: 'Xem quần',
        href: '/shop/bottoms',
        mediaId: 'uniqlo-product-3-3-03',
      },
      {
        title: 'Suông, trầm, dễ chịu',
        caption: 'Xem quần suông',
        href: '/shop/bottoms',
        mediaId: 'uniqlo-product-3-4-39',
      },
    ]),
    campaign(
      'new-perspective',
      'Mới về',
      'Tủ đồ quen, thêm món mới.',
      'Muốn đổi gió cho tuần sau?\nThử một phom dáng mới.',
      '/new-in',
      'uniqlo-campaign-08',
      'uniqlo-campaign-08-mobile',
    ),
    shop('new-in-products', 'Hàng mới về', 'newest', '/new-in'),
    {
      ...campaign(
        'after-five-club',
        'Thành viên nine2fine',
        'After Five Club',
        'Ưu đãi đơn đầu, quà tháng sinh nhật.\nLưu món ưng ý, theo dõi đơn ở một chỗ.',
        '/auth/register',
        'editorial-campaign',
      ),
      titleLang: 'en',
      member: {
        description: 'Chào mừng bạn trở lại.\nMón đã lưu và đơn hàng đang chờ bạn.',
        href: '/account',
      },
    },
  ],
};
