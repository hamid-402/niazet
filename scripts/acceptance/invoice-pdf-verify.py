"""Read-only visual/content QA of generated invoice fixtures; never connects to DB."""
from pathlib import Path
import json
import re
import pdfplumber
from pypdf import PdfReader
from pypdf.generic import ContentStream

root = Path(__file__).resolve().parents[2] / '.artifacts/acceptance/invoice-review'
results = []
for path in sorted(root.glob('*.pdf')):
    reader = PdfReader(path)
    assert len(reader.pages) == 1, (path.name, 'single A4 page')
    page = reader.pages[0]
    assert abs(float(page.mediabox.width) - 595.28) < 1
    assert abs(float(page.mediabox.height) - 841.89) < 1
    text = page.extract_text()
    assert 'نیازت با ما' in text and 'فاکتور خدمات' in text
    assert '250,000' in text and 'تومان' in text
    assert not re.search(r'\(cid:0\)|\ufffd', text), (path.name, 'missing glyph')
    subject = reader.metadata['/Subject'].get_object()
    assert '250,000 IRT' in subject
    assert reader.trailer['/Root'].get_object()['/Lang'] == 'fa-IR'
    fonts = page['/Resources']['/Font'].get_object()
    assert len(fonts) == 2
    for font in fonts.values():
        font = font.get_object()
        assert font['/Subtype'] == '/Type0' and '/ToUnicode' in font
        descendant = font['/DescendantFonts'][0].get_object()
        assert '/FontFile2' in descendant['/FontDescriptor'].get_object()
    actual = [operands[1]['/ActualText'] for operands, operator in ContentStream(page['/Contents'].get_object(), reader).operations if operator == b'BDC' and '/ActualText' in operands[1]]
    assert 'نیازت با ما' in actual and 'فاکتور خدمات' in actual
    if path.name == 'persian-probe.pdf':
        assert 'نیازت-آزمایش-۱۲۳' in actual, 'Logical Unicode must not be reversed to fix appearance.'
    if path.name == 'current-standard.pdf':
        assert 'INV-00000000-0000-4000-8000-000000000123' in text
        assert 'NIA-20261021-001' in text
        assert '1405/07/29' in text and '09:30' in text
    with pdfplumber.open(path) as pdf:
        for char in pdf.pages[0].chars:
            assert 40 <= char['x0'] <= char['x1'] <= 556, (path.name, 'horizontal bounds', char)
            assert 20 <= char['top'] <= char['bottom'] <= 820, (path.name, 'vertical bounds', char)
    results.append({'file': path.name, 'pages': 1, 'embeddedFonts': 2, 'actualTextSpans': len(actual), 'glyphBounds': 'passed', 'size': path.stat().st_size})
assert len(results) >= 5, 'Review must include standard/Persian fixtures and three authorized HTTP downloads.'
(root / 'pdf-report.json').write_text(json.dumps({'status': 'passed', 'files': results}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': 'passed', 'files': results}, ensure_ascii=False, indent=2))
