// Generates variants 07 and 08 (static HTML from shared/content.js). Run: node gen-p2.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ROOT = 'C:/Users/91704/Desktop/portfolio-website-claude/prototypes'
const { person, howIWork, projects, archive, work, education, skills } = await import(pathToFileURL(`${ROOT}/shared/content.js`).href)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rng = (seed) => { let a = seed; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

/** A section separator slot: shared/p2/seps/index.js fills it with the chosen variant (?sep=query|ghost|seam|swap|zoom|tear). */
function sep(slot) {
  return `<div class="sep" aria-hidden="true" data-slot="${slot}"></div>`
}

function tear(seed, label, variant) {
  return `<div class="tear" aria-hidden="true" data-seed="${seed}"${variant ? ` data-variant="${variant}"` : ''}${label ? ` data-label="${esc(label)}"` : ''}></div>`
}

const icon = {
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></svg>',
}

const BOOT = `<script>(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('portfolio-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t}catch(e){d.dataset.theme='dark'}})()</script>`

function head(title, id, extra = '') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(person.name)}. ${esc(person.tagline)}">
<link rel="icon" href="/favicon.svg">
${BOOT}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400..700&family=JetBrains+Mono:ital,wght@0,400..700;1,400&display=swap">
<link rel="stylesheet" href="/shared/ui/base.css">
<link rel="stylesheet" href="/shared/p2/page.css">
${extra}
</head>`
}

function topbar(id, home = true) {
  const p = home ? '' : `/variants/${id}/index.html`
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="top">
<a class="brand" href="${p}#top">${esc(person.name)}</a>
<nav aria-label="Sections" id="site-nav"><ul>
<li><a href="${p}#approach">How I work</a></li>
<li><a href="${p}#projects">Projects</a></li>
<li><a href="${p}#experience">Experience</a></li>
<li><a href="${p}#contact">Contact</a></li>
</ul></nav>
<a class="ibtn" href="mailto:${person.email}" aria-label="Email ${person.email}">${icon.mail}</a>
<button class="ibtn" type="button" data-theme-toggle aria-label="Switch theme">${icon.sun}${icon.moon}</button>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
</header>`
}

