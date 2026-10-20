"""Download curated Pexels photos, export responsive WebP files and write provenance metadata.

Local tooling only (plan section 57). Reads PEXELS_API_KEY from the environment or the
git-ignored .env file and never prints it. Writes optimised files to public/assets/editorial/
and provenance to src/media/pexels-media.json (consumed by the media manifest).

Usage: python scripts/pexels/fetch_media.py
"""

import io
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from search_candidates import api_key, get_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'public' / 'assets' / 'editorial'
META = ROOT / 'src' / 'media' / 'pexels-media.json'

# slot id -> (Pexels photo id, alt text in Vietnamese, target aspect "w:h", focal point "x% y%")
SELECTION = {
    'home-hero': (3933697, 'Người phụ nữ mặc blazer trắng bước đi trên phố buổi sáng', '16:9', '50% 40%'),
    'home-hero-mobile': (3933697, 'Người phụ nữ mặc blazer trắng bước đi trên phố buổi sáng', '4:5', '47% 40%'),
    'story-0900': (39105080, 'Cô gái mặc blazer xám làm việc bên laptop lúc 9 giờ sáng', '4:5', '50% 35%'),
    'story-1730': (39105072, 'Cô gái trong bộ blazer xám chuẩn bị rời văn phòng cuối ngày', '4:5', '50% 30%'),
    'story-2000': (36128556, 'Người phụ nữ mặc blazer tối dùng bữa tối tại nhà hàng', '4:5', '50% 30%'),
    'moment-work': (33201347, 'Chàng trai mặc suit xanh cài hai hàng khuy', '4:5', '50% 25%'),
    'moment-dinner': (6699446, 'Hai người bạn trò chuyện trong bữa tối', '4:5', '45% 40%'),
    'moment-event': (8775434, 'Cô gái mặc đầm họa tiết dự tiệc tối', '4:5', '50% 40%'),
    'moment-weekend': (38131638, 'Cô gái mặc áo khoác da dạo phố cuối tuần', '4:5', '50% 30%'),
    'new-drop': (8661807, 'Người mẫu sải bước trong bộ suit tối màu trên nền studio sáng', '4:5', '50% 40%'),
    'campaign': (10378666, 'Hai người mẫu đứng dưới cây cầu sáng đèn về đêm', '16:9', '50% 50%'),
}
WIDTHS = {'16:9': (960, 1600, 2400), '4:5': (480, 800, 1200)}


def download(url: str) -> Image.Image:
    request = urllib.request.Request(url, headers={'User-Agent': 'nine2fine-local-tooling'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return Image.open(io.BytesIO(response.read())).convert('RGB')


def crop_to(image: Image.Image, ratio: str, focal: str) -> Image.Image:
    rw, rh = (int(part) for part in ratio.split(':'))
    fx, fy = (float(part.rstrip('%')) / 100 for part in focal.split())
    target = rw / rh
    w, h = image.size
    if w / h > target:
        new_w = int(h * target)
        left = min(max(int(fx * w - new_w / 2), 0), w - new_w)
        return image.crop((left, 0, left + new_w, h))
    new_h = int(w / target)
    top = min(max(int(fy * h - new_h / 2), 0), h - new_h)
    return image.crop((0, top, w, top + new_h))


def main() -> None:
    key = api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {}
    for slot, (photo_id, alt, ratio, focal) in SELECTION.items():
        photo = get_json(f'https://api.pexels.com/v1/photos/{photo_id}', key)
        source = download(f"{photo['src']['original']}?auto=compress&cs=tinysrgb&w=2600")
        framed = crop_to(source, ratio, focal)
        files = []
        for width in WIDTHS[ratio]:
            if width > framed.width:
                continue
            height = round(width * framed.height / framed.width)
            name = f'{slot}-{width}.webp'
            framed.resize((width, height), Image.LANCZOS).save(OUT_DIR / name, 'WEBP', quality=80, method=6)
            files.append({'src': f'/assets/editorial/{name}', 'width': width, 'height': height})
        metadata[slot] = {
            'alt': alt,
            'ratio': ratio,
            'focal': focal,
            'files': files,
            'pexelsId': photo_id,
            'pageUrl': photo['url'],
            'photographer': photo['photographer'],
            'photographerUrl': photo['photographer_url'],
            'retrieved': date.today().isoformat(),
        }
        print(f"{slot}: {len(files)} sizes, photo by {photo['photographer']}")
    META.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
