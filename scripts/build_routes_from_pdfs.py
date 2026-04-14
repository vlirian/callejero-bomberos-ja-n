#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import unicodedata
from pathlib import Path

BASE = Path('/Users/victor/Desktop/CALLEJERO 2.0')
PDF_DIR = BASE / 'calles'
OUT_JSON = BASE / 'data' / 'routes.json'

TRUCK_CODES = {'BUL', 'BUP', 'AEA', 'AF', 'AEA-BUP', 'BUP-AEA', 'BUL-BUP', 'BUP-BUL', 'BUL-AEA', 'AEA-BUL'}

# Correcciones manuales para PDFs donde el OCR mete texto lateral
# y altera el orden real del itinerario.
MANUAL_OVERRIDES = {
    'Jorge Morales 435.pdf': {
        'itinerary': [
            'Pza. de La Constitución',
            'Bernabé Soriano',
            'Ramón y Cajal',
            'Manuel Jontoya',
        ]
    }
}


def clean_street(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r'\s*\d+[\w().-]*\s*$', '', stem).strip()
    stem = re.sub(r'\s{2,}', ' ', stem)
    return stem


def pdf_text(pdf_path: Path) -> str:
    result = subprocess.run(['pdftotext', str(pdf_path), '-'], capture_output=True, text=True)
    return result.stdout or ''


def is_meaningful_line(line: str) -> bool:
    if len(line) < 4 or len(line) > 90:
        return False
    if re.fullmatch(r'[\d\W_]+', line):
        return False
    letters = sum(ch.isalpha() for ch in line)
    if letters < 4:
        return False
    ratio = letters / max(1, len(line))
    if ratio < 0.45:
        return False
    return True


def normalize_cmp(value: str) -> str:
    norm = unicodedata.normalize('NFKD', value)
    return ''.join(c for c in norm if not unicodedata.combining(c)).lower().strip()


def parse_pdf(pdf_path: Path) -> dict:
    raw = pdf_text(pdf_path)
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    fallback_street = clean_street(pdf_path.name)

    first_line = ''
    for ln in lines[:20]:
        if is_meaningful_line(ln):
            first_line = ln
            break

    # La calle principal debe venir del nombre del PDF (título oficial del callejero),
    # no de líneas del itinerario que pueden salir antes en el OCR.
    street = fallback_street
    if first_line:
        first_cmp = normalize_cmp(first_line)
        fallback_cmp = normalize_cmp(fallback_street)
        # Solo usamos first_line como destino completo si claramente hace referencia
        # a la misma calle principal.
        if fallback_cmp and (fallback_cmp in first_cmp or first_cmp in fallback_cmp):
            full_destination = first_line
        else:
            full_destination = fallback_street
    else:
        full_destination = fallback_street

    truck = ''
    truck_tokens = []
    for ln in lines[:80]:
        upper = ln.upper()
        if re.search(r'\bBUL\b', upper):
            truck_tokens.append('BUL')
        if re.search(r'\bBUP\b', upper):
            truck_tokens.append('BUP')
    # Mantener orden y únicos
    truck_tokens = list(dict.fromkeys(truck_tokens))
    if truck_tokens:
        truck = "/".join(truck_tokens)
    else:
        for ln in lines[:30]:
            compact = ln.upper().replace(' ', '')
            if compact in TRUCK_CODES:
                truck = compact
                break

    notes = ''
    for ln in lines[:60]:
        if len(ln) >= 35 and (',' in ln or ';' in ln):
            notes = ln
            break

    itinerary = []
    seen = set()
    street_cmp = normalize_cmp(street)
    full_cmp = normalize_cmp(full_destination)

    final_idx = None
    for i, ln in enumerate(lines):
        if re.fullmatch(r'final\.?', ln.strip(), flags=re.IGNORECASE):
            final_idx = i
            break

    # El itinerario operativo suele estar en el bloque vertical antes de "Final".
    itinerary_source = lines[1:final_idx] if final_idx is not None else lines[1:120]

    for ln in itinerary_source:
        candidate = re.sub(r'\s{2,}', ' ', ln).strip(' .,-;:')
        candidate = re.sub(r'^(BUL|BUP)\s+', '', candidate, flags=re.IGNORECASE).strip()
        if not is_meaningful_line(candidate):
            continue

        up_compact = candidate.upper().replace(' ', '')
        cmp = normalize_cmp(candidate)

        if up_compact in TRUCK_CODES:
            continue
        if re.search(r'\bfinal\b', cmp, flags=0):
            continue
        if cmp == street_cmp or cmp == full_cmp:
            continue
        if 'se puede intentar' in cmp:
            continue
        if cmp in seen:
            continue

        seen.add(cmp)
        itinerary.append(candidate)
        if len(itinerary) >= 7:
            break

    if not itinerary:
        itinerary = ['Sin itinerario extraído automáticamente']

    entry = {
        'street': street,
        'fullDestination': full_destination,
        'truck': truck or 'No indicado',
        'itinerary': itinerary,
        'notes': notes or 'Sin nota operativa detectada automáticamente.',
        'sourcePdf': pdf_path.name,
        'mapPdf': f'./calles/{pdf_path.name}',
    }

    if pdf_path.name in MANUAL_OVERRIDES:
        entry.update(MANUAL_OVERRIDES[pdf_path.name])

    return entry


def main() -> None:
    pdfs = sorted(PDF_DIR.glob('*.pdf'))
    entries = []
    for pdf in pdfs:
        try:
            entries.append(parse_pdf(pdf))
        except Exception as exc:
            entries.append(
                {
                    'street': clean_street(pdf.name),
                    'fullDestination': clean_street(pdf.name),
                    'truck': 'No indicado',
                    'itinerary': ['No se pudo extraer automáticamente'],
                    'notes': f'Error en extracción automática: {exc}',
                    'sourcePdf': pdf.name,
                    'mapPdf': f'./calles/{pdf.name}',
                }
            )

    entries.sort(key=lambda x: normalize_cmp(x['street']))
    OUT_JSON.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Procesados {len(entries)} PDF(s).')
    print(f'Salida: {OUT_JSON}')


if __name__ == '__main__':
    main()
