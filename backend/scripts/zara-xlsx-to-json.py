"""
Chuyển file Excel sản phẩm (Zara_Products_Updated.xlsx, ảnh đã nằm trên Cloudinary) thành
`prisma/seed-data/zara-products.json` để `npm run seed:zara` nhập vào DB. Chạy một lần khi file Excel đổi:

    python -I scripts/zara-xlsx-to-json.py <file.xlsx> backend/.env

- Kích thước / dung lượng ảnh lấy từ Cloudinary Admin API (đọc CLOUDINARY_* trong .env, không in khoá ra).
- id ảnh = `up-<sha256(public_id)[:32]>.<jpg|webp>` (cùng mẫu ảnh tải lên), nên chạy lại cho cùng id.
- Gom dòng theo tên sản phẩm; mỗi màu một nhóm ảnh, biến thể = màu x size của chính dòng màu đó.
"""
import base64
import hashlib
import json
import re
import statistics
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import OrderedDict
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
XLSX, ENV = sys.argv[1], sys.argv[2]
OUT = Path(__file__).resolve().parent.parent / 'prisma' / 'seed-data' / 'zara-products.json'

CATEGORY = {  # danh mục Excel -> (slug danh mục web, nhãn loại, dịp mặc). Danh mục web = 8 nhóm của dữ liệu thật (2026-11-21).
    'Áo sơ mi': ('shirts', 'Áo sơ mi', ['work', 'dinner']),
    'Áo thun': ('tshirts', 'Áo thun', ['weekend']),
    'Áo len': ('knitwear', 'Áo len', ['work', 'weekend']),
    'Áo blazer': ('blazers', 'Áo blazer', ['work', 'dinner']),
    'Áo khoác': ('outerwear', 'Áo khoác', ['work', 'weekend']),
    'Đầm': ('dresses', 'Đầm', ['dinner', 'event']),
    'Quần': ('trousers', 'Quần', ['work', 'weekend']),
    'Chân váy': ('skirts', 'Chân váy', ['work', 'dinner']),
}
COLOR_FIX = {'White': 'Trắng', 'Xanh dươngTrắng': 'Xanh dương/Trắng', 'Xanh lụcNâu nhạt': 'Xanh lục/Nâu nhạt'}
HEX = {
    'Be': '#D8C3A5', 'Be nhạt': '#E8DCC8', 'Ghi': '#9E9E9E', 'Ghi xám': '#8D8D8D', 'Kaki': '#B5A27A', 'Kaki đậm': '#8B7D57',
    'Kem': '#F3EAD7', 'Mận chín đậm': '#5B1F3A', 'Nhiều màu': '#8C7B6B', 'Nâu': '#6F4E37', 'Nâu vàng': '#A97C50', 'Sọc': '#5C6B7A',
    'Trắng': '#FFFFFF', 'Trắng kem': '#F7F1E3', 'Trắng kem - Be': '#EEE3CF', 'Trắng ngà': '#FAF6EC', 'Trắng ngọc trai': '#F4F1EA',
    'Tím cà': '#4B2E4D', 'Tím hoa cà': '#B79FCB', 'Vàng': '#E8C547', 'Vàng camel nhạt': '#D2B48C', 'Xanh': '#3D6A9E',
    'Xanh - Trắng': '#9DB7D5', 'Xanh chàm': '#2E3A6E', 'Xanh da trời': '#87BDE8', 'Xanh dương trung tính': '#5B7DA3',
    'Xanh dương/Trắng': '#A9C1DE', 'Xanh lục/Nâu nhạt': '#7D8B5F', 'Xanh navy': '#1F2A44', 'Xanh nước biển': '#1E4E8C',
    'Xám': '#8A8A8A', 'Xanh bạc hà': '#9FCFC0', 'Xám muối tiêu': '#9C9C9C', 'Xám nhạt': '#C4C4C4', 'Xám than': '#3E3E3E', 'Xám trung tính': '#9A9690',
    'Xám đậm': '#555555', 'Đen': '#1A1A1A', 'Đen - Trắng': '#6E6E6E', 'Đỏ': '#C62828', 'Đỏ rượu vang nhạt': '#8E3A4A', 'Đỏ đô': '#7B1E2B',
}
SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'] + [str(n) for n in range(34, 58, 2)]

