# Variant builder brief

You are building ONE interactive design mockup of Ashwin Pillai's portfolio, as one folder under
`prototypes/variants/<your-id>/`. Other builders are working in sibling folders at the same time.

## Hard boundaries

- Write ONLY inside `prototypes/variants/<your-id>/`. Never edit `prototypes/shared/`, `prototypes/public/`,
  `package.json`, `vite.config.js`, another variant, or anything outside `prototypes/`. If shared code needs
  a change, work around it and say so in your final report.
- Do not run `npm install`, do not add dependencies, do not start or stop a dev server (one is already
  running at `http://127.0.0.1:5310`), do not run git commands.
- Do not read `about me/aesthetic_preferences.md` or `about me/environment.md`. Do not modify
  `f1-three-test/`, `transit-animation/`, `mock-ups/`, `moodboard/`, `transit-animation-reference/`.
- No frameworks. Vanilla HTML, CSS and ES modules. `gsap` and `lenis` are installed but each costs
  bytes: use neither unless the design truly needs it, and prefer CSS (scroll-driven animations with a
  fallback, transitions, `IntersectionObserver`).
- No em dashes in copy. No invented facts: all copy comes from `shared/content.js`.

## Files you produce

```
variants/<your-id>/index.html      the one-page portfolio
variants/<your-id>/projects.html   the /projects archive page (featured four + `archive` list)
variants/<your-id>/style.css
variants/<your-id>/main.js
variants/<your-id>/NOTES.md        10-25 lines: concept, nav pattern, archive trigger, how each animation is
                                   integrated, fonts, what you could not verify
```

Extra modules/assets inside your folder are fine. Every page ends its `<body>` with
`<script type="module" src="/shared/ui/switcher.js"></script>` (prototype-only chrome: a small pill, top
centre, that steps between variants; keep your own UI clear of the top-centre 220px x 44px).
Use root-absolute URLs (`/shared/...`, `/variants/<your-id>/...`, `/posters/...`). Preview: `http://127.0.0.1:5310/variants/<your-id>/`.

## Read first (in this order)

1. `PRODUCT.md` (project root) - who this is for.
2. `prototypes/shared/content.js` - ALL copy. Import it; do not retype it into HTML by hand unless you
   also keep it identical. Rendering content from this module in `main.js` is fine and expected, but
   the page must not be blank without JS: put the name, tagline, nav and section headings in the HTML.
3. `prototypes/shared/lazy.js`, `shared/ui/base.css`, `shared/ui/theme.js`, `shared/ui/nav.js` - use them.
4. Your assigned moodboard images and `mock-ups/*.png` (view them with the Read tool).
5. Project skills: invoke `impeccable` (then read its `reference/craft-floor.md` and
   `reference/new-work.md` before writing UI), `choreograph`, and `animation-performance`. Apply them;
   skip their "initial response" greetings. `r3f-shaders` / `r3f-postprocessing` only if you write GLSL.

## What the page must contain

Sections with exactly these ids, in this order: `top` (name + tagline + hero visual), `approach`
(How I work), `projects` (the four featured projects), `experience` (work + education, skills optional),
`contact` (email, LinkedIn, GitHub).

### The two WebGL animations (already built - do not rebuild them)

```js
import { lazyF1, lazyTransit } from '/shared/lazy.js'
lazyF1(stageEl, { runway: runwayEl, posterAlt: '...' })       // F1 Pitwall project
lazyTransit(stageEl, { runway: runwayEl, posterAlt: '...' })  // Transit Desert project
```

- `runwayEl` is a tall element (about 300-420vh); scrolling through it scrubs the animation 0 to 1.
  `stageEl` is a `position: sticky; height: 100svh` box inside it that the canvas fills. `shared/ui/base.css`
  ships `.runway` / `.stage` for exactly this. The stage may be full-bleed or a panel (half width, a
  framed plate, a window): the canvas tracks the stage's size.
- The loader shows a static poster at once, imports three.js only when the section is near, and keeps
  the poster under `prefers-reduced-motion`, data-saver or on low-power devices. Never import
  `/shared/f1/*` or `/shared/transit/*` directly, and never import `three` yourself: your page's own
  JS and CSS must stay small (target: under 60 KB of your own code, zero JS required for content).
