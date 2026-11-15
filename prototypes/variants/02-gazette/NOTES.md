# 02 The Gazette

- Concept: a daylight broadsheet. Bodoni Moda nameplate, newsprint paper, column rules, a halftone clipping, torn rims. Dark theme is the "night edition" (carbon paper, cream ink), designed rather than inverted.
- Nav: a printed masthead (nameplate, dateline, nav row) that is replaced by a compact fixed bar once it scrolls away. Below 1360px the bar collapses to Menu; on phones it moves to the bottom edge, clear of the thumb and the top-centre switcher.
- Archive trigger: a top-level black "Projects" button in the masthead nav and the bar (plus "All projects, page E1" at the end of the section). The bar also has "Featured" for the four on this page, with scroll-spy.
- F1 and Transit Desert: `lazyF1` / `lazyTransit` into a wide dark plate punched through the page with a torn paper rim, pinned across the columns; headline and summary stay pinned beneath it for the whole runway.
- SQL agent: a ledger card with the failed run struck through, 9/10 then 10/10 tally cells, and a HEALED stamp. Harvest Surprise: halftone reservoir dots, satellite vs gauge lines, rice bars (inline SVG).
- Halftone hero: two stacked gradients thresholded with `filter: contrast()`; no image.
- HTML is generated from `shared/content.js`, so all copy is present without JS.
- Fonts: Bodoni Moda, Archivo (Google Fonts, display=swap).
- Not verified: frame rate (headless, no GPU), screen readers. The LinkedIn link is the placeholder from content.js.
