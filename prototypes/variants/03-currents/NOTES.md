# 03 Currents

- Concept: a psychedelic streamline field (one 2D canvas, about 1,650 lines) that parts around a chrome sphere, spectrum stripes as dividers, and loud condensed display type (Bricolage Grotesque) with mono labels (DM Mono).
- Nav: a floating bottom dock with a sliding marker, number keys 1 to 5, an email button and the theme toggle. It slips away while a pinned runway copy card would sit under it. On phones the labels shorten and "Intro" is dropped (the brand link and key 1 still go to the top).
- Archive trigger: a "View all projects" pill button at the end of the Projects section, linking to `projects.html` (rows with spectrum edges, featured four plus the `archive` list).
- Field: `field.js` keeps the sphere/line state per section (`data-field` on each section, the deepest section at mid-viewport wins) and stops drawing when no transparent section is on screen. DPR 1, self-governing line density, still frames under reduced motion.
- F1 and Transit Desert: full-bleed pinned stages (`lazyF1` / `lazyTransit`); the copy sits on a solid dark card for the whole runway, so the scenes' light and the transit completion flash never touch the text, in either theme. On phones the stage is 56svh with the card under it.
- SQL agent: an animated loop diagram (lanes, error loopback, fix) plus 9/10 and 10/10 pips. Harvest Surprise: contour rings for three reservoirs, satellite vs gauge lines, spectrum rice bars (inline SVG, no WebGL).
- HTML is generated from `shared/content.js`, so all copy is present without JS.
- Not verified: frame rate (headless, no GPU), screen readers. The LinkedIn link is the placeholder from content.js.
