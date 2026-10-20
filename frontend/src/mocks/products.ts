import { Product, ProductVariant } from '../app/features/catalog/models/product';

type BaseProduct = Omit<Product, 'type' | 'gallery' | 'care' | 'fit' | 'looks'>;

function variants(id: string, colors: { name: string; hex: string }[]): ProductVariant[] {
  return colors.flatMap((color, index) =>
    ['S', 'M', 'L', 'XL'].map((size, sizeIndex) => ({
      id: `${id}-${index}-${size}`,
      sku: `N2F-${id}-${index}-${size}`,
      size,
      color,
      inventory: sizeIndex === 3 ? 0 : 5 + index,
    })),
  );
}

const black = { name: 'Đen', hex: '#242323' };
const white = { name: 'Trắng', hex: '#f5f4f0' };
const red = { name: 'Đỏ', hex: '#a91e2c' };
const gray = { name: 'Xám', hex: '#96958f' };

// Demo catalog only; merchandising claims, prices and Nam/Nữ assortment require business validation.
const BASE_PRODUCTS: BaseProduct[] = [
  {
    id: '01',
    slug: 'the-everyday-blazer',
    name: 'The Everyday Blazer',
    category: 'outerwear',
    moments: ['work', 'dinner'],
    genders: ['nam', 'nu'],
    price: 1290000,
    badge: 'NEW',
    mediaId: 'catalog-placeholder',
    variants: variants('01', [black, gray]),
    description:
      'Phom dáng thoải mái, dễ kết hợp cùng quần suông hoặc chân váy cho những cuộc hẹn sau giờ làm.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-10-01',
    salesRank: 2,
  },
  {
    id: '02',
    slug: 'nine-to-fine-shirt',
    name: 'Nine-to-Fine Shirt',
    category: 'tops',
    moments: ['work', 'weekend'],
    genders: ['nam', 'nu'],
    price: 590000,
    badge: 'BESTSELLER',
    mediaId: 'catalog-placeholder',
    variants: variants('02', [white, black]),
    description: 'Áo sơ mi phom thoải mái, một lựa chọn dễ phối cho ngày làm việc và cuối tuần.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-27',
    salesRank: 1,
  },
  {
    id: '03',
    slug: 'after-hours-dress',
    name: 'After Hours Dress',
    category: 'dresses',
    moments: ['dinner', 'event'],
    genders: ['nu'],
    price: 890000,
    compareAtPrice: 1090000,
    mediaId: 'catalog-placeholder',
    variants: variants('03', [red, black]),
    description: 'Đường nét gọn gàng và tinh tế dành cho những buổi tối của riêng bạn.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-29',
    salesRank: 4,
  },
  {
    id: '04',
    slug: 'the-straight-trousers',
    name: 'The Straight Trousers',
    category: 'bottoms',
    moments: ['work', 'dinner'],
    genders: ['nam', 'nu'],
    price: 690000,
    badge: 'NEW',
    mediaId: 'catalog-placeholder',
    variants: variants('04', [gray, black]),
    description:
      'Quần ống suông với phom dáng dễ phối, đi cùng bạn từ văn phòng đến cuộc hẹn cuối ngày.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-10-02',
    salesRank: 3,
  },
  {
    id: '05',
    slug: 'off-duty-top',
    name: 'Off-Duty Top',
    category: 'tops',
    moments: ['weekend', 'dinner'],
    genders: ['nu'],
    price: 390000,
    mediaId: 'catalog-placeholder',
    variants: variants('05', [white, red]),
    description: 'Một thiết kế gọn nhẹ để phối cùng những món đồ bạn yêu thích.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-20',
    salesRank: 6,
  },
  {
    id: '06',
    slug: 'the-midi-skirt',
    name: 'The Midi Skirt',
    category: 'bottoms',
    moments: ['work', 'event'],
    genders: ['nu'],
    price: 650000,
    mediaId: 'catalog-placeholder',
    variants: variants('06', [black, gray]),
    description: 'Chân váy midi với đường nét tối giản cho những ngày muốn thay đổi nhịp điệu.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-22',
    salesRank: 5,
  },
  {
    id: '07',
    slug: 'weekend-shirt',
    name: 'The Weekend Shirt',
    category: 'tops',
    moments: ['weekend'],
    genders: ['nam'],
    price: 550000,
    mediaId: 'catalog-placeholder',
    variants: variants('07', [white, gray]),
    description: 'Phom áo thư thái cho một ngày không vội.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-18',
    salesRank: 7,
  },
  {
    id: '08',
    slug: 'city-vest',
    name: 'The City Vest',
    category: 'outerwear',
    moments: ['work', 'event'],
    genders: ['nam'],
    price: 790000,
    badge: 'NEW',
    mediaId: 'catalog-placeholder',
    variants: variants('08', [black, white]),
    description: 'Áo gile dễ kết hợp với sơ mi hoặc mặc riêng cho buổi tối.',
    material: 'Thông tin chất liệu sẽ được cập nhật.',
    createdAt: '2026-09-30',
    salesRank: 8,
  },
];

