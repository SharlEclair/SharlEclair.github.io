/**
 * The site's copy, in one place, for every mockup variant.
 *
 * Every claim here is taken from `about me/projects.md` and `about me/experience_education.md` and
 * respects their corrections ledger. Variants may re-arrange, truncate and typeset this content, but
 * must NOT add numbers, titles, employers, tools or links that are not in this file.
 */
export const person = {
  name: 'Ashwin Pillai',
  tagline: 'I build systems for making sense of complicated things.',
  role: 'Data engineer',
  location: 'Melbourne, Australia',
  // From the owner's own mockup (mock-ups/Contact.png).
  email: 'ashwinrajesh@yahoo.com',
  github: { label: 'GitHub', handle: 'SharlEclair', url: 'https://github.com/SharlEclair' },
  // No LinkedIn URL exists in the source material. Render the link, keep href as-is, and the owner
  // will fill it in.
  linkedin: { label: 'LinkedIn', url: '#linkedin-url-to-be-added' },
}

export const howIWork = {
  title: 'How I work',
  paragraphs: [
    'I get annoyed by things that are slow for no reason. A coursebook build that took 389.9 seconds. A pipeline that trusted data nobody checked. A system that behaves like a black box.',
    'A broken system is just a problem that gives you clues instead of answers. I find the friction, then write the version without it: that build now runs in 34.2 seconds, and a content-check audit I ran cut false alarms by 68%.',
    'Computer Science with Honours in AI/ML, now finishing a Master of Data Science at RMIT. Off the clock, I’m watching F1 tech breakdowns or Paper Rex pushing into enemy spawn on defence.',
  ],
}

/**
 * The four featured projects, in display order. `animation` names the WebGL piece that belongs to the
 * project ('f1' | 'transit' | null). Projects with null need a lighter, variant-designed visual.
 */
export const projects = [
  {
    id: 'f1-pitwall',
    title: 'F1 Pitwall Platform',
    year: '2026',
    kind: 'Data platform',
    animation: 'f1',
    summary:
      'Formula 1 produces huge amounts of live timing data, and some of it is wrong. I built a system that collects it automatically every week, runs 23 checks on it, and accounts for all 84,140 laps from 88 race sessions: 84,122 clean laps and 18 quarantined, with none unaccounted for.',
    more:
      'It also tested whether a machine-learning model could predict lap times better than a simple formula. On the first season it could not; across three seasons it made a small but detectable improvement over the linear baseline. I reported both.',
    facts: [
      ['Laps accounted for', '84,140'],
      ['Race sessions', '88'],
      ['Data-quality rules', '23'],
      ['Lap-time error, LightGBM vs linear', '0.935 s vs 1.085 s'],
    ],
    stack: ['AWS Lambda', 'S3', 'EventBridge', 'Polars', 'Snowflake', 'dbt', 'DuckDB', 'Power BI', 'GitHub Actions'],
    repo: 'https://github.com/SharlEclair/f1-pitwall-platform',
  },
  {
    id: 'transit-desert',
    title: 'Transit Desert',
    year: '2026',
    kind: 'Geospatial analysis',
    animation: 'transit',
    summary:
      'Some parts of a city are hard to get out of without a car. I mapped a city into more than 10,000 small squares and measured how long it takes to reach places from each one. Adding 177 planned metro stations would cut travel time in about one square in five (20.2%).',
    more: 'The map measures land area, not number of people, and the page says so.',
    facts: [
      ['Grid cells (H3, Res-09)', '10,891'],
      ['Planned stations modelled', '177'],
      ['Cells with faster travel', '2,204 (20.2%)'],
      ['Routing engine', 'Conveyal R5'],
    ],
    stack: ['H3', 'GTFS', 'OpenStreetMap', 'Conveyal R5', 'DuckDB', 'Python'],
    // The animation is an illustration: an A* search replayed over Melbourne streets, from RMIT to the
    // Albert Park circuit. The project itself studied Mumbai and used Conveyal R5, not A*. If a variant
    // captions the animation, it must say so in words like these.
    animationCaption: 'Illustration: an A* search replayed over Melbourne, RMIT to the Albert Park circuit.',
    repo: null,
  },
  {
    id: 'sql-agent',
    title: 'Self-Healing SQL Agent',
    year: '2026',
    kind: 'Agentic AI',
    animation: null,
    summary:
      'Most people can’t ask a database a question without knowing a query language. This tool lets you ask in plain English: an AI writes the database query, safety checks review it before it runs, and if it fails, the tool diagnoses the error and fixes it itself.',
    more: 'On a 10-question test it went from 9 correct to all 10 after fixing its own mistakes, and 45 automated tests keep it honest.',
    facts: [
      ['Benchmark, first attempt', '9 / 10'],
      ['Benchmark, after self-healing', '10 / 10'],
      ['Automated tests', '45'],
      ['Query safety', 'SELECT-only, read-only database'],
    ],
    stack: ['Python', 'DuckDB', 'sqlglot', 'LLM'],
    repo: 'https://github.com/SharlEclair/home-credit-agent',
  },
  {
    id: 'harvest-surprise',
    title: 'Harvest Surprise',
    year: '2026',
    kind: 'Research',
    animation: null,
    summary:
      'Can free satellite photos tell us how the economy is doing? I tested it. Satellite images of three California reservoirs tracked their real water levels closely (correlation 0.66 to 0.93 against gauge readings). Those water levels also helped predict how much rice farmers plant, when tested on years the model hadn’t seen.',
    more: 'Two of my four ideas worked and two didn’t, and I report the failures too.',
    facts: [
      ['Reservoirs measured', '3'],
      ['Correlation with gauges', '0.66 to 0.93'],
      ['Ideas that held up', '2 of 4'],
      ['Pipeline stages', '11'],
    ],
    stack: ['Sentinel-2', 'Planetary Computer', 'Python', 'FastAPI', 'DuckDB'],
    repo: 'https://github.com/SharlEclair/harvest-surprise',
  },
]

