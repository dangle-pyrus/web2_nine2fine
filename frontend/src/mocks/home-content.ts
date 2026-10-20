import { HomeContent } from '../app/features/home/home-content';

/**
 * Demo editorial copy for the homepage. Feature claims in `usp` are provisional until the
 * product team confirms them (master plan 0.1); stock photos never act as proof of a feature.
 */
export const HOME_CONTENT_FIXTURE: HomeContent = {
  hero: {
    lines: ['From', 'Nine', 'to Fine.'],
    accent: 'Từ bàn làm việc đến cuộc hẹn tối nay',
    timeline: [
      { time: '09:00', label: 'Work' },
      { time: '20:00', label: 'Dinner' },
    ],
    mediaId: 'editorial-home-hero',
    mobileMediaId: 'editorial-home-hero-mobile',
    primary: { label: 'Mua bộ sưu tập mới', link: '/new-in' },
    secondary: { label: 'Xem câu chuyện', link: '/', fragment: 'story' },
  },
  categories: {
    eyebrow: 'The everyday wardrobe',
    title: 'Tủ đồ, theo cách của bạn.',
    cta: { label: 'Xem tất cả sản phẩm', link: '/shop' },
    cards: [
      {
        category: 'tops',
        mediaId: 'editorial-home-hero-mobile',
        caption: 'Bắt đầu từ điều giản đơn.',
      },
      { category: 'bottoms', mediaId: 'editorial-new-drop', caption: 'Tự do trong từng bước đi.' },
      {
        category: 'dresses',
        mediaId: 'editorial-moment-event',
        caption: 'Cho những cuộc hẹn của bạn.',
      },
      {
        category: 'outerwear',
        mediaId: 'editorial-story-0900',
        caption: 'Một lớp khoác. Một dấu ấn.',
      },
    ],
  },
  story: {
    eyebrow: 'Your day. Your way.',
    title: 'Ba khoảnh khắc. Một nhịp sống.',
    intro:
      'Từ buổi họp đầu ngày đến cuộc hẹn tối: ba gợi ý phối đồ để bạn tìm thấy cách mặc của mình.',
    moments: [
      {
        id: 'story-work',
        time: '09:00',
        label: 'At work',
        title: 'Gọn gàng cho buổi họp đầu ngày',
        copy: 'Bắt đầu với blazer dáng suông và một lớp áo đơn sắc. Gọn gàng, vừa đủ để là chính mình.',
        mediaId: 'editorial-story-0900',
        productSlug: 'the-everyday-blazer',
      },
      {
        id: 'story-after-work',
        time: '17:30',
        label: 'Off the clock',
        title: 'Tắt máy, xắn tay áo',
        copy: 'Quần ống thẳng, tay áo xắn nhẹ. Một gợi ý thoải mái hơn cho những kế hoạch sau giờ làm.',
        mediaId: 'editorial-story-1730',
        productSlug: 'the-straight-trousers',
      },
      {
        id: 'story-dinner',
        time: '20:00',
        label: 'Dinner plans',
        title: 'Dành buổi tối cho chính bạn',
        copy: 'Một chiếc đầm, một lớp khoác hay điểm nhấn trang sức. Chọn cách xuất hiện cho cuộc hẹn tối nay.',
        mediaId: 'editorial-story-2000',
        productSlug: 'after-hours-dress',
      },
    ],
  },
  moments: {
    eyebrow: 'Shop by moment',
    title: 'Mặc cho khoảnh khắc của bạn',
    cards: [
      {
        moment: 'work',
        title: 'Work',
        lines: ['Sharp enough for 9AM.', 'Easy enough for 9PM.'],
        mediaId: 'editorial-moment-work',
      },
      {
        moment: 'dinner',
        title: 'Dinner',
        lines: ['Đường nét gọn gàng', 'cho những bữa tối của riêng bạn.'],
        mediaId: 'editorial-moment-dinner',
      },
      {
        moment: 'event',
        title: 'Event',
        lines: ['Tự tin ở mọi buổi tiệc,', 'không cần cầu kỳ.'],
        mediaId: 'editorial-moment-event',
      },
      {
        moment: 'weekend',
        title: 'Weekend',
        lines: ['Thư thái, nhưng vẫn', 'đúng chất của bạn.'],
        mediaId: 'editorial-moment-weekend',
      },
    ],
  },
  newDrop: {
    number: '02',
    title: 'The Everyday Edit',
    copy: 'Những phom dáng mới cho nhịp sống 24/7: blazer suông, quần ống thẳng và chân váy midi.',
    mediaId: 'editorial-new-drop',
    cta: { label: 'Xem hàng mới về', link: '/new-in' },
  },
  bestSellers: { title: 'Được yêu thích nhất', cta: { label: 'Xem tất cả', link: '/shop' } },
  usp: {
    eyebrow: 'Designed to move with you',
    title: 'Thiết kế để đi cùng bạn',
    provisional: true,
    pillars: [
      {
        title: 'Reversible',
        lines: ['One piece.', 'Two ways.'],
        detail: 'Một món đồ, hai cách mặc cho ngày và đêm.',
      },
      {
        title: 'Removable',
        lines: ['Change the detail.', 'Change the mood.'],
        detail: 'Chi tiết tháo rời để đổi phong cách trong vài giây.',
      },
      {
        title: 'Wrinkle-resistant',
        lines: ['From commute', 'to dinner.'],
        detail: 'Giữ phom gọn gàng sau một ngày dài di chuyển.',
      },
    ],
  },
  campaign: {
    eyebrow: 'Campaign 2026',
    lines: ['After', 'Hours.'],
    copy: 'Khi thành phố lên đèn, nhịp sống của bạn mới thật sự bắt đầu.',
    mediaId: 'editorial-campaign',
    cta: { label: 'Xem bộ sưu tập Dinner', link: '/shop-by-moment/dinner' },
  },
  reviews: { title: 'Mặc thử, rồi kể lại', productIds: ['01', '02', '03'] },
  club: {
    title: 'After Five Club',
    perks: ['New drops.', 'Private offers.', 'After-hours inspiration.'],
    consent: 'Bằng việc đăng ký, bạn đồng ý nhận email từ nine2fine. Có thể hủy bất cứ lúc nào.',
  },
};
