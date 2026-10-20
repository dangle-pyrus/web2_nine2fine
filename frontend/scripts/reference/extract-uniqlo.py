"""Extract only visible landing content and media references from the user-saved HTML."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from bs4 import BeautifulSoup

directory = Path('reference/uniqlo')
source = next(directory.glob('*.html'))
soup = BeautifulSoup(source.read_text(encoding='utf-8'), 'html.parser')
assets = {}

def remote(value):
    return 'https:' + value if value.startswith('//') else value

def image_asset(key, image=None, url='', alt=''):
    local = ''
    if image:
        src = image.get('src', '')
        if src.startswith('./'):
            local = (directory / unquote(src)).as_posix()
        url = url or image.get('data-src') or image.get('largeimageurl') or (src if src.startswith('http') else '')
        alt = alt or image.get('alt', '')
    assets[key] = {'local': local, 'url': remote(url), 'alt': alt}
    return key

content = {'source': 'https://www.uniqlo.com/uk/en/', 'capturedDate': '2026-10-04', 'categories': [], 'blocks': []}
for i, link in enumerate(soup.select('#homeCategoryList a')):
    image = link.find('img')
    if image:
        content['categories'].append({'label': link.get_text(' ', strip=True), 'href': link['href'], 'mediaId': image_asset(f'uniqlo-category-{i+1:02}', image)})

parent = soup.select_one('.media-banner').parent.parent.parent
banner_index = 0
rail_index = 0
for child in parent.find_all(recursive=False):
    banner = child.select_one('.media-banner')
    grid = child.select_one('.fr-ec-product-collection')
    if banner:
        key = f'uniqlo-campaign-{banner_index+1:02}'
        wrapper = banner.select_one('.media-banner__text-wrapper')
        title = wrapper.select_one('.media-banner__title')
        texts = [p.get_text('\n', strip=True) for p in wrapper.find_all('p', recursive=False)]
        video = banner.find('video')
        picture = banner.select_one('.media-banner__children img')
        if video:
            image_asset(key, url=video.get('poster') or video.get('data-poster', ''), alt=video.get('alttext', ''))
            assets[key]['videoUrl'] = video.get('data-src') or video.get('src')
            mobile_id = key
        else:
            image_asset(key, picture)
            mobile_url = picture.get('smallmediumimageurl', '')
            mobile_id = image_asset(key+'-mobile', url=mobile_url, alt=picture.get('alt', '')) if mobile_url else key
        logos = [image_asset(key+f'-logo-{i+1}', img) for i,img in enumerate(wrapper.select('img'))]
        title_text = title.get_text(' ', strip=True)
        description = next((t for t in texts if t != title_text and not t.startswith('*')), '')
        footnote = next((t for t in texts if t.startswith('*')), '')
        prices = [x.get_text(' ', strip=True) for x in wrapper.select('[data-testid="ITOTypography"]') if re.fullmatch(r'£[\d.]+', x.get_text(strip=True))]
        fine_print = next((x.get_text(' ', strip=True) for x in wrapper.select('[data-testid="ITOTypography"]') if x.get_text(strip=True).startswith('Member offers available')), '')
        content['blocks'].append({'kind': 'campaign', 'id': key, 'title': title_text, 'description': description, 'footnote': footnote or fine_print, 'price': prices[0] if prices else '', 'previousPrice': prices[1] if len(prices)>1 else '', 'href': banner.find_parent('a')['href'], 'mediaId': key, 'mobileMediaId': mobile_id, 'logoMediaIds': logos})
        if banner_index == 0:
            content['blocks'].append({'kind': 'categories', 'id': 'categories'})
        banner_index += 1
    elif grid:
        rail_index += 1
        products = []
        for i,tile in enumerate(grid.select('.product-tile')):
            area = tile.select_one('.product-tile__content-area')
            parts = list(area.stripped_strings)
            href = tile.find_parent('a')['href']
            selected = parse_qs(urlparse(href).query).get('colorDisplayCode', [''])[0]
            product_key = f'uniqlo-product-{rail_index}-{i+1}'
            images = tile.select('.product-tile__carousel-wrapper img')
            chip_images = {img.get('alt'): img for img in tile.select('.product-tile__image-chip-group img')}
            variants = []
            seen = set()
            for image in images:
                name = image.get('src') or image.get('data-src', '')
                color_match = re.search(r'goods_(\d{2})_', name)
                color = color_match.group(1) if color_match else '00'
                if color in seen: continue
                seen.add(color)
                media_id = image_asset(product_key+'-'+color, image)
                chip = chip_images.get(color)
                variants.append({'color': color, 'mediaId': media_id, 'chipMediaId': image_asset(product_key+'-chip-'+color, chip) if chip else ''})
            variants.sort(key=lambda v: v['color'] != selected)
            products.append({'id': product_key, 'name': parts[0], 'price': parts[1], 'notes': parts[2:], 'href': href, 'variants': variants})
        content['blocks'].append({'kind': 'products', 'id': f'product-rail-{rail_index}', 'label': ['Member offers', 'Cashmere selection', 'Sweats selection'][rail_index-1], 'products': products})

(directory/'landing-extracted.json').write_text(json.dumps({'content':content,'assets':assets},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Extracted {banner_index} campaigns, {len(content["categories"])} categories, {rail_index} product rails and {len(assets)} image references.')
