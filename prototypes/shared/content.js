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
  linkedin: { label: 'LinkedIn', url: 'https://www.linkedin.com/in/ashwinrpillai' },
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
      'Formula 1 produces huge amounts of live timing data, and some of it is wrong. I built a system that collects it automatically every week, runs 23 checks on it, and proves that all 84,140 laps from 88 race sessions arrive safely in a cloud database, with none lost or altered.',
    facts: [
      ['Laps accounted for', '84,140'],
      ['Race sessions', '88'],
      ['Data-quality checks', '23'],
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
      'Some parts of a city are hard to get out of without a car. I mapped a city into more than 10,000 small squares and measured how long it takes to reach places from each one. Modelling 177 planned metro stations shows travel time falling in about one square in five (20.2%).',
    facts: [
      ['Grid squares', '10,000+'],
      ['Planned stations modelled', '177'],
      ['Squares with faster travel', '20.2%'],
    ],
    stack: ['H3', 'GTFS', 'OpenStreetMap', 'Conveyal R5', 'DuckDB', 'Python'],
    // The animation is an illustration: an A* search replayed over Melbourne streets, from RMIT to the
    // Albert Park circuit. The project itself studied Mumbai and used Conveyal R5, not A*. If a variant
    // captions the animation, it must say so in words like these.
    animationCaption: 'Illustration: an A* search replayed over Melbourne, RMIT to the Albert Park circuit.',
    repo: 'https://github.com/SharlEclair/transit-desert-platform',
  },
  {
    id: 'sql-agent',
    title: 'Self-Healing SQL Agent',
    year: '2026',
    kind: 'Agentic AI',
    animation: null,
    summary:
      'Most people can’t ask a database a question without knowing a query language. This tool lets you ask in plain English: an AI writes the database query, safety checks review it before it runs, and if it fails, the tool diagnoses the error and fixes it itself. It went from 9 correct answers to a perfect 10 out of 10 on a test set, and 45 automated tests keep it reliable.',
    facts: [
      ['Correct, first attempt', '9 / 10'],
      ['Correct, after self-healing', '10 / 10'],
      ['Automated tests', '45'],
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
      'Can free satellite photos tell us how the economy is doing? I tested it. Satellite images of three California reservoirs tracked their real water levels closely, and those water levels helped predict how much rice farmers plant, even on years the model hadn’t seen.',
    facts: [
      ['Reservoirs measured', '3'],
    ],
    stack: ['Sentinel-2', 'Planetary Computer', 'Python', 'FastAPI', 'DuckDB'],
    repo: 'https://github.com/SharlEclair/harvest-surprise',
  },
]

/**
 * Additional work for the future /projects archive. One line each, no claims beyond these.
 */
export const archive = [
  { title: 'F1 Strategy Engine', kind: 'Simulation', year: '2026', line: 'Could an undercut have won Monza 2024? 10,000 race permutations evaluated in about 0.2 seconds; the honest answer is a coin toss (53.77%).', repo: 'https://github.com/SharlEclair/f1-strategy-engine' },
  { title: 'MILP Roster Optimizer', kind: 'Optimisation', year: '2026', line: 'An exact fantasy-roster optimiser for the Valorant Champions Tour. Mean solve time 8.76 ms on a 28-player pool.', repo: 'https://github.com/SharlEclair/vct-prediction-engine' },
  { title: 'AssignMate', kind: 'Team hackathon', year: '2026', line: 'An assignment workspace with a rule-based AI guardrail that refuses by default. Built with a team; 765 tests.', repo: 'https://github.com/SharlEclair/rmit-hackathon' },
  { title: 'Retail Supplier Scorecard', kind: 'Exercise', year: '2026', line: 'A weekly supplier scorecard on public sample data with Power Query, Excel and Power Automate.' },
]

export const work = [
  {
    role: 'Data Engineer',
    org: 'Spectrum Tuition',
    note: 'RMIT industry capstone',
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
