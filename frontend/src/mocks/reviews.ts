import { Category, ProductReview, SizeChart } from '../app/features/catalog/models/product';

/**
 * Demonstration reviews for the mock adapter. They are labelled as sample data in the UI and
 * must never be presented as real customer testimonials.
 */
export const SAMPLE_REVIEWS: Record<string, ProductReview[]> = {
  '01': [
    {
      id: 'r1',
      author: 'Ngọc A.',
      rating: 5,
      fit: 0,
      sizeBought: 'S',
      height: '160 cm',
      title: 'Mặc từ sáng đến tối vẫn gọn',
      body: 'Vai vừa, tay dài vừa đủ. Mặc đi làm rồi đi ăn tối không cần thay.',
      date: '2026-09-21',
    },
    {
      id: 'r2',
      author: 'Huy T.',
      rating: 4,
      fit: 1,
      sizeBought: 'L',
      height: '176 cm',
      title: 'Hơi rộng ở thân',
      body: 'Phom đẹp, chất vải đứng. Mình thích ôm hơn nên lẽ ra chọn size M.',
      date: '2026-09-14',
    },
    {
      id: 'r3',
      author: 'Linh P.',
      rating: 5,
      fit: 0,
      sizeBought: 'M',
      height: '165 cm',
      title: 'Đúng size',
      body: 'Dễ phối với quần suông lẫn chân váy. Màu đen không bị bạc sau vài lần giặt.',
      date: '2026-09-02',
    },
  ],
  '02': [
    {
      id: 'r4',
      author: 'Minh K.',
      rating: 5,
      fit: 0,
      sizeBought: 'M',
      height: '172 cm',
      title: 'Sơ mi mặc cả tuần',
      body: 'Ít nhăn, thoáng. Rộng nhẹ đúng như mô tả.',
      date: '2026-09-25',
    },
    {
      id: 'r5',
      author: 'Thảo V.',
      rating: 4,
      fit: -1,
      sizeBought: 'S',
      height: '163 cm',
      title: 'Tay hơi ngắn',
      body: 'Thân vừa nhưng tay hơi ngắn với mình, nên cân nhắc lên size.',
      date: '2026-09-10',
    },
  ],
  '03': [
    {
      id: 'r6',
      author: 'Hà M.',
      rating: 4,
      fit: -1,
      sizeBought: 'S',
      height: '158 cm',
      title: 'Ôm hơn mong đợi',
      body: 'Dáng đẹp cho buổi tối, nhưng nên lên một size nếu muốn thoải mái.',
      date: '2026-09-28',
    },
  ],
};

const BODY_TOP = ['Ngực', 'Eo', 'Vai'];
const BODY_BOTTOM = ['Eo', 'Mông', 'Dài chân trong'];

/** Demonstration size charts in cm; replace with the brand's measured charts. */
export const SIZE_CHARTS: Record<Category, SizeChart> = {
  tops: chart(
    BODY_TOP,
    ['Rộng ngực', 'Dài áo', 'Dài tay'],
    [
      ['S', ['82–86', '64–68', '37'], ['96', '64', '58']],
      ['M', ['86–90', '68–72', '38.5'], ['100', '66', '59']],
      ['L', ['90–96', '72–78', '40'], ['106', '68', '60']],
      ['XL', ['96–102', '78–84', '41.5'], ['112', '70', '61']],
    ],
  ),
  outerwear: chart(
    BODY_TOP,
    ['Rộng ngực', 'Dài áo', 'Rộng vai'],
    [
      ['S', ['82–86', '64–68', '37'], ['100', '70', '39']],
      ['M', ['86–90', '68–72', '38.5'], ['104', '72', '40.5']],
      ['L', ['90–96', '72–78', '40'], ['110', '74', '42']],
      ['XL', ['96–102', '78–84', '41.5'], ['116', '76', '43.5']],
    ],
  ),
  dresses: chart(
    ['Ngực', 'Eo', 'Mông'],
    ['Rộng ngực', 'Rộng eo', 'Dài váy'],
    [
      ['S', ['82–86', '64–68', '88–92'], ['86', '70', '112']],
      ['M', ['86–90', '68–72', '92–96'], ['90', '74', '114']],
      ['L', ['90–96', '72–78', '96–102'], ['96', '80', '116']],
      ['XL', ['96–102', '78–84', '102–108'], ['102', '86', '118']],
    ],
  ),
  bottoms: chart(
    BODY_BOTTOM,
    ['Vòng eo', 'Vòng mông', 'Dài'],
    [
      ['S', ['64–68', '88–92', '74'], ['68', '96', '98']],
      ['M', ['68–72', '92–96', '75'], ['72', '100', '99']],
      ['L', ['72–78', '96–102', '76'], ['78', '106', '100']],
      ['XL', ['78–84', '102–108', '77'], ['84', '112', '101']],
    ],
  ),
};

function chart(
  bodyColumns: string[],
  garmentColumns: string[],
  rows: [string, string[], string[]][],
): SizeChart {
  const toRow = (size: string, columns: string[], values: string[]) => ({
    size,
    values: Object.fromEntries(columns.map((column, index) => [column, values[index]])),
  });
  return {
    bodyColumns,
    garmentColumns,
    body: rows.map(([size, body]) => toRow(size, bodyColumns, body)),
    garment: rows.map(([size, , garment]) => toRow(size, garmentColumns, garment)),
  };
}