# 2026-11-21 (Thắng): không "nhiều màu" / màu ghép; màu theo ảnh thật (đã xem từng ảnh), ưu tiên tên màu đã có.
# rename: đổi tên (gộp khi hai màu về cùng tên). split: gán lại màu theo THỨ TỰ ảnh duy nhất (nhóm ảnh trong file bị trộn).
COLOR_OVERRIDES = {
    'check-100-wool-blazer-zw-collection': {'rename': {'Nhiều màu': 'Nâu'}},
    'lace-texture-mini-dress': {'rename': {'Đen - Trắng': 'Đen'}},
    'belted-satin-shirt': {'rename': {'Đen': 'Nâu'}},
    'brushed-effect-argyle-jumper': {'rename': {'Trắng kem - Be': 'Be'}},
    'chan-vay-midi-ke-o': {'rename': {'Be nhạt': 'Nâu'}},
    'chan-vay-midi-xoe-co-khoa-gai': {'rename': {'Tím cà': 'Nâu'}},
    'ao-vest-vai-tho-day-co-hai-ve-khuy-boc': {'rename': {'Nâu': 'Be'}},
    'ao-khoac-khaki-cropped-jacket': {'rename': {'Xanh': 'Xanh navy'}},
    'ao-khoac-dang-ngan-co-tron-phu-kien-kim-loai': {'rename': {'Đỏ': 'Đỏ đô'}},
    'ao-khoac-vai-tho-dang-croptop-tui-hop': {'rename': {'Xanh': 'Xanh da trời'}},
    'ao-so-mi-denim-cross': {'rename': {'Xanh': 'Xanh navy'}},
    'ao-so-mi-nam-cotton-form-slim-dai-tay': {'rename': {'Xanh': 'Xanh da trời'}},
    'ao-khoac-so-mi-da-long-cuu': {'rename': {'Vàng': 'Nâu vàng'}},
    'ao-so-mi-to-co-tron-tay-dai': {'rename': {'Đỏ': 'Đỏ đô'}},
    'ao-so-mi-to-dang-suong-co-tron': {'rename': {'Đỏ': 'Đỏ đô'}},
    'ao-polo-nam-pima-cotton-form-regular-fit-ngan': {'rename': {'Đỏ': 'Đỏ đô'}},
    'dam-cong-so-tho-chun-dang-chu-a-co-xe-v-tay-c': {'rename': {'Nâu': 'Be'}},
    'quan-regular-tuysi-daily': {'rename': {'Xanh': 'Xanh da trời'}},
    'chan-vay-dai-tuytsi-dang-suong-cap-cao-xe-ta-truoc': {'rename': {'Xanh': 'Xanh bạc hà'}},
    'quan-dai-tho-dui-dang-suong-ong-rong-cap-lien': {'rename': {'Đỏ': 'Đỏ đô'}},
    # áo sơ mi poplin: ảnh duy nhất xen kẽ sọc xanh / trắng
    'basic-poplin-shirt': {'split': lambda k: 'Xanh da trời' if k % 2 == 0 else 'Trắng'},
    # áo sơ mi dáng suông: 42 ảnh duy nhất theo chu kỳ 7 màu
    'ao-so-mi-dang-suong': {'split': lambda k: ['Tím hoa cà', 'Trắng', 'Xanh da trời', 'Tím hoa cà', 'Be', 'Xanh nước biển', 'Đen'][k % 7]},
}


def nfc(s):
    return unicodedata.normalize('NFC', s)


