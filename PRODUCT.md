# Product

Inferred from the owner's brief, `about me/` (projects and experience files only), `mock-ups/` and
`moodboard/` on 2026-11-15, without an
interview (the brief asked for autonomous work). Treat every line as an assumption the owner can correct.

## Platform
web

## Stack
Vanilla ES modules, Three.js r186, Vite 8. No React. GSAP and Lenis are available in `prototypes/`.

## Users
Recruiters and hiring managers for data engineering / analytics engineering / data science roles in
Melbourne, skimming on a laptop between other tabs, usually with under two minutes. Second audience:
engineers who will scroll the whole page and judge the craft.

## Product Purpose
Ashwin Pillai's personal portfolio. It has to show four verified projects, work history and contact
routes, and prove by its own construction that he builds careful, measured systems.

## Positioning
"I build systems for making sense of complicated things." A data engineer who measures before claiming
and reports null results. The site is the evidence: two real-time WebGL pieces he built himself.

## Operating Context
One long scroll page plus a future `/projects` archive. Desktop first; must degrade cleanly on phones
and under `prefers-reduced-motion`.

## Capabilities and Constraints
- Two scroll-driven WebGL animations are fixed assets: F1 x Currents and Transit Desert (A* replay).
- Copy is governed by the claims ledger in `about me/projects.md` ("Do not use" table). No invented
  metrics, titles, employers, or links.
- Experience, Projects and Contact must be reachable in one action from anywhere on the page.

## Brand Commitments
No fixed palette or typeface is committed yet: the mockup variants exist to choose one. Direction comes
from `moodboard/`, `mock-ups/` and the Shopify Editions Winter '26 reference only
(`about me/aesthetic_preferences.md` and `about me/environment.md` are excluded at the owner's request).
Moodboard motifs: phosphor-green CRT "Creation of Adam" hands, Currents streamlines with a chrome
sphere, torn newsprint and paper collage, halftone and 1-bit dither, classical statuary at a laptop, a
translucent handheld console, prismatic glass, the offline-dino pixel world.

The page must be lightweight, responsive, mobile-friendly and offer light and dark modes.

## Evidence on Hand
Four project write-ups with verified numbers, two work roles, two degrees, repos under
`github.com/SharlEclair`. No headshot, no testimonials, no logos.

## Product Principles
1. Art that is immediately usable: nothing a recruiter needs is behind an animation.
2. Every number on the page is one the ledger verifies.
3. The animation is the proof, not the wallpaper.

## Accessibility & Inclusion
WCAG 2.1 AA contrast, full keyboard navigation with visible focus, reduced-motion fallbacks that keep
all content, no scroll-jacking that traps the reader.
