# 05 Daylight Gallery

- Concept: museum minimalism. White walls (a quiet "after hours" dark wall), each project hung as a framed plate with a wall label, Bodoni Moda for titles and Hanken Grotesk for text.
- Nav: a slim top bar (name, Projects, Experience, Contact, theme) plus a "Floor plan" button that opens an architectural plan overlay: each room is a link, the Main gallery lists the four works. Scroll-spy marks the current room. On phones the bar is initials plus icons and the plan becomes a stacked list.
- Archive trigger: "View the full collection" button at the end of the Projects section, linking to `projects.html` (a numbered checklist: the four on view, then the `archive` list).
- Hero: a 1-bit ordered-dither sphere on a fluted column in a niche (2D canvas, `relief.js`), lit from the pointer; retints with the theme and idles when off screen.
- F1 and Transit Desert: `lazyF1` / `lazyTransit` into a centred, framed plate with a small wall label to the right that stays pinned for the whole runway. Phones stack the frame above the label.
- SQL agent: a "study on paper" (ten ruled lines, one goes astray, is struck out and redrawn). Harvest Surprise: three vessels with a gauge line and a lagging dotted satellite line. Both inline SVG with CSS motion that pauses off screen.
- HTML is generated from `shared/content.js`, so all copy is present without JS.
- Not verified: frame rate (headless, no GPU), screen readers. The LinkedIn link is the placeholder from content.js.
