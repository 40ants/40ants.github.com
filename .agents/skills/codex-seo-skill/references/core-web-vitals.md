# Core Web Vitals

Use only current metrics:

| Metric | Good | Needs Work | Poor |
|---|---:|---:|---:|
| LCP | 2.5s or less | 2.5-4.0s | over 4.0s |
| INP | 200ms or less | 200-500ms | over 500ms |
| CLS | 0.1 or less | 0.1-0.25 | over 0.25 |

Important facts:

- `INP` replaced `FID` on March 12, 2024.
- `FID` was removed from Chrome tools on September 9, 2024.
- Do not use `FID` in advice.
- Real user data matters more than lab tests for ranking impact.

Plain-language definitions:

- `LCP`: how fast the main content appears
- `INP`: how fast the site reacts to user input
- `CLS`: how much the layout jumps

Common causes:

## LCP

- heavy hero images;
- slow server response;
- render-blocking CSS or JS;
- late web font loading.

## INP

- heavy JavaScript;
- long click handlers;
- too many third-party scripts;
- repeated layout recalculation.

## CLS

- images without dimensions;
- late-loaded banners or widgets;
- ads without reserved space;
- font swaps that move content.

Do not pretend you measured field performance if you only reviewed HTML or static source.