/** Demo merchandising copy per product; replace with real PIM data. */
const MERCH: Record<string, Pick<Product, 'type' | 'fit'>> = {
  '01': {
    type: 'Áo blazer · Dáng suông',
    fit: {
      summary: 'Đúng size · Dáng suông vừa, dài ngang hông',
      model: 'Người mẫu cao 168 cm, mặc size S',
    },
  },
  '02': {
    type: 'Áo sơ mi · Dáng rộng nhẹ',
    fit: { summary: 'Đúng size · Rộng nhẹ ở thân', model: 'Người mẫu cao 175 cm, mặc size M' },
  },
  '03': {
    type: 'Đầm midi · Ôm nhẹ',
    fit: {
      summary: 'Hơi nhỏ · Nên chọn lớn hơn một size nếu thích thoải mái',
      model: 'Người mẫu cao 167 cm, mặc size S',
    },
  },
  '04': {
    type: 'Quần ống suông · Lưng cao',
    fit: {
      summary: 'Đúng size · Ống suông, dài chạm mắt cá',
      model: 'Người mẫu cao 170 cm, mặc size S',
    },
  },
  '05': {
    type: 'Áo kiểu · Dáng ngắn',
    fit: { summary: 'Đúng size · Dáng lửng, ôm vừa', model: 'Người mẫu cao 165 cm, mặc size S' },
  },
  '06': {
    type: 'Chân váy midi · Xếp ly',
    fit: { summary: 'Đúng size · Lưng chun phía sau', model: 'Người mẫu cao 168 cm, mặc size S' },
  },
  '07': {
    type: 'Áo sơ mi · Dáng rộng',
    fit: {
      summary: 'Hơi rộng · Có thể chọn nhỏ hơn một size',
      model: 'Người mẫu cao 178 cm, mặc size M',
    },
  },
  '08': {
    type: 'Áo gile · Dáng đứng',
    fit: {
      summary: 'Đúng size · Vừa vai, mặc được bên ngoài sơ mi',
      model: 'Người mẫu cao 180 cm, mặc size M',
    },
  },
};

// Same timestamps as the homepage story (user decision 2026-10-02: 09:00 / 17:30 / 20:00).
const LOOKS: Product['looks'] = [
  {
    time: '09:00',
    moment: 'At work',
    tip: 'Phối cùng sơ mi trắng và giày loafer cho buổi họp đầu ngày.',
  },
  {
    time: '17:30',
    moment: 'Off the clock',
    tip: 'Mở một cúc, xắn tay áo và cất thẻ nhân viên khi rời văn phòng.',
  },
  {
    time: '20:00',
    moment: 'Dinner plans',
    tip: 'Thêm trang sức bạc, đổi giày để bước vào bữa tối.',
  },
];

export const PRODUCTS: Product[] = BASE_PRODUCTS.map((product) => ({
  ...product,
  ...MERCH[product.id],
  gallery: ['catalog-placeholder', 'gallery-model', 'gallery-styling', 'gallery-detail'],
  care: ['Giặt tay hoặc giặt máy chế độ nhẹ ở 30°C', 'Không dùng chất tẩy', 'Ủi ở nhiệt độ thấp'],
  looks: LOOKS,
}));
