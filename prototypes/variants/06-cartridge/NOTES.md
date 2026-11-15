# 06 Cartridge

- Concept: the site as a translucent handheld. Frosted polycarbonate shells with the PCB showing through, a 4-shade dot-matrix LCD (olive in light, night-green in dark), Pixelify Sans for headings with Atkinson Hyperlegible Next for reading and all figures (Pixelify's "2" reads as an "8", so numbers are not set in it).
- Nav: a persistent system bar with a START menu (sections 1 to 5, All projects, email) and number-key shortcuts 1 to 5 from anywhere. The "now playing" label follows scroll-spy. On phones the bar sits at the bottom edge and the menu opens upward.
- Archive trigger: a top-level "All projects" entry in the system bar (also in the menu and at the end of the Projects section), linking to `projects.html` (featured four, then the `archive` list as save-file cards).
- Hero: a stippled night-sky LCD (`heroSky`, canvas drawn at 7 fps, paused off screen) with name and tagline in a dialog box.
- F1 and Transit Desert: `lazyF1` / `lazyTransit` inside a handheld's screen window, with the project copy on a cartridge card pinned for the whole runway (copy and handheld swap sides). On phones the handheld sits above the copy.
- SQL agent and Harvest Surprise: small LCD canvas scenes (`sqlScene`, `reservoirScene`) in mini handhelds.
- Contact: a console whose LCD lists the real links; START opens a hidden runner (`game.js`, loaded on demand): A, space or tap jumps, B or Escape leaves.
- HTML is generated from `shared/content.js`, so all copy is present without JS.
- Not verified: frame rate (headless, no GPU), screen readers, the game with a real keyboard. The LinkedIn link is the placeholder from content.js.
