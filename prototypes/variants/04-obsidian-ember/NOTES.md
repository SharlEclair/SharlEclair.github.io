# 04 Obsidian & Ember

- Concept: an architectural split screen. The left half is an obsidian HUD plate (always dark, in both themes) with ember-gold hairline drawings; the right half is classical editorial type (Cormorant Garamond, lining figures) with IBM Plex Mono for telemetry. Light mode is warm marble with deep-gold accents on the right and the obsidian plate on the left.
- Nav: a right-edge quick-jump rail with numbered section ticks (labels appear on hover or focus, the current tick is lit by scroll-spy), with email and the theme toggle underneath. A telemetry strip bottom-left shows the section, scroll percentage and a Melbourne clock. On phones the split stacks and the rail stays at the edge.
- Archive trigger: a top-level "Archive" link in the fixed header (also a button after the Projects section), linking to `projects.html`.
- Stage geometry: the fixed HUD half is the stage. F1 and Transit Desert (`lazyF1` / `lazyTransit`) fill it while the right half holds the pinned project copy for the whole runway. On phones the stage pins at 54svh with the copy pinned beneath it.
- Other HUD plates are inline SVG: arches and a lap trace (intro and contact), a 389.9 s to 34.2 s bar and a 68% ring (how I work), a dated timeline (experience), the repair loop with 9/10 and 10/10 pips (SQL agent), contours, lines and bars (Harvest Surprise). CSS motion only.
- HTML is generated from `shared/content.js`, so all copy is present without JS.
- Not verified: frame rate (headless, no GPU), screen readers. The LinkedIn link is the placeholder from content.js.
