# Invoice font assets

Unmodified Vazirmatn v33.003, Regular and Bold, by the Vazirmatn Project Authors.
Source: https://github.com/rastikerdar/vazirmatn/tree/v33.003/fonts/ttf
License: SIL Open Font License 1.1; the complete upstream notice is in OFL.txt.

These files are bundled by Nest's `finance/assets/**` asset rule and copied into
the production image with `dist`. PDF rendering embeds a subset locally; it
does not fetch fonts, use system-installed fonts, or run a browser. Keep the
license together with the fonts. Do not rename or modify the font software.

Approved invoice rendering dependencies: PDFKit 0.20.2 (MIT), bidi-js 1.0.3
(MIT), and development-only @types/pdfkit 0.17.6 (MIT). No license policy was
broadened. The Bidi library orders runs; OpenType font shaping remains local.