function project(p, i, profile) {
  const viz = { 'f1-pitwall': 'f1', 'transit-desert': 'transit', 'sql-agent': 'sql', 'harvest-surprise': 'harvest' }[p.id]
  const runway = 200
  const facts = p.facts?.length ? `<ul class="facts" role="list">${p.facts.map(([k, v]) => `<li><b>${esc(v)}</b><span>${esc(k)}</span></li>`).join('')}</ul>` : ''
  const stack = `<ul class="stack" role="list">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
  const repo = p.repo ? `<a class="repo" href="${p.repo}" target="_blank" rel="noopener">Source on GitHub ↗</a>` : ''
  const cap = p.animationCaption ? `<p class="stack" style="margin-top:1rem;font:500 .66rem/1.5 var(--mono);color:var(--on-stage-muted)">${esc(p.animationCaption)}</p>` : ''
  return `<article class="proj runway" id="${p.id}" data-project="${viz}" style="--runway:${runway}vh" aria-labelledby="${p.id}-h">
<div class="stage">
<div class="proj-viz" data-viz="${viz}"></div>
<div class="proj-scrim"></div>
<div class="proj-copy">
<p class="kicker">${String(i + 1).padStart(2, '0')} / ${esc(p.kind)} / ${esc(p.year)}</p>
<h3 id="${p.id}-h">${esc(p.title)}</h3>
<p>${esc(p.summary)}</p>
${facts}${stack}${cap}${repo}
</div>
</div>
</article>`
}

function job(j) {
  return `<article class="job"><h3>${esc(j.role)}</h3><time>${esc(j.dates)}</time><p class="org">${esc(j.org)}${j.note ? ' · ' + esc(j.note) : ''}</p><ul>${j.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></article>`
}

function page(id, profile) {
  const heroHero = profile === 'cartridge'
  const hero = heroHero
    ? `<section id="top" class="hero runway" tabindex="-1" aria-labelledby="hero-h" style="--runway:200vh">
<div class="stage">
<div class="hero-viz" data-viz="hero"></div>
<div class="hero-scrim"></div>
<div class="hero-copy">
<h1 id="hero-h">${esc(person.name)}</h1>
<p class="tagline">${esc(person.tagline)}</p>
<p class="meta"><b>${esc(person.role)}</b> / ${esc(person.location)}</p>
</div>
<p class="cue">Scroll</p>
</div>
</section>`
    : `<section id="top" class="hero runway hero--console" tabindex="-1" aria-labelledby="hero-h" style="--runway:150vh">
<div class="stage">
<div class="hero-copy">
<h1 id="hero-h">${esc(person.name)}</h1>
<p class="tagline">${esc(person.tagline)}</p>
<p class="meta"><b>${esc(person.role)}</b> / ${esc(person.location)}</p>
</div>
<img class="gb-poster hero-poster" src="/posters/gameboy-hero.jpg" alt="A translucent handheld console with a green screen showing two hands reaching toward each other." width="560" height="863">
<p class="cue">Scroll</p>
</div>
</section>`

  const projs = projects.map((p, i) => project(p, i, profile)).join('\n')
  return `${head(`${person.name}, ${person.role.toLowerCase()}`, id)}
<body data-profile="${profile}">
${topbar(id)}
<main id="main">
${hero}
<section id="approach" class="approach" tabindex="-1" aria-labelledby="approach-h">
<h2 id="approach-h" class="serif-caps">How I<br>work</h2>
<div class="copy">${howIWork.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
</section>
${sep(1)}
<section id="projects" tabindex="-1" aria-labelledby="projects-h">
<div class="projects-head"><h2 id="projects-h" class="serif-caps">Projects</h2><a href="/variants/${id}/projects.html">View all projects</a></div>
${projs}
</section>
${sep(2)}
<section id="experience" class="xp" tabindex="-1" aria-labelledby="xp-h">
<div class="group"><h2 id="xp-h" class="serif-caps">Work</h2>${work.map(job).join('')}</div>
<div class="group"><h2 class="serif-caps">Education</h2>${education.map(job).join('')}</div>
<dl class="skills">${skills.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
</section>
<section id="contact" class="contact" tabindex="-1" aria-labelledby="contact-h">
<div class="contact-copy">
<p class="eyebrow">Contact</p>
<h2 id="contact-h" class="serif-caps">Say hello</h2>
<p class="lead">The console on the right is live: up and down to choose, A to open.</p>
<ul class="links" role="list">
<li><a href="mailto:${person.email}">${esc(person.email)}<small>Email</small></a></li>
<li><a href="${person.linkedin.url}" target="_blank" rel="noopener">${esc(person.linkedin.label)}<small>Profile</small></a></li>
<li><a href="${person.github.url}" target="_blank" rel="noopener">${esc(person.github.label)}<small>${esc(person.github.handle)}</small></a></li>
</ul>
<p class="hint"><kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> A · <kbd>S</kbd> START plays a hidden game</p>
</div>
<img class="gb-poster contact-poster" src="/posters/gameboy-contact.jpg" alt="A translucent handheld console showing the contact menu: email, LinkedIn and GitHub." width="560" height="1053">
</section>
</main>
<footer class="foot"><span>${esc(person.name)} · ${esc(person.location)}</span><span>Built with three.js. Light and dark follow your system.</span></footer>
<script type="module" src="/variants/${id}/main.js"></script>
</body>
</html>
`
}

function archivePage(id) {
  return `${head(`Projects, ${person.name}`, id)}
<body>
${topbar(id, false)}
<main id="main" class="archive">
<p class="eyebrow">Archive</p>
<h1 class="serif-caps">All projects</h1>
${projects.map((p) => `<article class="arc-row"><span class="kind">${esc(p.kind)} · ${esc(p.year)}</span><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p>${p.repo ? `<a class="arc-link" href="${p.repo}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}</article>`).join('')}
${archive.map((p) => `<article class="arc-row"><span class="kind">${esc(p.kind)} · ${esc(p.year)}</span><h2>${esc(p.title)}</h2><p>${esc(p.line)}</p>${p.repo ? `<a class="arc-link" href="${p.repo}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}</article>`).join('')}
</main>
<footer class="foot"><a href="/variants/${id}/index.html">Back to the portfolio</a></footer>
<script type="module">
import { initThemeToggle } from '/shared/ui/theme.js'
import { initDisclosure } from '/shared/ui/nav.js'
initThemeToggle(document.querySelector('[data-theme-toggle]'))
initDisclosure(document.querySelector('.menu-btn'), document.querySelector('.top nav'))
</script>
</body>
</html>
`
}

for (const [id, profile] of [['08-handheld-hero', 'hero']]) {
  const dir = `${ROOT}/variants/${id}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/index.html`, page(id, profile))
  writeFileSync(`${dir}/projects.html`, archivePage(id))
  writeFileSync(`${dir}/main.js`, `import { initPage } from '/shared/p2/page.js'\ninitPage({ profile: '${profile}' })\n`)
  console.log('wrote', id)
}
