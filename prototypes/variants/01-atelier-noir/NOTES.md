# 01 Atelier Noir

- Concept: the owner's mockups finished. Basalt black page, cream torn-paper strata for "How I work" and "Experience", Instrument Serif for voice and Recursive Mono for labels, phosphor-green CRT plates.
- Nav: collapsible left index (full labels, or a numeral rail; choice remembered). On phones it becomes an "Index" pill that opens a sheet. Scroll-spy via `initScrollSpy`. Email is in the index footer and the contact section.
- Archive trigger: "View all projects" button under the four projects, linking to `projects.html` (featured four plus the `archive` list).
- Hero: two hands drawn as phosphor scan bars (inline SVG with a stripe mask) close the gap as the pinned hero scrolls; one CSS variable on one small element, rAF-throttled.
- F1 and Transit Desert: `lazyF1` / `lazyTransit` into a CRT plate beside the pinned copy (copy pinned for the whole runway; plates alternate sides). Dark plates read as deliberate screens in light mode.
- SQL agent: CSS repair loop plus 9/10 to 10/10 score cells. Harvest Surprise: inline SVG of three satellite tiles, a tracking line pair and rice bars.
- Contact: a handheld console. D-pad moves between real links, A opens, B copies the email, START scrolls up.
- HTML is generated from `shared/content.js` at build time, so all copy is present without JS.
- Fonts: Instrument Serif, Recursive (Google Fonts, display=swap).
- Not verified: frame rate (headless, no GPU), screen readers. The LinkedIn link is the placeholder from content.js.