def slugify(s):
    s = unicodedata.normalize('NFD', s.replace('đ', 'd').replace('Đ', 'D'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:80].strip('-')


def money(v):
    return int(re.sub(r'\D', '', str(v))) if v else None


def cloudinary_resources():
    env = {}
    for line in open(ENV, encoding='utf8'):
        m = re.match(r'^(CLOUDINARY_\w+)="?([^"\n]*)"?', line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    auth = base64.b64encode(f"{env['CLOUDINARY_API_KEY']}:{env['CLOUDINARY_API_SECRET']}".encode()).decode()
    out, cursor = {}, None
    while True:
        q = {'prefix': 'Zara_Products/', 'max_results': 500, 'type': 'upload'}
        if cursor:
            q['next_cursor'] = cursor
        url = f"https://api.cloudinary.com/v1_1/{env['CLOUDINARY_CLOUD_NAME']}/resources/image/upload?" + urllib.parse.urlencode(q)
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Basic ' + auth}), timeout=60))
        for r in d['resources']:
            out[nfc(r['public_id'])] = r
        cursor = d.get('next_cursor')
        if not cursor:
            return out


def main():
    res = cloudinary_resources()
    rows = list(openpyxl.load_workbook(XLSX, read_only=True).worksheets[0].iter_rows(values_only=True))[1:]
    media, missing = OrderedDict(), []

    def media_id(url):
        m = re.match(r'^https://res\.cloudinary\.com/[^/]+/image/upload/(?:v\d+/)?(.+)\.(jpg|jpeg|png|webp)$', url.strip())
        if not m:
            missing.append(url)
            return None
        public_id = nfc(urllib.parse.unquote(m.group(1)))
        r = res.get(public_id)
        if not r:
            missing.append(url)
            return None
        ext = 'jpg' if r['format'] in ('jpg', 'jpeg') else r['format']
        mid = f"up-{hashlib.sha256(public_id.encode()).hexdigest()[:32]}.{ext}"
        media.setdefault(mid, {
            'id': mid, 'url': f"https://res.cloudinary.com/dhw56qppe/image/upload/v{r['version']}/{urllib.parse.quote(public_id)}.{r['format']}",
            'width': r['width'], 'height': r['height'], 'bytes': r['bytes'], 'contentType': 'image/jpeg' if ext == 'jpg' else f'image/{ext}',
        })
        return mid

    groups = OrderedDict()
    for r in rows:
        groups.setdefault(r[0].strip(), []).append(r)

    products, no_price = [], []
    for order, (name, rs) in enumerate(groups.items(), start=1):
        base_cat = re.sub(r'\s+(Nam|Nữ)$', '', rs[0][11].strip())
        cat, type_label, moments = CATEGORY[base_cat]
        gender = 'nam' if rs[0][12].strip() == 'Nam' else 'nu'
        colors = OrderedDict()  # màu -> {sizes, images}
        for r in rs:
            color = COLOR_FIX.get(r[6].strip(), r[6].strip())
            c = colors.setdefault(color, {'sizes': [], 'images': []})
            for s in re.split(r'\s*/\s*', str(r[7]).strip().upper()):
                if s not in c['sizes']:
                    c['sizes'].append(s)
            for u in str(r[13] or '').split():
                mid = media_id(u) if u.startswith('http') else None
                if mid and mid not in c['images']:
                    c['images'].append(mid)
        for c in colors.values():
            unknown = [s for s in c['sizes'] if s not in SIZE_ORDER]
            if unknown:
                raise SystemExit(f'Size lạ {unknown} ở {name}')
            c['sizes'].sort(key=SIZE_ORDER.index)
        slug = slugify(name)
        ov = COLOR_OVERRIDES.get(slug, {})
        if 'rename' in ov:
            merged = OrderedDict()
            for color, c in colors.items():
                m = merged.setdefault(ov['rename'].get(color, color), {'sizes': [], 'images': []})
                m['sizes'] += [x for x in c['sizes'] if x not in m['sizes']]
                m['images'] += [x for x in c['images'] if x not in m['images']]
            colors = merged
        if 'split' in ov:
            uniq = list(OrderedDict.fromkeys(m for c in colors.values() for m in c['images']))
            sizes = [x for c in colors.values() for x in c['sizes']]
            split = OrderedDict()
            for k, m in enumerate(uniq):
                split.setdefault(ov['split'](k), {'sizes': list(OrderedDict.fromkeys(sizes)), 'images': []})['images'].append(m)
            colors = split
        # Size: chỉ S / M / L / XL (2026-11-21). Size số / FREESIZE -> đủ S, M, L, XL.
        for c in colors.values():
            letters = [x for x in c['sizes'] if x in ('S', 'M', 'L', 'XL')]
            c['sizes'] = sorted(letters or ['S', 'M', 'L', 'XL'], key=SIZE_ORDER.index)
        price = next((money(r[3]) for r in rs if r[3]), None)
        compare = next((money(r[4]) for r in rs if r[4]), None)
        desc_raw = max((r[2] or r[1] or '' for r in rs), key=len)
        heights = sorted({int(h) for r in rs for h in re.findall(r'Model height:\s*(\d+)\s*cm', (r[2] or '') + (r[1] or ''))})
        description = re.sub(r'Model height:\s*\d+\s*cm\s*', '', desc_raw).strip()
        description = re.sub(r'\n{3,}', '\n\n', description)
        fit = [p.strip() for p in str(rs[0][9] or '').split(';') if p.strip()]
        gallery = list(OrderedDict.fromkeys(m for c in colors.values() for m in c['images']))
        image_meta = {}
        for color, c in colors.items():
            for m in c['images']:
                image_meta.setdefault(m, {'alt': f'{name} - {color}', 'color': color})
        variants, sort = [], 0
        for ci, (color, c) in enumerate(colors.items()):
            if color not in HEX:
                raise SystemExit(f'Chưa có mã màu cho "{color}"')
            for s in c['sizes']:
                variants.append({'sku': f'ZR-{order:03d}-{ci}-{s.upper()}', 'size': s, 'colorName': color, 'colorHex': HEX[color], 'sortOrder': sort})
                sort += 1
        p = {
            'slug': slug, 'name': name, 'typeLabel': f"{type_label} · {fit[0]}" if fit else type_label,
            'category': cat, 'moments': moments, 'genders': [gender],
            'price': price, 'compareAtPrice': compare if compare and price and compare > price else None,
            'description': description, 'material': str(rs[0][8] or '').strip(),
            'care': [x.strip() for x in str(rs[0][10] or '').split('|') if x.strip()],
            'fitSummary': ' · '.join(fit), 'fitModel': f"Người mẫu cao {' / '.join(map(str, heights))} cm" if heights else '',
            'coverMediaId': gallery[0] if gallery else 'catalog-placeholder', 'galleryMediaIds': gallery,
            'colorMedia': {color: c['images'][0] for color, c in colors.items() if c['images']},
            'imageMeta': image_meta, 'displayOrder': order, 'variants': variants,
        }
        if price is None:
            no_price.append(p)
        products.append(p)

    # Sản phẩm thiếu giá trong file (2026-11-21, Thắng: "tự thêm dữ liệu nếu thiếu"): giá = trung vị các sản phẩm có giá
    # cùng danh mục + giới tính (thiếu thì cùng danh mục), làm tròn kiểu ...99.000 như giá trong file. `priceFilled` ghi lại.
    for p in no_price:
        same = [q['price'] for q in products if q['category'] == p['category'] and q['genders'] == p['genders'] and q['price'] and q not in no_price]
        same = same or [q['price'] for q in products if q['category'] == p['category'] and q['price'] and q not in no_price]
        m = int(statistics.median(same))
        p['price'] = max(299_000, (m + 50_000) // 100_000 * 100_000 - 1_000)
        p['priceFilled'] = True

    if missing:
        raise SystemExit(f'{len(missing)} link ảnh không có trên Cloudinary, ví dụ: {missing[:3]}')
    slugs = [p['slug'] for p in products]
    assert len(slugs) == len(set(slugs)), 'slug trùng'
    OUT.write_text(json.dumps({'source': Path(XLSX).name, 'media': list(media.values()), 'products': products}, ensure_ascii=False, indent=1), encoding='utf8')
    print(f'{len(products)} sản phẩm ({len(no_price)} thiếu giá -> tự điền giá), {sum(len(p["variants"]) for p in products)} biến thể, {len(media)} ảnh -> {OUT}')


main()
