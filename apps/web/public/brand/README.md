# Approved brand asset

`niazet-approved.png` is the owner's supplied `نهایی 1.png`, copied without pixel changes (1536 × 1024; 1,088,884 bytes).

SHA-256: `26365ddd831ddee75f7c5501729f4fb00055a39d3e9045e3d982b8f2f701ea92`.

`BrandMark` displays the Persian or English row with a CSS viewport. The owner explicitly rejected a white plate and requested theme-adapted lettering, but a constant-color emblem in both themes. The frame paints neither background nor border. A scoped SVG filter keys out the near-white paper at render time. Only the wordmark's dark/cool ink lifts to the foreground token in dark mode. A separate clipped layer preserves the emblem's original navy/turquoise/gold in both themes. Theme selection follows the existing root attribute, including server-rendered/no-JavaScript views; per-instance filter/clip IDs use React `useId`.

At the owner's request, the Persian gold dot moves from zeh to noon. The existing noon ink dot moves to zeh, so neither letter loses its dot. CSS clipping and translations reuse the original dot pixels; the English dot is unchanged. All layers share the same optimized image URL, so no extra image variant is downloaded. The source file, contours, typography, row positions and layout dimensions are unchanged. No generated/reconstructed logo or new dependency is used. The shared original is the only source asset, not a project backup.

Consumers: public header, workspace sidebar/mobile header/drawer, and home footer. Accessible names come from image alt text; the existing tagline is retained where space permits. A future transparent/vector source must not silently redesign the supplied mark. Browser acceptance checks active filters, transparent frame, image loading, no-JavaScript rendering, duplicate IDs, and both themes; screenshots also verify the rendered ink and cutout visually.
