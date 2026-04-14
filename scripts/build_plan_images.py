#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import unicodedata
from pathlib import Path

BASE = Path('/Users/victor/Desktop/CALLEJERO 2.0')
ROUTES = BASE / 'data' / 'routes.json'
IMAGES_DIR = BASE / 'images' / 'plans'
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    norm = unicodedata.normalize('NFKD', value)
    ascii_value = ''.join(c for c in norm if not unicodedata.combining(c))
    ascii_value = ascii_value.lower()
    ascii_value = re.sub(r'[^a-z0-9]+', '-', ascii_value)
    ascii_value = re.sub(r'-+', '-', ascii_value).strip('-')
    return ascii_value or 'calle'


def build_image(pdf_path: Path, out_jpg: Path) -> None:
    # JPEG y resolución moderada para que cargue rápido en web.
    subprocess.run(
        [
            'pdftoppm',
            '-jpeg',
            '-jpegopt',
            'quality=82',
            '-r',
            '125',
            '-f',
            '1',
            '-singlefile',
            str(pdf_path),
            str(out_jpg.with_suffix('')),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def main() -> None:
    data = json.loads(ROUTES.read_text(encoding='utf-8'))
    total = len(data)
    done = 0

    for row in data:
        map_pdf = row.get('mapPdf', '')
        if not map_pdf:
            continue
        pdf_path = BASE / map_pdf.replace('./', '')
        if not pdf_path.exists():
            continue

        slug = slugify(Path(row.get('street') or row.get('sourcePdf', 'plano')).stem)
        img_path = IMAGES_DIR / f'{slug}.jpg'

        if not img_path.exists():
            try:
                build_image(pdf_path, img_path)
            except subprocess.CalledProcessError:
                # Algunos PDF dañados o con codificación rara pueden fallar.
                # En ese caso mantenemos mapPdf como fallback.
                continue

        if img_path.exists():
            row['mapImage'] = f'./images/plans/{img_path.name}'
            done += 1
        if done % 50 == 0:
            print(f'{done}/{total}')

    ROUTES.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Planos imagen generados para {done}/{total}.')


if __name__ == '__main__':
    main()
