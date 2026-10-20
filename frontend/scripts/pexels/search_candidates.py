"""Search Pexels candidates per homepage slot and build contact sheets for manual curation.

Local tooling only (plan section 57). Reads PEXELS_API_KEY from the environment or the
project's git-ignored .env file and never prints it. Output goes to the directory passed as
the first argument (keep it outside the published app).

Usage: python scripts/pexels/search_candidates.py <output-dir>
"""

import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]

SLOTS = {
    'hero': ('young professional woman office outfit walking city', 'landscape'),
    'story-work': ('woman blazer office desk fashion', 'portrait'),
    'story-off': ('woman blazer leaving office evening street', 'portrait'),
    'story-dinner': ('woman elegant outfit dinner restaurant evening', 'portrait'),
    'moment-work': ('man suit office fashion portrait', 'portrait'),
    'moment-dinner': ('couple dinner evening fashion', 'portrait'),
    'moment-event': ('woman dress event party fashion', 'portrait'),
    'moment-weekend': ('casual weekend outfit young people city', 'portrait'),
    'new-drop': ('fashion editorial woman tailored suit studio', 'portrait'),
    'campaign': ('fashion editorial city night young people', 'landscape'),
}


def api_key() -> str:
    key = os.environ.get('PEXELS_API_KEY', '').strip()
    env_file = ROOT / '.env'
    if not key and env_file.exists():
        for line in env_file.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('PEXELS_API_KEY='):
                key = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit('PEXELS_API_KEY is not set (.env or environment).')
    return key


def get_json(url: str, key: str) -> dict:
    request = urllib.request.Request(url, headers={'Authorization': key, 'User-Agent': 'nine2fine-local-tooling'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def fetch_image(url: str) -> Image.Image:
    request = urllib.request.Request(url, headers={'User-Agent': 'nine2fine-local-tooling'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return Image.open(io.BytesIO(response.read())).convert('RGB')


def contact_sheet(photos: list[dict], path: Path) -> None:
    thumb_w, thumb_h, cols = 220, 275, 6
    rows = (len(photos) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * thumb_w, rows * (thumb_h + 22)), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, photo in enumerate(photos):
        image = fetch_image(photo['src']['medium'])
        image.thumbnail((thumb_w, thumb_h))
        x, y = (index % cols) * thumb_w, (index // cols) * (thumb_h + 22)
        sheet.paste(image, (x + (thumb_w - image.width) // 2, y))
        draw.text((x + 4, y + thumb_h + 4), f"{index}: {photo['id']}", fill='black')
    sheet.save(path, quality=80)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.pexels-candidates'
    out.mkdir(parents=True, exist_ok=True)
    key = api_key()
    slots = sys.argv[2:] or list(SLOTS)
    for slot in slots:
        query, orientation = SLOTS[slot]
        params = urllib.parse.urlencode({'query': query, 'orientation': orientation, 'per_page': 18})
        data = get_json(f'https://api.pexels.com/v1/search?{params}', key)
        photos = data.get('photos', [])
        (out / f'{slot}.json').write_text(json.dumps(photos, ensure_ascii=False, indent=1), encoding='utf-8')
        contact_sheet(photos, out / f'{slot}.jpg')
        print(f'{slot}: {len(photos)} candidates')


if __name__ == '__main__':
    main()