/**
 * Additional work for the future /projects archive. One line each, no claims beyond these.
 */
export const archive = [
  { title: 'F1 Strategy Engine', kind: 'Simulation', year: '2026', line: 'Could an undercut have won Monza 2024? 10,000 race permutations evaluated in about 0.2 seconds; the honest answer is a coin toss (53.77%).' },
  { title: 'MILP Roster Optimizer', kind: 'Optimisation', year: '2026', line: 'An exact fantasy-roster optimiser for the Valorant Champions Tour. Mean solve time 8.76 ms on a 28-player pool.' },
  { title: 'AssignMate', kind: 'Team hackathon', year: '2026', line: 'An assignment workspace with a rule-based AI guardrail that refuses by default. Built with a team; 765 tests.' },
  { title: 'Retail Supplier Scorecard', kind: 'Exercise', year: '2026', line: 'A weekly supplier scorecard on public sample data with Power Query, Excel and Power Automate.' },
  { title: 'F1 × Currents', kind: 'Graphics', year: '2026', line: 'The scroll-driven WebGL piece on this page: about 1,650 streamlines in one draw call.' },
]

export const work = [
  {
    role: 'Data Engineer',
    org: 'Spectrum Tuition',
    note: 'RMIT capstone with an industry partner, five-person team',
    dates: 'Jul 2026 to present',
    place: 'Melbourne',
    points: [
      'Made a coursebook build 11 times faster, from 389.9 seconds to 34.2, by running the AI steps in parallel and testing that the output matched the original.',
      'Audited the platform’s automatic quality checks on real tutor books and shipped 21 fixes. False alarms fell by 68%, and on a book the checks had never seen they fell from 345 to 3.',
      'Helped put the platform’s production website online, setting up the domain, hosting and database.',
    ],
  },
  {
    role: 'Data Analytics Engineer',
    org: 'Embin Technologies',
    note: null,
    dates: 'Dec 2023 to Apr 2024',
    place: 'Mumbai',
    points: [
      'Cut manual reporting time by 40% by designing dashboards that operational managers could drill into, and walking them through how to use them.',
      'Reduced device-level data errors by 25% by finding that sensor readings were drifting out of calibration.',
      'Built automated pipelines that cleaned IoT sensor data and showed occupancy and peak-demand patterns across 40+ facilities.',
    ],
  },
]

export const education = [
  {
    role: 'Master of Data Science',
    org: 'RMIT University',
    dates: 'Mar 2025 to Dec 2026',
    place: 'Melbourne',
    points: [
      'Future Leaders Scholarship recipient (20% tuition reduction).',
      'Applied coursework in data visualisation, databases, analytics and data wrangling, with the capstone above as the industry project.',
    ],
  },
  {
    role: 'Bachelor of Engineering, Computer Science',
    org: 'St. Francis Institute of Technology',
    dates: 'Jan 2020 to May 2024',
    place: 'Mumbai',
    points: ['Honours in Artificial Intelligence and Machine Learning. GPA 8.48 / 10.'],
  },
]

export const skills = [
  ['Languages', 'Python, SQL, R, JavaScript'],
  ['Data engineering', 'AWS (S3, Lambda, EventBridge), Snowflake, dbt, DuckDB, Polars, FastAPI, Docker'],
  ['Analysis and ML', 'Pandas, scikit-learn, LightGBM, PyMC, time series'],
  ['BI', 'Power BI (DAX), Tableau, Streamlit'],
]

/** Section ids every variant must expose as anchors, so navigation and deep links are comparable. */
export const sections = [
  { id: 'top', label: 'Intro' },
  { id: 'approach', label: 'How I work' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'contact', label: 'Contact' },
]