- Both scenes are DARK (near-black plum with ember gold and violet; aubergine with a red band). In
  light mode they must still look deliberate: frame them as a plate, a window, a torn opening, a
  screen. Do not put light text directly over them without checking contrast.
- Project copy (title + summary) stays pinned and readable beside or over the stage for the whole
  runway, as in `mock-ups/Start.png` ("project name and description do not move when scrolling, till
  the animation is over"). On mobile, stack: a shorter stage (about 60svh) under or over the copy.
- Transit needs its caption: use `project.animationCaption` from content.js near the stage.
- The two projects without an animation (SQL agent, Harvest Surprise) get a lightweight visual of your
  own in your variant's language (CSS, SVG, or a small 2D canvas): no WebGL, no images from the web.

### Recruiter usability (non-negotiable)

- From anywhere on the page, Projects, Experience and Contact are one click/tap or one key away, and
  the current section is indicated (`initScrollSpy`).
- Email is a real `mailto:` link, visible without interaction in `contact`, and the nav exposes it too.
- A skip link, logical heading order, visible focus states, keyboard-operable everything, 44px touch
  targets, WCAG AA contrast in BOTH themes.
- Nothing a recruiter needs is hidden behind an animation or requires scrolling a runway: every
  runway can be skipped via the nav.

### Light / dark

- `<html>` gets `data-theme="light|dark"` from the inline boot script documented in
  `shared/ui/theme.js` (copy it into `<head>` before your stylesheet). Define all colours as custom
  properties under `html[data-theme="light"]` and `html[data-theme="dark"]`. Provide a visible toggle
  wired with `initThemeToggle`. Both themes must be designed, not inverted.

### Responsive

- Must work at 1440x900, 1024x768 and 390x844 with no horizontal scroll. Navigation gets a real
  mobile form (not a shrunken desktop one).

### Projects architecture

- `projects.html` is a real second page: same header/nav/theme, the four featured projects plus the
  `archive` list from content.js, structured so more entries can be appended (a list/table/grid driven
  by the data arrays). Your assigned "archive trigger" says how the home page links to it.

## Motion

Apply `choreograph`: one authored entrance for the hero, no uniform staggers, nothing staggered in
menus, motion never blocks interaction, everything collapses under `prefers-reduced-motion`. Apply
`animation-performance`: animate `transform` / `opacity` (plus `clip-path` / `filter` where smooth), never
layout properties, never `transition: all`, no scroll listeners that write layout, no per-frame writes
of inherited CSS variables on large containers.

## Fonts

Choose faces that fit your direction and load at most 2 families / 4 files from Google Fonts with
`display=swap` and `preconnect` (the production build will self-host). No Inter, Roboto, Arial or
system-ui as the display voice.

## Verify before you finish (required)

From `prototypes/`:

```bash
node tools/shot.mjs http://127.0.0.1:5310/variants/<your-id>/ variants/<your-id>/.shots/d.png --sheet=0,0.12,0.3,0.5,0.7,0.88,1
node tools/shot.mjs http://127.0.0.1:5310/variants/<your-id>/ variants/<your-id>/.shots/m.png --mobile --sheet=0,0.3,0.6,1
node tools/shot.mjs http://127.0.0.1:5310/variants/<your-id>/ variants/<your-id>/.shots/light.png --eval="document.documentElement.dataset.theme='light'" --sheet=0,0.5,1
node tools/shot.mjs http://127.0.0.1:5310/variants/<your-id>/projects.html variants/<your-id>/.shots/p.png
```

The tool prints `problems` (console errors, failed requests) and `horizontalOverflow`: both must be
clean. Look at the screenshots with the Read tool and fix what you see (overlap, clipped text,
contrast, empty states), then look again. Headless has no GPU: judge layout and correctness there,
not frame rate. Use `--eval` with `document.documentElement.dataset.theme='light'|'dark'` to force a
theme. Do not use the Playwright or Claude Browser tools (they are shared; the lead does final QA).
Keep `.shots/` (it is git-ignored).

## Final report (your last message)

Under 200 words: concept in one sentence, nav pattern, archive trigger, how each animation is
integrated, fonts, own-code size (bytes of your html+css+js), anything unverified or any shared-code
change you need.
