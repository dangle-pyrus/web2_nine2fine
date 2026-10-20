"""Validate selected raster assets and emit the typed content fixture + media manifest."""
import json
from pathlib import Path

directory = Path('reference/uniqlo')
media = json.loads((directory/'imported-media.json').read_text(encoding='utf-8'))
for asset in media.values():
    assert asset['width'] > 0 and asset['height'] > 0, 'Run measure-uniqlo.mjs first'
Path('src/media/uniqlo-reference.json').write_text(json.dumps(media, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
content = json.loads((directory/'landing-extracted.json').read_text(encoding='utf-8'))['content']
fixture = "import { ReferenceHomeContent } from '../app/features/home/reference-home-content';\n\n/** User-supplied UNIQLO snapshot. Content adaptation to nine2fine is pending. */\nexport const REFERENCE_HOME_CONTENT: ReferenceHomeContent = "
Path('src/mocks/uniqlo-home.ts').write_text(fixture+json.dumps(content, ensure_ascii=False, indent=2)+';\n',encoding='utf-8')
print(f'Validated {len(media)} raster images and generated the reference content fixture.')
