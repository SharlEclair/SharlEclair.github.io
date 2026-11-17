---
title: "Projects: Detailed Engineering Dossier"
author: "Ashwin Pillai"
last_updated: "2026-11"
status: "Working document. Not frozen, not site copy."
companion: "projects.md (summary fact sheet), hero-section/research/ (frozen site copy)"
---

# Projects: Detailed Engineering Dossier

Every project, with the architecture, the measured results, the stack, and an honest
evidence grade. This document is deliberately stricter than `projects.md`: where a
claim is contradicted by the code, the contradiction is recorded here rather than
quietly dropped.

## How to read this

**Evidence grades.** Each claim block carries one:

| Tag | Meaning |
|---|---|
| `[verified]` | Traceable to a named file, line, or commit |
| `[measured]` | A real logged, benchmarked, or test-reported number |
| `[observation]` | Defensible, but not measured. Framing, not a result |
| `[retracted]` | The code does not support it. Must not be repeated |
| `[unverified]` | Asserted somewhere, but no source was located |

**Rules this document follows**, taken from the copy rules the site already learned the
hard way (`hero-section/research/SITE-COPY.md` §4):

1. No unqualified percentages. If a number has a denominator, the denominator is in
   the sentence.
2. No claim the analysis does not support. The honest version has repeatedly been the
   stronger one.
3. Every claim traceable to a file or a measurement. Where it cannot be sourced, it is
   marked `[observation]` or `[unverified]` rather than stated flat.
4. The limitation is stated before a reader can probe it.
5. No em dashes.

**What this is not.** It is not site copy. The published strings are frozen in
`hero-section/research/` and must not be edited from here. Fixing a fact in this file
does not unfreeze a card.

**Version note, 14 Nov 2026.** This dossier was written against the earlier
`about me/projects.md`. That summary has since been rewritten to remove the retracted
claims, so references below to what `projects.md` says describe the previous version.
They are retained because each one is the evidence for a correction.

---

## Index

| Position | Project | Domain | Headline result | Grade | Repo |
|---|---|---|---|---|---|
| 01 | **F1 Strategy Engine** | Quantitative decision modeling, simulation | 10,000 permutations (530k rows) in ~184 ms; 53.77% undercut, too close to call | `[measured]` | `SharlEclair/f1-strategy-engine` |
| 02 | **Self-Healing SQL Agent** | Agentic AI, compilers, guardrails | 9/10 zero-shot to 10/10 healed, 10-query benchmark; 45 tests | `[measured]` | `SharlEclair/home-credit-agent` |
| 03 | **Transit Desert** | Spatial data engineering, computational GIS | 177 planned stations reach 20.2% of a 10,891-cell grid; slum mean TDI moves 0.5% | `[measured]` | `SharlEclair/tram-tracker` |
| 04 | **MILP Roster Optimizer** | Exact optimization, Bayesian inference | 8.76 ms mean solve, MIP gap 0.0; projections unvalidated | `[measured]` | `vct-prediction-model` |
| 05 | **AssignMate** | Agentic AI, AI guardrails, full-stack TypeScript | 53-case guardrail golden set, no skip list; 765 tests / 49 files; four acceptance runs | `[measured]` | `SharlEclair/rmit-hackathon-demo` |
| 06 | **Retail Supplier Scorecard (Microsoft stack exercise)** | Power Query, Excel, Power Automate, Copilot Studio on sample retail data | Weekly scheduled flow emails a 17-row scorecard; 9 of 17 sub-categories flagged; draft agent 4/4 test questions correct | `[verified]` | none yet |
| 07 | **F1 Pitwall Platform** | Data engineering (cloud ingest, validation, dbt), MLOps | 88 sessions; 84,140 raw laps reconciled (84,122 silver + 18 quarantined); LightGBM vs linear baseline: small pooled gain over 66 races, null on the first season | `[measured]` | `SharlEclair/f1-pitwall-platform` |
| 08 | **Harvest Surprise** | Applied data science, remote sensing, geospatial | Reservoir storage from satellite vs gauges: Spearman 0.66 to 0.93 on 3 reservoirs; water to rice elasticity +0.28 out of sample; corn and Cushing tank fill reported as nulls | `[measured]` | `SharlEclair/harvest-surprise` |
| Index | **PowerOCR** | Systems programming, Windows ergonomics | Clipboard race guard; one real heap-corruption fix | `[verified]` | `SharlEclair/PowerOCR-App` |
| Index | **Transit Patronage Forecasting** | Time-series forecasting | 8-year model, 2.84% MAPE | `[unverified]` | unknown |
| Index | **Knowledge Extraction Pipeline** | ETL, NLP | none recorded | `[unverified]` | unknown |
| Support | **F1 x Currents** | Real-time graphics, shader engineering | ~1,650 streamlines in one draw call | `[verified]` | `f1-three-test` |
| Support | **Portfolio site renderer (v2)** | Bare WebGL2, type engineering | 1,400-quad field, no framebuffer or bloom | `[verified]` | `hero-section` |

**Position note.** The four-card order (F1, SQL, Transit, MILP) is the settled order.
`project-milp-notes.md` records the change: MILP replaced PowerOCR in the grid, and
PowerOCR moved to the index row. Some older tables have not caught up. `SITE-COPY.md`
§1's project-order table and its alternate ordering still place **PowerOCR at position
4**, and `project-transit-notes.md`'s header still says "Position: project 04" while its
own copy block opens "03 - TRANSIT DESERT". Where those disagree with the §2 frozen copy
and the §3 proof table, the latter two are correct.

**AssignMate is a fifth entry, not a fifth card.** It was added after the four-card order
was settled and has no frozen card in `hero-section/research/SITE-COPY.md`. Adding it here
does not unfreeze or reorder anything there, and the settled grid remains F1, SQL, Transit
and MILP.

**Website selection changed, 14 Nov 2026.** The four projects selected for the website
rebuild are **F1 Pitwall Platform, Self-Healing SQL Agent, Transit Desert, and Harvest
Surprise**. This supersedes the older four-card order above. The evidence order in this
dossier is unchanged; the website selection is a separate editorial decision, recorded in
`about me/projects.md`.

---

# 01. F1 Strategy Engine

**Domain:** Quantitative decision modeling, discrete-event simulation, sports analytics.

**Core question:** Could Car A beat McLaren's Oscar Piastri by executing a dynamically
optimized undercut at the 2024 Italian Grand Prix (Monza)? `[verified]`

**Repo:** `SharlEclair/f1-strategy-engine`

## Why it exists

Watching Monza, listening to broadcasters guess whether the undercut would work. The
personal hook is the project's opening line on the site: not the modeling, the
discomfort with guessing. `[observation]`

## The two statistical traps `[verified]`

This is the intellectual core, and the reason the model was inspected rather than
merely run.

1. **Fuel burn masks degradation.** 110 kg burns off over a race, so old tyres look
   artificially faster than they are. Normalized at **+0.04 s/lap**.
2. **Right-censoring flatters the model.** Strategists pit *before* the tyre cliff, so a
   safe 16-lap stop is recorded as a tyre reaching end of life. A naive reader treats
   every pit stop as a failure event, which biases the fitted curve.

The modelling response to the second trap is the biostatistics move: Bayesian MCMC for
the posterior, a right-censored Weibull survival curve for the cliff.

## Architecture `[verified]`

- **Zero-loop execution.** No Python loops, no Pandas. A native Polars columnar
  execution graph evaluates 10,000 permutations (**530,000 matrix rows**) in
  **~184 to 200 ms**.
- **Offline / online split.** Compute-heavy MCMC and survival fitting run offline. The
  online Streamlit layer consumes precomputed parameter contracts (`model_weights.json`)
  for sub-millisecond slider response.
- **Domain hygiene.** A **103% stint-median pace filter** purges aerodynamic wake
  ("dirty air"). Net pit-loss delta is corrected at **21.199 s** normal versus
  **11.199 s** cheap stop under Safety Car.

> **Terminology correction `[retracted]`:** `projects.md` heads this section
> **"Air-Gap Architecture."** Air-gapped means physically disconnected from networks.
> What exists is a precomputed artifact: heavy statistics offline, fast serving online.
> The do-not-ship index bans the term outright. Rename to "offline-compute contract."

## Statistics `[measured]`

| Model | Result |
|---|---|
| Hierarchical Beta-Binomial MCMC (PyMC) | 0 divergences across 4k draws |
| Safety Car deployment posterior | `p ~ Beta(alpha=5.10, beta=56.16)` |
| Right-censored Weibull (lifelines) | `lambda=85.45`, `rho=0.94` |
| Medium tyre degradation cliff | Lap 57.8 |

## Result `[measured]`

- **53.77%** win probability for the Lap 15 undercut.
- Median finish delta **+5.91 s**.
- **19/19 pytest suite passing.**

**The honest framing, which is the stronger one.** This is a coin toss. `53.77%` moves
more on which variables are included than on the race itself. The owner's own
conclusion is *"it could have worked but it is too close to have a confident call
without more variables or more data."* It is not proof that the undercut won.

**Known gap:** `53.77%` has **no baseline**. Until a comparison exists, the number
cannot be used as a headline metric. `[verified]`

## Stack

`Polars · PyMC · lifelines`

Each tool points at a sentence it answers: Polars at `184 ms`, PyMC at "the model
returns a distribution, not a point", lifelines at "strategists pit before the cliff."
Rule applied: add a tool only if it made a specific architectural choice. `[observation]`

## Open items

1. **Deployment status is contradictory.** `projects.md` says "Deployed to GitHub"; the
   owner says it runs locally. Only the source is on GitHub. A live Streamlit link would
   beat a screenshot. `[verified]`
2. **No baseline for 53.77%.** Would need a comparison, not a caveat. `[verified]`
3. **No visual for the statistics.** A Weibull survival curve or the MCMC posterior is
   computable from `lambda` and `rho` and would give the strongest part of the project a
   figure. `[observation]`

**Evidence:** `hero-section/research/project-f1-notes.md`, `about me/projects.md`.

---

# 02. Self-Healing SQL Agent

**Domain:** Enterprise agentic AI, lakehouse analytics, compilers and guardrails.

**Core function:** Natural-language-to-SQL analyst over the Home Credit Default Risk
dataset.

**Repo:** `SharlEclair/home-credit-agent`

## Why it exists

The complaint is not syntax errors. It is a bad join that runs cleanly and silently
inflates your totals. **Silent wrongness is the worst failure mode a data system has:**
a crash is noticed, a plausible wrong number is acted on. `[observation]`

## The finding: fan-out `[verified]`

`application_train` is one row per client. `bureau` and `previous_application` are many
rows per client. Join them and then aggregate, and parent rows multiply: every sum
inflates, every average skews. Nothing errors.

**The defence** is CTE pre-aggregation at `SK_ID_CURR` before any parent join, enforced
in four places: the generator prompt (`agent/nodes/sql_generator.py`, rule 3), the
validator (`agent/nodes/validator.py`, rule 3 of 6), a few-shot exemplar explanation
(`agent/few_shot_retriever.py`), and a tip in the ERD viewer.

> **Retracted claim `[retracted]`:** an early draft implied the agent produced Cartesian
> fan-out bugs and healed them. **False.** The anti-fan-out rule was present in the
> initial commit (`bb50bf68d`) in the generator, the validator and the few-shot seeds.
> Every join query in the benchmark (query_05 to query_10) passed zero-shot. The agent
> never generated an un-aggregated fan-out. Write the rule as a *pre-emptive
> constraint*; never claim the fan-out was healed.

## The genuine healed bug `[verified]`

The better story, and the same failure family. From checkpoint thread
`836325a8-080a-466f-a286-f6694983fc46`: the agent pre-aggregated correctly but used
`LEFT JOIN`:

```sql
SELECT a.TARGET, AVG(COALESCE(p.prev_count, 0)) AS avg_previous_applications
FROM application_train a
LEFT JOIN (SELECT SK_ID_CURR, COUNT(*) AS prev_count
           FROM previous_application GROUP BY SK_ID_CURR) p
  ON a.SK_ID_CURR = p.SK_ID_CURR
GROUP BY a.TARGET
```

Validator rule 3 rejected it: change the `LEFT JOIN` to `INNER`, or the averages are
skewed by clients with zero previous applications. Retry 1 made the change.

This came from a real run, **not** the benchmark suite. It shows the guardrail catching
something subtler than the trap it was built for, and the agent generating the bug
rather than being protected from it.

## Benchmark `[measured]`

Never write "100% accuracy" unqualified. The denominator goes in the sentence.

| Fact | Value |
|---|---|
| Suite size | **10** handcrafted queries, `evals/benchmark_queries.json` |
| Zero-shot | 9/10 (90%) |
| With self-healing | 10/10 (100%) |
| Queries healed | Exactly one: `query_04` |
| What it fixed | An omitted `SK_ID_CURR` in a Top-N listing, caught by validator rule 1/5 |
| Judging method | Candidate and ground truth both executed against DuckDB, compared by `compare_dataframes()`: shape, column normalization, permutation invariance, `np.isclose` tolerance, case-insensitive text |

**Ship this wording:** `9/10 zero-shot. 10/10 with the healing loop. Across a 10-query
benchmark.`

## Safety, stated precisely `[verified]`

Two independent mechanisms: a `sqlglot` AST whitelist (single statement, `SELECT`/`UNION`
only, 3 allowed tables) **plus** DuckDB opened `read_only=True`.

What that guarantees: tables cannot be dropped or altered. What it does **not** guarantee:
`[retracted]` "absolute safety" is false on three counts, recorded in the repo's own
audit:

- No DuckDB memory limit and no statement timeout. An unconstrained cross-join can OOM
  the worker.
- A `read_csv` / `read_parquet` bypass would read arbitrary local files.
- Claim safety over *altering and dropping tables*, and nothing wider.

## Best senior-engineer detail `[verified]`

The sandbox runs each query with **no row limit**, computes statistics across the whole
result, then slices to 100 rows only for checkpoint serialization, injecting the full
statistical context into the synthesis prompt. Both naive alternatives are wrong: send
every row and bloat the checkpointer and context window, or append `LIMIT 100` and skew
every statistic reported. Accuracy on 20,000+ rows, payload under 50 KB.

## Verified numbers `[measured]`

| Fact | Value |
|---|---|
| Tables | 3: `application_train`, `bureau`, `previous_application` |
| Rows | 205,955 total (20,000 / 94,807 / 91,148) |
| Columns | 176 unique; 177 ChromaDB entries |
| Storage | Parquet with ZSTD via DuckDB views; ~6.17 MB |
| Tests | 45, passing |
| Retries | Max 3, user-configurable 0 to 3 |
| End-to-end latency | 29 to 65 s cold |
| Dominant latency cause | **17 to 51 s**: ChromaDB re-instantiating `all-MiniLM-L6-v2` per query (`agent/nodes/schema_retriever.py:17`) |

## Known defects `[verified]`

Stated honestly, from the project's own audit. None are in the site copy.

- Schema retriever re-instantiates the embedding model per query. The dominant latency
  cause. A module-level singleton fixes it.
- **Telemetry logs wrong model names.** `router.py:54` and `validator.py:69` log
  `gemini-3.8-flash` while calling `gemini-3.5-flash-lite`; `fallback_sql_generator.py:52`
  and `synthesizer.py:62` log `gemini-3.1-pro` against a `gemini-3.8-flash` default. The
  UI latency badges name models that were not called.
- **Misleading success summary on terminal failure.** Retry exhaustion routes to
  `synthesizer`, which defaults to "Query executed successfully with 0 rows returned"
  when the dataframe is empty. The user is told it worked when it failed.
- No DuckDB memory limit or statement timeout.
- Unhandled LLM exceptions in router, generator and validator. A 429 crashes the graph.
- Checkpoint SQLite is 20.8 MB for ~2,100 checkpoints, with no pruning or vacuum.

## Stack note `[observation]`

The tri-model hierarchy (router/validator on a flash model, generation on a mid model,
reasoning fallback on a pro model) is a **design preference**. No measured cost or
accuracy justification exists. It must not be presented as an optimization.

**Evidence:** `hero-section/research/project-sql-notes.md`, `about me/projects.md`.

---

# 03. Transit Desert ("Stranded by Design")

**Domain:** Spatial data engineering, computational GIS, graph routing, urban equity.

**Core function:** Quantify spatial transit accessibility deficits in Mumbai, and measure
what a planned rail expansion actually buys.

**Repo:** `SharlEclair/tram-tracker` (Mumbai pipeline; all Melbourne code purged in
`b42b5d7`, and `transit_equity.db` cannot be rebuilt)

## Why it exists

Grew up in Mumbai, where the metro is packed and people still walk down the middle of the
road. Official reports called the new rail expansion a triumph. The question was how
much of the working-class city genuinely still could not reach a hospital or a job.
`[observation]`

**One claim to be ready for.** "Working-class city" is a **framing, not a measurement**.
The settlement layer is a slum-boundary KML, so the quantified group is *informal
settlement cells*, not income brackets. There is no income data in the project. `[verified]`

## Architecture `[verified]`

- Mumbai quantized into **10,891 Uber H3 cells at Res-09** (bounding box, not clipped to
  land).
- Raw GTFS timetables routed over OpenStreetMap network data through **Conveyal R5 /
  FastRaptor**. No routing algorithm is coded in the repo.
- **4 destinations only:** BKC, KEM Hospital, IIT Bombay, Palladium.
- Cutoff **90 min**; max walking **25 min**; max **2** public-transport transfers
  (`max_public_transport_rides = 3`).
- Single departure time: **Tuesday 2026-09-08, 08:45**. Not a peak average.

> **Two retracted claims `[retracted]`:** `projects.md` says **"H3 Res-08"** (the code
> implements Res-09) and claims reachability is computed via **"Dijkstra/A* multi-hop
> graph algorithms"** (routing is delegated to Conveyal R5). Separately, "dynamic
> isochrone engine" and "3.8 million residents" are unsupported: no isochrone layer
> exists, and no population calculation exists at grid level.

## The finding `[measured]`

Two clean numbers, both raw before-and-after on the same cells.

- **The metro helps.** Adding the 177 planned stations reduces travel time in **2,204
  cells, 20.2% of the 10,891-cell grid**.
- **It barely helps the worst-served.** For the **360** informal-settlement cells
  (`V = 1.0`), mean TDI moves **0.5523 to 0.5493**, a **0.5%** change. 128 of those 360
  (35.6%) did improve; the mean barely moves.
- **The pre-existing gap is the real story.** Slum cells score **0.55** baseline TDI
  against **0.16** for the rest of the city, a **3.4x** difference.

The contrast is the project: *new infrastructure reaches a fifth of the city and moves
the worst-served areas by half a percent.*

## Regional detail `[measured]`

| Region | Cells improved |
|---|---|
| Western Suburbs | **31.0%** (1,078 of 3,473) |
| South Mumbai | 16.2% |
| Eastern Suburbs / Thane / Navi Mumbai | 14.2% |

This **contradicts a common framing**: the metro did *not* bypass wealthy areas. It
added broad access and left the informal settlements behind. Those are different
findings. `[retracted]` "Trains run empty in wealthy suburbs" has no source in the
repository and is contradicted by this table.

## TDI is circular `[verified]`

**The most important technical finding, and it is not visible in the site copy.**

Vulnerability is binary: `V = 1.0` for slum intersection, `V = 0.2` for everything else.
TDI derives from `V`. Therefore:

```
maximum formal-area TDI = 0.2 x (1 - 0) = 0.20
severe-desert threshold  = 0.50
```

A formal-area cell **can never** be classified as a severe transit desert, not because
its access is good but because the arithmetic caps it. All **205** "severe desert" cells
(1.88% of the grid) are slums **by construction**.

**Never ship "205 severe transit deserts."** Two honest responses: fix the formula
(likely a normalization change, not a rewrite), or state it as a known limitation.

## Measurement limits `[verified]`

State these if the section ever grows. Only the population caveat is in the frozen copy.

| Limit | Consequence |
|---|---|
| **No population data** | Measures **area, not people**. 97 wards of census data were never disaggregated to the grid |
| **Only 4 destinations** | Not all employment, healthcare or education |
| **Synthetic metro GTFS** | Constant 35 km/h, fixed headways, zero congestion or delay. It illustrates, it does not prove |
| **Single departure time** | Transfer waits reflect one minute of one day |
| **Unclipped bounding box** | 46.28% of cells (5,041/10,891) reach no POI within 90 min, but the box includes the Arabian Sea, Thane Creek and national park land. Never write this without the caveat |

## Verified numbers `[measured]`

| Fact | Value |
|---|---|
| Grid | 10,891 H3 Res-09 cells |
| Slum cells | 360 at `V = 1.0`; baseline mean TDI 0.5523, 2030 mean 0.5493; 128 improved; max single-cell relief +0.0389 |
| Non-slum cells | 10,531 at `V = 0.2`; baseline mean TDI 0.1616; 2,076 improved (19.7%) |
| Bus feed | BEST, KDMT, TMT, VVMT: 10,279 stops, 1,609 routes, 99,080 trips |
| Suburban rail | 54 CSVs harmonized to GTFS: 119 stops, 6 routes, 4,957 trips |
| Metro (synthetic) | Operational 79 stops / 6 routes; 2030: 177 stops / 13 routes |
| Street network | 1,331,942 OSM nodes, 176,279 ways, clipped 210 MB to 11.58 MB |
| Matrix runtime | ~3 to 5 minutes for 10,891 origins via Conveyal R5 |
| Tests | 24, all passing in 8.16 s (bare `pytest` fails; `src` not on `sys.path`) |
| Code size | 17 files, 7,163 lines (14 Python, 1 JS, 1 CSS, 1 HTML) |

**Evidence:** `hero-section/research/project-transit-notes.md`, `about me/projects.md`.

---

# 04. MILP Roster Optimizer

**Domain:** Exact combinatorial optimization, analytical Bayesian inference, esports
analytics.

**Core function:** Provably return the best 11-player Valorant Champions Tour fantasy
roster under a strict salary cap, including captaincy.

**Repo:** `vct-prediction-model` (VCT/VFL fantasy)

> **Framing correction `[retracted]`:** the resume calls this an "Operational Resource
> Allocation & Prediction Engine." It is a **Daily Fantasy Sports roster optimizer for
> the Valorant Champions Tour.** Any interviewer who opens the repo sees that in thirty
> seconds. The abstraction buys nothing and costs credibility when checked.

## The linearization `[verified]`

The league's "2x points for the captain" rule makes the objective nonlinear. Doubling the
decision space to **2N binary variables**, bound by `y_i - x_i <= 0` and `sum(y) = 1`,
keeps it linear. Classic formulation work, correctly applied.

**Exactness and speed `[measured]`:** mean solve **8.76 ms** on a 28-player pool
(min 6.77, max 11.52), `success=True`, **MIP gap 0.0**.

**Six constraint classes `[verified]`:** exact roster of 11, one IGL, IGL must be
drafted, budget cap, per-role bounds `2 <= n <= 5`, max two players per pro team.

## The projection layer `[verified]`

**Not machine learning.** This claim has been recorded as a recurring error four times
(resume, card draft 1, card draft 2, final draft) and is false. The audit's own answer:
*"No part of the EV layer is machine learning. No model is fitted to a target, trained
with loss minimization, cross-validated, or serialized to disk."*

The correct description is **analytical Bayesian inference**:

- Conjugate Gaussian-Gaussian updating
- Exponential time decay with a **138.6-day half-life**
- Per-role z-score normalization
- A bounded `tanh` Elo multiplier in `[0.85, 1.15]`
- Kish's effective sample size `n_eff = (sum w)^2 / sum w^2`
- A variance floor `s_w^2 >= 25.0` when `n_eff < 2.0`

Closed-form, hand-weighted, no fitted parameters. **The framing that is both true and
stronger:** two distinct techniques correctly applied, Bayesian inference for the
projections and exact MILP for the roster. Knowing when a fitted model is the wrong tool
is a senior signal, not a weakness.

### The ML that does exist `[measured]`

The repo genuinely contains ML: `ml/` holds LightGBM and CatBoost classifiers with Optuna
tuning. That model predicts **match winners**, not player points, and **the optimizer
never imports it.**

| Model | Metric | Result |
|---|---|---|
| LightGBM match classifier | ROC-AUC (validation) | **0.6289** |
| LightGBM match classifier | Accuracy | 59.48% |
| Logistic regression baseline | ROC-AUC | **0.6530** |
| Logistic regression baseline | Accuracy | 61.21% |

**The supervised model loses to the baseline, in its own validation report.** Not wired
into the optimizer.

## The honest result set `[measured]`

The card states the last line only. The rest belongs in the repo and in answers.

| Fact | Value |
|---|---|
| Solve time | 8.76 ms mean, MIP gap 0.0, exact |
| Gameweeks evaluated | **Two** (GW1 and GW2, Champions 2026) |
| GW2 model roster | 140.0 points |
| GW2 hindsight optimum | 199.0 points (same pool, same constraints) |
| Mean absolute player swing | 5.13 points per gameweek (59% of mean active score 8.89) |
| Multi-gameweek backtest | **None exists** |
| Projection validation | **None in the active codebase** |
| Naive baseline comparison | Not measurably better. A legacy v5 backtest had naive career averages at **4.37 MAE** vs **6.94** for the simulation models |
| Calibration check | None for the EV layer |

**The one-line truth:** the solver is exact and the projections it optimizes are
unvalidated. That is a precise description of where the value and the risk sit.

**The ~107 figure `[retracted]`:** it is **not** an average manager's score. In GW1 the
model's own roster scored ~107. In GW2, `11 x 8.89 = ~106.7`. Do not call it the field
average.

## Data `[measured]`

VLR.gg match telemetry, 2022 to 2026. **69,610 player-map rows** across **562 players**
and **1,469 matches**. **133 tests passing** in 60.93 s.

## Four false resume claims `[retracted]`

Verified against the code. All four need correcting in the resume.

| Resume claim | Reality |
|---|---|
| "PuLP MILP" | PuLP is pinned in `requirements.txt:L9` and **never imported**. The solver is `scipy.optimize.milp` wrapping HiGHS (`v9_milp_optimizer.py:L15`) |
| "70.4% efficiency ratio against hindsight-optimal theoretical ceilings" | Not in the codebase. From a **deleted** file (`model_performance_audit.md`, removed in `0288aac`). It was one gameweek's fantasy score: 140.0 actual vs 199.0 hindsight. Never an optimization metric |
| "1,900+ multi-variable records" | **1,469** raw match files, **1,251** cleaned match rows. "1,900+" appears nowhere |
| "500 Monte Carlo iterations in <0.15s" | **No simulation exists.** `app.py:L221-L250` runs a 3-line closed-form Gaussian CDF. No loop, no 500, no timing |

Also banned: "mathematically perfect" / "mathematically flawless." The solver is exact
given its inputs; it is not perfect about the world.

## Highest-value next step `[verified]`

**Write the backtest.** `execute_post_gw_calibration_pass()`
(`v9_h2h_and_calibration.py:L125-L186`) already computes MAE and is currently called
**only from a unit test** (`test_v9_h2h_and_calibration.py:L134`). It is never pointed at
historical gameweeks. Wiring it up answers the only question that matters ("do the
projections work?"), turns the card's limitation into a finding, and is the obvious third
project hiding in this repo.

**Stack:** `Python · scipy.optimize.milp · HiGHS · Streamlit`

**Evidence:** `hero-section/research/project-milp-notes.md`.

---

# 05. AssignMate

**Domain:** Applied agentic AI, AI policy and guardrail engineering, full-stack TypeScript.

**Core function:** An assignment workspace for university students and tutors in which the
**assignment, not a chat window, is the central object**. A tutor uploads the brief and its
supporting documents; an ingestion pipeline proposes a structure; the tutor reviews, edits
and approves it; the student then works through the original brief, that approved
structure, a checklist, a strictly constrained AI coach, private questions to the tutor,
and anonymous peer discussion.

**Repo:** `SharlEclair/rmit-hackathon-demo`

## Why it exists

The same problem stated from both sides. **Students** hesitate to ask for clarification,
because the question feels stupid and because they often do not know whether AI is even
permitted for this particular assignment; generic assistants then make that worse by
producing exactly the answer academic integrity forbids. **Tutors** answer the same
questions repeatedly, cannot see which part of the assignment the cohort is actually
struggling with, and discover a requirement was ambiguous only after students have started
work. `[observation]`

The design response is a **constraint rather than a capability**: the assistant knows what
*this* assignment's policy permits and refuses the rest. The refusal is the feature.

## The guardrail is a layer, not a prompt clause `[verified]`

The most important architectural decision in the project, and the one worth the most in an
interview.

- It is a **pure module at `src/lib/guardrail/` that performs no network I/O**, not a
  paragraph in a system prompt. There is an explicit rule that **a model call may refine
  the decision, but may never be the only reason a request is allowed.**
- Deterministic checks run **before** any model call. **Uncertainty is not permission:** a
  layer that fails, throws, times out, or returns something unparseable yields `REFUSE`.
- Five verdicts, with the fixed severity order
  `REFUSE > ESCALATE_TO_TUTOR > CLARIFY > ALLOW_WITH_SCOPE > ALLOW`. A combination of
  verdicts always resolves to the most restrictive one, which is how multi-file uploads and
  multi-intent turns are combined. There is no `PARTIAL` and no "answer with a caveat",
  because a caveat is not a constraint.
- **Refusal text is generated from a template plus a cited rule sentence, not by a model**,
  so a refusal cannot hallucinate a policy.
- The guardrail **cannot be widened by anything in the conversation**, by an upload, by a
  discussion post, or by any student-supplied text. Only an approved AI Usage Policy
  changes it.
- A model response that fails schema validation is a refusal. It is never a retry until it
  validates.

The wider constraint set is eight absolute rules the build is held to, of which the
governing one is that the AI must never do the assignment for the student.

## Golden set `[measured]`, with its limit stated up front

| Class | IDs | Count | Verdicts within the class |
|---|---|---|---|
| Prohibited | G01-G18 | 18 | 18 `REFUSE` |
| Allowed | G19-G37 | 19 | 15 `ALLOW`, 2 `ALLOW_WITH_SCOPE`, 2 `ESCALATE_TO_TUTOR` |
| Ambiguous / attack | G38-G49 | 12 | 9 `REFUSE`, 2 `CLARIFY`, 1 `ESCALATE_TO_TUTOR` |
| Upload modality | G50-G53 | 4 | 3 `REFUSE`, 1 `CLARIFY` |
| **Total** | G01-G53 | **53** | `REFUSE` 30, `ALLOW` 15, `ALLOW_WITH_SCOPE` 2, `CLARIFY` 3, `ESCALATE_TO_TUTOR` 3 |

The spec states the shipped run executes **all 53 with no skip list** and no `MODALITY`
exclusion, and that the ambiguous/attack class exists to catch laundering shapes: a
reworded, hypothetical, decomposed or "just checked" request is treated as the same act as
the request itself. `[verified]`

**The limit, stated first.** The handoff's test totals (765 tests across 49 files) are not
broken out per suite, so "53/53 executing" is verified as a specification and a shipped-run
statement, **not** as a per-suite number quoted from the last recorded run. `[unverified]`

**A second limit.** The stated runtime budget, the whole set under 5 seconds against the
mock provider with no network access, is a **requirement in the spec, not a quoted
measurement.** `[observation]`

## Architecture `[verified]`

- **One deployable.** Next.js App Router serves both the UI and the JSON API. Server
  components for reads, route handlers for writes.
- **Postgres holds everything, including retrieval state** (full-text `tsvector` over
  source chunks). There is **no vector database**: explicitly rejected by decision, not
  deferred, and not to be scaffolded.
- **One enforced pathway to the model.** Every call goes through a provider adapter at
  `src/lib/llm/`; **no vendor SDK may be imported outside that folder**, and this is
  enforced by a CI import gate rather than by convention. The provider resolves at startup:
  `gemini` (default), `deepseek` (documented alternative), `mock` (required, fully
  offline).
- **Offline is a supported mode, not a stub.** With the mock provider the whole product
  loop is walkable with no API key at all, while the guardrail still runs its real,
  deterministic rules. That is how the acceptance runs are verified.
- **Typed query layer.** Drizzle ORM 0.45.3 over the `postgres` driver, with plain SQL
  migration files committed in the repo. Prisma was rejected on a concrete ground: its npm
  dist-tags disagreed at build time, so a `latest` install would have produced a mixed major
  line inside the build window.
- **Ingestion as a pipeline**, stages S0-S8: extraction, page mapping, chunking, retrieval
  indexing, then structure proposal.
- **Privacy is structural, not a setting.** Tutor analytics are aggregate only, with
  k-anonymity floors of 5 and 8; a moderation flag carries a post id and never an author
  id, so tutors cannot see who wrote an anonymous post.
- **Canvas integration is absent by decision**, not deferred and not to be stubbed; the app
  must run with every `CANVAS_*` variable unset.

## Numbers `[measured]`

Quoted from the handoff's gate block at **session 09**, the last recorded state. By the
repository's own trap **T42**, a count written into a file the repository contains is stale
on commit, so these carry a session stamp rather than being asserted as current.

| Gate | Result |
|---|---|
| `pnpm test` | **765 passed** across 49 files, with no network and no database |
| `pnpm typecheck` | 0 errors |
| `pnpm lint` | C8 import/endpoint gate ok, plus 13 design gates ok |
| `pnpm build` | exit 0 |
| `pnpm db:migrate` | 13 applied, 0 pending |
| `verify-student` / `verify-review` | **18/18** / **20/20**, live HTTP runs |
| `verify-analytics` / `verify-discussion` | **13/13** / **20/20**, live HTTP runs |
| `pnpm demo:beats` | 11/11, recorded two sessions earlier at session 07 |

The four `verify-*` runs are deliberately **not** part of `pnpm test`, because they need a
live server; they are the only end-to-end evidence.

## Known defects, stated before they are probed `[verified]`

- **I-68, open and highest priority: client components do not hydrate against the dev
  server in this environment.** Server output is complete but no React handler is attached;
  the HMR websocket answers `ERR_INVALID_HTTP_RESPONSE`. The same build under a production
  start hydrates and works, so all browser verification was done against the production
  build. This is an environment defect, not a product claim, and it is unresolved.
- **I-69, open:** the run sheet and the recorded browser evidence disagree about which
  command produced the evidence, and I-68 decides the answer.
- **The tutor-side Discussions and Queries screens have never been opened in a browser.**
  They were built but not looked at, which is exactly how the two student screens came to
  be half-built. As verified UI, they do not count.
- **Deployment status: local only.** At session 09 the repository had local commits and
  **nothing pushed**, with a standing rule not to push unless asked. There is no live link
  and no hosted deployment.

## Authorship `[verified]`

**This is a team hackathon entry, not solo work.** The repository records team-authored
code only, and the hackathon working agreement forbids implementation help from outside the
team. The submission document carries a per-member AI-use disclosure, as the event
requires.

**The documents read for this entry do not establish a per-member contribution split**,
so no individual share of this build is claimed here. Any specific individual authorship
claim is `[unverified]` until the submission document is checked.

**Stack:** `TypeScript (strict) - Next.js App Router - Tailwind CSS - Postgres - Drizzle ORM - Postgres full-text search - one provider adapter (gemini / deepseek / mock)`

**Evidence:** the AssignMate repository at `C:\Users\91704\Desktop\RMIT Hackathon`:
`README.md`, `AGENTS.md`, `docs/handoff/01-STATE.md`, `docs/05-AI-GUARDRAILS.md`,
`docs/04-TECH-ARCHITECTURE.md`.

---

# Index row projects

## PowerOCR

**Domain:** Systems programming, Windows ergonomics, multimodal AI.
**Repo:** `SharlEclair/PowerOCR-App`

**Critical repo note `[verified]`:** the repository contains **two** implementations.
`PowerOCR/` is the active standalone WinUI 3 app. `src/modules/PowerOCR/` is a legacy
PowerToys module, parts of which are dead code. **Most claims in `about me/projects.md`
come from the legacy module and do not hold for the live app.**

### The false claims `[retracted]`

All of these appear in `projects.md`. The code does not support them. On a site whose
thesis is that claims get checked, these are the defects that would discredit everything
else.

1. **"Air-gapped by default."** `LlmFormattingService.cs:73-82` sends the HTTPS POST
   **regardless of whether the API key is empty**. The empty key only skips the auth
   header. On a fresh install the app transmits captured text to `api.openai.com` and
   waits for a 401 before falling back. **Outbound access is attempted, not blocked.**
   This is a privacy claim about other people's data, so it is the most serious.
   *Fix (§6.1): five lines, return `rawText` early when no key is configured. That makes
   "stays local unless you configure a key" a true claim and fixes a real privacy bug.*
2. **"Four hotkey modes: A, V, S, T."** Only `S` and `T` are real, and only in the legacy
   module. `A` and `V` are **not handled anywhere**. The active standalone app handles
   none of the four, only `Escape`.
3. **"`WS_EX_NOACTIVATE` acrylic HUD without stealing focus."** `WS_EX_NOACTIVATE` is set
   only in `OcrStatusToast.xaml.cs` inside an unconnected prototype. The overlay is a 65%
   black dimming rectangle (`#A6000000`), not transparent: no acrylic, no Mica, no
   `DwmSetWindowAttribute`. What is true is `WS_EX_TOOLWINDOW` with `WS_EX_APPWINDOW`
   cleared: the app stays out of the taskbar and Alt+Tab.
4. Also false: **"0 ms local, 1.2 s refined"** (neither is measured; no `Stopwatch`, no
   perf counters anywhere; local WinRT OCR is realistically 50 to 200 ms) and
   **"Gemini Vision"** (the image path exists but is not called from the live app; the
   default endpoint is `api.openai.com` with `gpt-4o-mini`).

### What the project genuinely has `[verified]`

The best material, all verifiable.

- **The clipboard race guard, the headline.** `OcrPipelineManager.cs:112-136`: the app
  writes the clipboard, waits for a network call, then **reads the clipboard back and
  compares it to its own raw text** before overwriting. If the user copied anything else
  in the interim, the overwrite aborts and a toast says so. Plus `CancelInflight()`
  (`:36-51`, called from `OverlayCoordinator.cs:33`) cancels a previous request when a
  new snip starts, so a slow response cannot stomp a newer one. A real concurrency bug,
  anticipated and handled, with a user-visible escape hatch.
- **A real crash, found and fixed.** `0xC0000374` heap corruption on hotkey trigger,
  fixed in commit `09c2bf55bf`. Cause: `MONITORINFOEX` contains a fixed-length
  `szDevice[32]` array, and marshalling it incorrectly in x64 P/Invoke writes past the
  stack frame. Most portfolio projects have never seen an access violation.
- **WinUI 3 has no overridable `WndProc`.** Catching `WM_HOTKEY` required
  `comctl32.dll!SetWindowSubclass` (`HotkeyManager.cs:40-46`), and the delegate must be
  stored in a class field (`_subclassProc`) or the GC will collect a function pointer
  unmanaged code still holds.
- **Multi-monitor DPI math.** `CaptureOverlayWindow.xaml.cs:128-135`, commented
  `CRITICAL DPI MATH`: WinUI pointer coordinates are in DIPs, GDI capture is in physical
  pixels, and monitors left of primary have negative virtual coordinates
  (`ScreenCaptureHelper.cs:50-87`). Get it wrong and every crop is misaligned.
  `GetDpiForMonitor`, `Math.Clamp` on crop rectangles, and `EnumDisplayMonitors`
  re-enumerated per capture so display changes are handled.
- **The Undo toast.** `OcrPipelineManager.cs:162-196`: after the second write, an
  interactive Windows Toast with an Undo button restores `_lastRawText`. Degradation
  handling is entirely user-driven, because there is no semantic scoring of refined
  output.

### The honest AI split `[verified]`

Stated rather than implied, because the split only holds if stated.

- **Heavily AI-generated:** system prompts and JSON payload construction
  (`LlmFormattingService.cs`, `LlmPostProcessor.cs`), P/Invoke signature declarations
  (`NativeMethods.cs`), documentation, initial scaffolding of `OcrStatusToast.xaml`.
- **Handwritten and hand-debugged:** the clipboard race guard, the Undo toast lifecycle,
  the DPI coordinate math, the GDI-to-`SoftwareBitmap` stream bridge, and the heap
  corruption fix.

**The framing that works:** architected the pipeline and directed the platform code; the
concurrency and coordinate work is his own.

### Unfinished and fragile `[verified]`

- **Git conflict markers** in `KeyboardMonitor.cs:8-14, 60-68`. That project will not
  compile.
- **Dead code:** `LlmPostProcessor.cs`, `OcrPostProcessingPipeline.cs`,
  `OcrStatusToast.xaml` are never called from the live path.
- No in-flight indicator: zero feedback during the background call.
- PNG re-encoded twice per capture.
- No detection for black captures. DRM and protected windows
  (`SetWindowDisplayAffinity(WDA_MONITOR)`) return black rectangles with no explanation.
  No password-field awareness either.
- `GetDpiForMonitor` failure silently falls back to 96 DPI.
- **No external users.** Every commit is from one author.

**Stack:** `WinUI 3 · WinRT OCR · P/Invoke`

**Evidence:** `hero-section/research/project-ocr-notes.md`.

---

## Transit Patronage Forecasting

**Domain:** Time-series forecasting.
**Listed as:** an index-row project.

**Only located fact `[unverified]`:** an **8-year** transit patronage forecasting model
using **ARIMA / SARIMA / GARCH** with a **2.84% MAPE**. The single source is
`hero-section/v2/ABOUT.md:67`, which lists it as "absent from the site entirely" and
notes it needs adding. No repo, no dataset, no code, and no date range were located in
this workspace.

**Action required:** either supply the repo and the measured setup (data range,
train/test split, why GARCH was needed), or keep it as a one-line index entry with the
MAPE and no architectural claim.

---

## Knowledge Extraction Pipeline

**Domain:** ETL, NLP, workflow engineering.
**Listed as:** an index-row project.

**Only located mention `[unverified]`:** the index row in `SITE-COPY.md` §3 names
"Knowledge Extraction Pipeline". No description, repo, or result was located.

**Likely alias:** this is probably the repo underlying the
[Automated Video-to-Obsidian Pipeline](#automated-video-to-obsidian-pipeline) or the
[Cortex / Second Brain](#the-cortex--second-brain). Confirm which, and use one name in
both places.

---

# Supporting artifacts

These are **not portfolio projects**. They are engineering work that exists to support
the site, and they are recorded here because the work is real.

## F1 x Currents (`f1-three-test`)

**Role:** atmosphere beside the F1 write-up, nothing more. Recorded decision
(`project-f1-notes.md` §3): *"`f1-three-test` is **aesthetics only**. It is not a
portfolio project."* The same rule the hero follows: the DOM must be complete and
self-sufficient without the canvas; a fact that exists only in WebGL is a defect. Do not
caption it, and do not claim causality between dirty air and the undercut.

**Stack `[verified]`:** vanilla ES modules, three.js r186, lil-gui 0.21, Vite 8. No
framework, no state library, no test framework.

**What it does `[verified]`:** an F1 car (GLB) sits inside roughly **1,650 instanced
streamlines** (550 lines x 3 sheets). Scrolling flies a camera past the car over an
authored runway while the line field parts around the body, deploys from a flat poster
into a volume, and develops turbulence.

**How it works `[verified]`:**

- **One instanced draw call.** A ribbon of 34 points x 2 vertices per instance, with
  per-instance attributes for phase, lane, speed, sheet height, focal band, colour lean
  and seed. Geometry built once on the CPU.
- **All deformation is in the vertex shader**, written as stages 1 to 8: flow offset
  along -X, vertical fan, depth reveal and splay, a guaranteed *corridor* gap so the car
  reads as a void, car-influence splay, wake, multi-octave turbulence, vortex twist, then
  **ground clamp applied last** so no combination of stages can escape the floor.
- **Fragment shader** mixes tone: pale lavender base, violet minority, a focal red band
  as the loudest element, a separation wash on disturbed flow, vortex colour in the wake.
  Additive blending, `depthWrite: false`.
- **Determinism as a feature.** The clock advances in exactly one place, `stop()` and
  `start()` exist so a harness can render twice with one value changed, and `u_timeSeed`
  pre-rolls the flow so frame 1 is indistinguishable from frame 1000. Without that, a
  pixel-diff harness compares two different points in the cycle.
- **`config` is one live singleton mutated in place.** Presets are **deltas**:
  `currents` is the baseline itself (`spec: null`), `f1` is a delta layered over it.
  `classifyPresetChanges` decides uniform writes versus geometry rebuild.
- **Guard the known failure modes.** `safeStep()` guards degenerate `smoothstep` ramps,
  because one NaN vertex makes the GPU discard the **entire** draw and the field silently
  vanishes.
- **Verification `[verified]`:** two layers plus JSON oracles, and a shader probe that
  lifts the GLSL `void main()` body out, rewrites GLSL types into JS, and executes the
  arithmetic to prove a world-space claim a rendered frame cannot show. It also states
  what it does *not* prove.

**Documented silent failures, worth reusing `[verified]`:** a uniform declared, uploaded
and never read (two dead sliders that looked live); a hardcoded 330vh scroll room capping
the animation at progress 0.667; a turbulence ramp shipping **inverted**
(`turbStart 0.85` above `turbEnd 0.815`, so it is at full strength at scroll 0); and the
vortex being a no-op because `vortexSpin`, `vortexTwist` and `vortexRadiusGain` are all
0. **A time-driven rewrite must not silently depend on either the inverted ramp or the
no-op vortex.**

**Weight `[measured]`:** three.js is ~697 kB raw, **180 kB gzipped**. `hero-spec.md` §2.6
bans three.js from the site's own renderer, so embedding it needs a budget ruling.
Standalone, there is no conflict.

**Current checkout state:** the working tree is on branch `newer-version`, which is 40
files ahead of `main` (which is the reverted state). Untracked strays sit in the project
root (`add-harness-fw.ps1`, `add-relay-fw.ps1`, `forensic-crypt-cube-prompt.md` and their
`.result.txt` outputs); they are unrelated to the project and should not be committed.

---

## Portfolio site renderer (`hero-section` v2)

**Role:** the site's own hero field. A deliberate rejection of three.js for the site's
renderer.

**Stack `[verified]`:** bare WebGL2, no framework, no three.js. Target renderer size
**~12 to 18 KB**.

**The field `[verified]`:** one instanced draw call of **1,400 camera-facing quads** with
soft additive falloff, drifting on a monotonic clock and parallaxing against a
spring-damped pointer. Decoration, carrying no information.

**The key decision `[verified]`:** **glow is baked into the primitive**, not applied to
the frame. Each quad is a soft gradient with a broad halo, drawn with
`blendFunc(ONE, ONE)` over premultiplied colour. Brightness accumulates where quads
overlap, and the accumulation *is* the volume. **There is no framebuffer, no bloom pass
and no second render target.** That is what keeps it cheap enough for a mid-tier phone.
The v1 field used `GL_LINES`, which has no width control, no soft edges and no falloff,
so making one glow needed a post-processing pass; it read as flat.

**Acceptance criteria `[verified]`:** `pointer-events: none` and `aria-hidden="true"` on
the canvas (mandatory), backing-store ratio <= 2x, `window.__frames() > 0`, no horizontal
overflow at any tested viewport, **CLS <= 0.02**, no uncaught exceptions, no real GL
errors. Occlusion is tested behaviourally: `document.elementFromPoint` at the centre of
each required element must return that element or a descendant, which subsumes
`pointer-events`, z-index ordering and any future overlay.

**Typography `[verified]`:** Instrument Serif and JetBrains Mono, self-hosted `.woff2`,
both OFL licensed.

**Explored variants `[verified]`:** broadcast, casefile, characterfield, cliff, plate,
spectroscope.

---

# Secondary and exploratory

Recorded as they appear in `projects.md`. None has a frozen site card, and none has been
verified against a repo in this workspace. Treat the technical detail as unconfirmed.

## VCT Prediction Engine

**Domain:** Esports analytics, stochastic modeling, time-series momentum.
**Status `[unverified]`, and possibly a duplicate.**

`projects.md` describes a round-by-round win probability model with ultimate economy,
loadout value deltas, map-side bias, first-blood vectors, clutch-history probabilities
(1v2, 1v3) and mid-round probability drift.

**This appears to be the same repository as [04 MILP Roster Optimizer](#04-milp-roster-optimizer)**
(`vct-prediction-model`). The ML that exists in that repo is a LightGBM/CatBoost match
classifier, which predicts match winners. **Action required:** determine whether this is a
workstream of project 04 or a separate deliverable. If it is the same repo, it should
probably not appear as a separate project, and its ML results should carry the honest
numbers (LightGBM ROC-AUC 0.6289 versus a logistic-regression baseline of 0.6530, i.e.
the model loses to the baseline).

## The Cortex / Second Brain

**Domain:** Knowledge graphs, vector search, local-first architecture.
**Status `[unverified]`.** No repo or measurement located.

Described as: local markdown notes projected into a high-dimensional vector space, with
cosine similarity retrieval replacing folder search, plus CLI integration. The claim that
it surfaces latent connections between unrelated documents is `[observation]`; no
retrieval evaluation was located.

## Automated Video-to-Obsidian Pipeline

**Domain:** ETL automation, transcription, workflow engineering.
**Status `[unverified]`.** No repo or measurement located.

Described as: pull media via URL, route through a local transcription engine, emit
structured tagged markdown into an Obsidian vault. Possibly the same work as the
"Knowledge Extraction Pipeline" index row.

## EMROS Guest Privacy & Service System

**Domain:** IoT UI/UX, smart hospitality, front-end architecture.
**Status `[unverified]` for the technical claims. Classification is wrong in `projects.md`.**

**It belongs under Experience, not the project grid.** `SITE-COPY.md` §1 records the
decision: *"EMROS is client work from Embin, so it belongs under Experience beside the
role that produced it, not in the project grid."*

Described as: wall-mounted touch panel interfaces for guest privacy, room states and
hospitality services, with the front-end authored in Jinja2 templates.

---

# Corrections ledger

Consolidated. Every item below is a claim currently present in `projects.md` or in a
resume draft, with its status and the reason. This is the highest-value section in this
document, because these are the claims that would be checked.

| Claim | Project | Status | Reason |
|---|---|---|---|
| "Air-Gap Architecture" | F1 | **Rename** | Air-gapped means physical network isolation. It is a precomputed offline artifact |
| "Deployed to GitHub" | F1 | **Resolve** | The app runs locally. Only the source is on GitHub |
| "100% accuracy" | SQL | **Qualify** | A 10-query benchmark. State 9/10 zero-shot, 10/10 healed |
| "The agent healed Cartesian fan-out bugs" | SQL | **False** | The rule was pre-emptive, in the initial commit `bb50bf68d` |
| "Absolute safety" | SQL | **False** | No memory ceiling, no statement timeout, `read_csv` bypass |
| "Air-gapped by default" | PowerOCR | **False** | The app POSTs to `api.openai.com` even with an empty key |
| "Four hotkey modes: A, V, S, T" | PowerOCR | **False** | Only S and T exist, in the legacy module |
| "`WS_EX_NOACTIVATE` HUD, no focus stealing" | PowerOCR | **False** | An unconnected prototype. The overlay is not transparent |
| "0 ms / 1.2 s" | PowerOCR | **Unmeasured** | No timing exists anywhere |
| "Gemini Vision" | PowerOCR | **Wrong endpoint** | The default is `api.openai.com` / `gpt-4o-mini`, and the image path is not wired |
| "H3 Res-08" | Transit | **False** | The code is Res-09, 10,891 cells |
| "Dijkstra / A*" | Transit | **False** | Routing is Conveyal R5 / FastRaptor |
| "Trains run empty in wealthy suburbs" | Transit | **Unsupported** | Contradicted by the data: Western Suburbs gained most at 31.0% |
| "Completely untouched" | Transit | **False** | The slum mean moved 0.5%; 128 cells improved |
| "205 severe transit deserts" | Transit | **Circular** | Formal areas are capped at TDI 0.20. Do not ship |
| "3.8 million residents" | Transit | **Unsupported** | No population calculation exists |
| "Dynamic isochrone engine" | Transit | **Unsupported** | No isochrone exists. It computes an O-D matrix to 4 POIs |
| "Machine learning" for the projections | MILP | **False, 4th time** | Asserted and never fitted, trained, cross-validated or serialized. Analytical Bayesian inference |
| "PuLP MILP" | MILP | **False** | PuLP is pinned and never imported. The solver is `scipy.optimize.milp` / HiGHS |
| "70.4% efficiency ratio" | MILP | **False** | One gameweek's fantasy score from a deleted file (140 vs 199) |
| "1,900+ records" | MILP | **False** | 1,469 match files, 1,251 cleaned rows |
| "500 Monte Carlo iterations in <0.15s" | MILP | **False** | A 3-line closed-form Gaussian CDF. No simulation exists |
| "Operational resource allocation engine" | MILP | **Reframe** | It is a VCT fantasy roster optimizer |
| "Mathematically flawless" | MILP | **Reframe** | Exact given its inputs, not perfect about the world |
| "Field average was 107" | MILP | **False** | `11 x 8.89`, not an average manager |
| Team authorship presented as solo work | AssignMate | **Never claim** | A team hackathon entry. The repository records team-authored code only, and no per-member split was located in the documents read |
| "53/53 golden set passing" | AssignMate | **Qualify** | The spec states all 53 execute with no skip list. The handoff does not break the test totals out per suite, so the per-suite number is not quoted |
| "Deployed" / a live link | AssignMate | **Do not claim** | Local commits only at session 09; nothing pushed, no hosted deployment |

**The pattern.** Every one of these is an overstatement in the same direction: a
measured-but-narrow result promoted to a general property. The corrected version has been
the stronger line every time, because it shows the limits are understood.

---

# Adjacent source-material warnings

Not projects, but the same source dataset feeds them. Recorded so the errors do not
propagate into any new document.

1. **`about me/experience_education.md` is wrong and must be rewritten, not patched.**
   The Embin job title is wrong and the dates are missing. The authoritative record is
   `Ashwin_Pillai_Resume.pdf`: **Data Analytics Engineer, Dec 2023 to Apr 2024, Mumbai.**
   The file also carries a "Technical Translation" analogy to F1 CAN-bus telemetry, which
   is a page-fact-dressed-as-content of exactly the kind `CONTENT.md` §2 identifies as
   v1's failure. `[verified]`
2. **The same file contains a section marked `--- ignore below section ---`** with private
   notes and named personal contacts. It must never reach a published page. `[verified]`
3. **What the resume adds that no file records:** a Bachelor of Engineering majoring in
   Computer Science, Honours in AI/ML (St. Francis Institute of Technology, Mumbai);
   Spectrum Tuition as AI & Data Lead from Jul 2026; the RMIT Future Leaders Scholarship;
   and leadership work (CODEX Head of Graphics, Wattle Volunteers). `[verified]`
4. **The resume and the site are selling different people.** The resume targets Data
   Scientist, Data Engineer and Data Analyst roles and leads with Power BI, SQL and ETL.
   Every project card on the site is research engineering. Unresolved. `[verified]`

**Resolved 14 Nov 2026:** `about me/experience_education.md` has been rewritten in place
against the resume and the new source docs. The private networking block was removed. The
current file records the corrected Embin title and dates, the Bachelor's degree, the
scholarship, the certifications and their claim limits, and the Spectrum title caveat
("AI & Data Lead" is not an official title; use Software Engineer, capstone). Items 1-3
above are retained as the reason for the rewrite, not as a description of the current
file.

---

# Highest-value outstanding work

Ordered by value, not by effort.

1. **Disaggregate population for Transit.** 97 wards of census data plus a 10,891-cell
   grid. A spatial join turns "20.2% of the grid" into "N million residents" and gives the
   strongest story on the site a human denominator.
2. **Fix the TDI formula for Transit.** Until then the severe-desert finding is unusable.
   Likely a normalization change, not a rewrite.
3. **Write the MILP backtest.** `execute_post_gw_calibration_pass()` already computes MAE
   and is only called from a unit test. This is the difference between "exact solver,
   unvalidated projections" and a defensible result.
4. **Fix the PowerOCR no-key network call.** Five lines. Makes a true privacy claim
   possible and fixes a real bug.
5. **Fix the ChromaDB singleton for SQL.** 17 to 51 seconds of a 29 to 65 second
   end-to-end time, from one un-hoisted object.
6. **Add a `Stopwatch` to PowerOCR.** Roughly twenty lines. Replaces "about a second
   later" with a measured number.
7. **Deploy the F1 Streamlit app.** Resolves a contradiction and replaces a screenshot
   with a link.
8. **Reconcile VCT Prediction Engine with project 04.** Same repo. Decide whether it is a
   separate workstream or a duplicate entry.

---

# 06. Retail Supplier Scorecard (Microsoft stack exercise)

**Domain:** Self-service reporting and automation on the Microsoft stack (Power Query, Excel, Power Automate, Copilot Studio).
**Built:** 10 Nov 2026, in one sitting, to close the Microsoft-tooling gap named in the Wesfarmers Health Insights & Automation Analyst run. Solo. Not employment, not coursework, not a job simulation.
**Status:** Exercise on a public sample dataset. No repo or README yet (not public). The scheduled flow and the agent were not left running in production.

## Data `[verified]`
- Kaggle "Superstore" `train.csv`: 9,800 rows, 18 columns, order dates 2015 to 2018, 4 categories, 17 sub-categories, total sales 2,261,536.78 (PivotTable grand total).
- The file has a Sales column only: **no Profit or Cost, no supplier column**. Sub-Category stands in for supplier. A `Brand` column (first word of Product Name) was derived but is a rough proxy and unused in the scorecard.
- US sample data, not Wesfarmers or any retail employer's data. Never describe it as supplier data from real work.

## Power Query `[verified]`
- PowerShell split `train.csv` into four yearly CSVs (`sales_2015.csv` to `sales_2018.csv`) in a OneDrive folder.
- `AllSales` query: Folder.Files over the folder, parse and combine the four CSVs, type columns with the en-AU locale so dates read day-first, drop null Sales, dedupe on Row ID, trim text, fill null Postal Code with "Unknown", add Month, Year and Brand. Zero errors in column quality.
- `MonthlySales` (782 rows, sales by sub-category by month) and `SubCatSummary` (17 rows, total sales and distinct orders) loaded as tables; `AllSales` is connection only.

## Excel scorecard `[verified]`
- `tblScorecard` with calculated columns: Share of Sales, Last Month Sales (SUMIFS on the latest month in the data), Prior Month Sales (EDATE minus one month), MoM %, Flag (Review when MoM % is below -20%). Conditional formatting on Flag.
- Result: **9 of 17 sub-categories flagged Review** (Phones -47%, Tables -36%, Binders -27%, Machines -89%, Accessories -38%, Copiers -46%, Furnishings -40%, Art -38%, Envelopes -20%).
- Limitation to state: Supplies shows +468% off a prior month of 452, so MoM % on small bases is noisy; the latest-month comparison is one month only, not a trend test.
- PivotChart: monthly sales for Chairs, Phones, Storage and Tables. First time the candidate built a PivotTable or PivotChart on record.

## Power Automate `[verified]`
- Scheduled cloud flow "Weekly Supplier Scorecard", Monday 10:00: Excel Online (Business) List rows present in a table (`tblScorecard`) then Create HTML table with custom columns (`formatNumber(float(...))` because the connector returns numbers as text) then Office 365 Outlook Send an email (V2).
- Test runs succeeded: the email arrived with all 17 rows, thousands separators, one-decimal share and whole-percent MoM.
- Limitations to state: the workbook copy the flow reads was uploaded to the RMIT OneDrive, so it is a static snapshot and does not refresh from the local Power Query. Only manual test runs were observed, not a scheduled Monday run. Recipient was the candidate only.

## Copilot Studio `[verified]`
- Draft agent "Supplier Insights Assistant" built under a Copilot Studio trial (the RMIT tenant had no licence at first: "User license not found"). Instructions: answer only from the provided knowledge, say "I don't know" otherwise, state the figures used. Knowledge: an export of the scorecard as `Scorecard.pdf`. A default "Search all websites" knowledge source was also present; its removal was not confirmed.
- Preview test, four questions, answers checked against the sheet: highest total sales (Phones, 327,782), which sub-categories are flagged (the nine above), Phones MoM (-47%), and an out-of-scope question (Melbourne weather), which it refused with "I don't know".
- Limitations to state: four questions is a smoke test, not an evaluation; **not published**, no channel, no users; PDF knowledge, not a live data connection.

## What this does NOT show `[retracted if claimed]`
- **Copilot in Excel was not used** (no Copilot button on the Home tab, no licence confirmed). **Copilot in Power Automate's designer panel was seen but not used.** Do not write "built with Copilot".
- No production Power BI, supplier scorecard, promotional or trade-spend analysis from real data. No adoption, no users, no time saved. Do not manufacture retail or FMCG outcomes.
- Skill level for all four tools is exposure.

---

# 07. F1 Pitwall Platform

**Domain:** Data engineering (cloud ingest, validation, warehouse, dbt), MLOps (MLflow, leave-one-race-out evaluation), stakeholder delivery.
**Built:** 10 to 11 Nov 2026. One person, no team. Not employment, not coursework.
**Repo:** `SharlEclair/f1-pitwall-platform` (public, one clean commit; the working history lives in a private archive repo).
**Status:** Deployed to a personal AWS account, deleted and rebuilt once from the repo to prove reproducibility, then widened from one season to three (2023 to 2025) and updated in place; the stack is currently deployed. A Streamlit app is deployed on Streamlit Community Cloud (https://f1-pitwall-platform-msvnskb3jcqzt2qdrsyxs2.streamlit.app/). A seven-page dark Power BI report on the three-season data is in the public repo as a PBIP project with a PDF and per-page screenshots; Power BI Desktop could not save a .pbix, so there is none. Authorship of its code is not claimed in full.

## Why it exists `[observation]`
- Built to give the profile evidence in cloud (AWS), Snowflake, dbt and MLflow, and to show the data-quality habit from earlier work in a data-engineering setting. The earlier AWS evidence was a group coursework project only; this is the first AWS stack the candidate deployed and operated personally.
- Framing, not a result: it answers four strategy questions on three seasons of public timing data (2023 to 2025: tyre degradation, pit-stop cost, undercut success frequency, lap-time forecasting). The undercut question is answered only as a frequency under one stated definition (see below), not as "the" undercut rate.

## Architecture `[verified]`
- OpenF1 historical API (eight endpoints per session, including race positions and gap intervals), then a Lambda ingest (EventBridge weekly schedule plus manual backfill) into S3 raw storage (immutable objects named by content hash, one manifest per session, future and cancelled sessions skipped). A full season takes close to the Lambda's 900 s limit, so the ingest stops starting new sessions when under 90 s remain and is run again.
- A second Lambda validates with Polars against a registry of 23 coded rules (reject, flag or warn), writes silver and quarantine Parquet to S3 and sends an SNS email summary (success and failure).
- A Python loader stages the Parquet in a Snowflake internal stage and runs COPY INTO (idempotent). dbt builds staging views, intermediate views and eight marts on Snowflake, and runs the same project on DuckDB over a committed three-race fixture (position and interval tables synthetic) so CI works without Snowflake.
- Infrastructure as code is one AWS SAM template. CI is GitHub Actions (lint, 112 Python tests, offline SAM validation, dbt build with 8 unit tests on DuckDB) with no AWS credentials.
- Evidence: `infra/template.yaml`, `src/`, `dbt/`, `.github/workflows/ci.yml`, `docs/adr/` (19 decision records) in the public repo.

## Data quality `[measured]`
- Over the 88 ingested sessions of 2023 to 2025 (70 races and 18 sprints): laps 84,140 raw = 84,122 silver + 18 quarantined; stints 4,472 = 4,433 + 39; 37,778 position events and 1,812,781 interval rows all kept; every session reconciles. The same counts match Snowflake on all 9 loaded tables, and a second load staged and loaded 0 files.
- Every rule except the freshness check has hand-labelled good and bad golden cases. Two new rules were calibrated on real data: a position-duplicate rule that first fired on 166 short-lived duplicates (all under 5 s) was changed to flag only duplicates lasting over 10 s.
- Findings that only the real data showed: `stop_duration` exists only from the 2024 US Grand Prix (721 of 842 ordinary stops in 2025, none in 2023); stint boundaries use different conventions across races (aligned per race in dbt, ADR 0012) and in five 2025 sessions the stints disagree with the pit stops altogether (four are left out of the tyre figures, ADR 0017); the intervals endpoint contradicts itself (gap to leader below gap to the car ahead) on 1,297 rows, most in two 2024 races.
- Evidence: `docs/DQ-CATALOGUE.md` (generated from the run), `tests/golden/`, `docs/adr/0004`, `0005`, `0012`, `0015`, `0017`.

## Evaluation `[measured]`, with its limit stated up front
- **Limit:** three seasons (2023 to 2025), circuits repeat across seasons, dry running only (66 of 70 races), fixed hyperparameters with no search, descriptive not general.
- Design: a calibration window (every method sees only a driver's first 5 clean laps of the held-out race), leave-one-race-out, bootstrap intervals over races, plus a stricter leave-one-season-out check. The plan's literal baselines were rejected because they would be fitted on the scored stint (ADR 0013).
- Result: mean absolute error across 66 held-out races is 1.624 s for persistence, 1.085 s for a linear physics baseline and 0.935 s for LightGBM. LightGBM minus the linear baseline is -0.150 s with a 95% interval of -0.265 to -0.047, better in 47 of 66 races. On the first season alone (23 races) the same comparison showed no detectable difference (-0.058 s, interval -0.166 to +0.043); the wider data changed it. Holding out a whole season agrees in direction (-0.026, -0.018 and -0.130 s), but only the 2025 margin is large. Persistence still beats the linear baseline at Spielberg and Imola (2024 and 2025).
- The race-progress (fuel plus track evolution) effect estimated from the data is -0.040 s per lap (95% CI -0.047 to -0.035) against an assumed 0.04; the MEDIUM tyre-age interval includes zero (SOFT and HARD do not), so the dbt degradation slopes are descriptive only.
- Cross-check: on Monza 2024 the platform and an independent earlier project (project 01) kept the same 920 clean laps after the same 103% filter and agree on the pooled degradation slopes to four decimals (MEDIUM 0.0234, HARD 0.0423 s per lap, both with the assumed 0.04 fuel effect).
- Evidence: `docs/ML-RESULTS.md` and `docs/SEASON-RESULTS.md` (generated), MLflow experiment `f1-lap-time` (local, not published).

## Undercut frequency `[measured]`, one definition, small sample
- Definition frozen in ADR 0016 before any outcome was computed: car A stops with car B directly ahead and a known gap of at most 3 s, B stops within 3 laps, no Safety Car, VSC or red flag, success if A is ahead of B two laps after B's stop.
- Result: 164 attempts in 49 races (73 successes, 90 failures, 1 inconclusive); success rate 44.8% of 163 decided, 95% interval over races 35.2% to 53.4%.
- The rate is one point on a curve: with a 3-lap window it runs from 73% (gap up to 1 s, n=48) to 28% (up to 10 s, n=298). Pace difference between cars, tyres and traffic are not controlled. Do not quote 44.8% without the sensitivity.
- Verified two ways: an independent plain-Python implementation reproduces all 164 attempts and outcomes, and hand-built golden scenarios run as dbt unit tests.
- The earlier simulator's 53.77% is a model probability for one hypothetical stop, a different quantity; it is context, not validation. Replacing its assumed pit loss (21.2 s) with this project's Monza estimate (24.6 to 26.8 s) moves its win probability to about 50%.
- Evidence: `docs/UNDERCUT-RESULTS.md`, `docs/adr/0016`, `scripts/check_undercut.py`.

## Operations and cost `[measured]`
- Lambda backfill of one season with eight endpoints: 853 s (2023) and 866 s plus 40 s (2025, stopped early by design and run again). A repeat run that changes nothing: 5 to 6 s. Validator: 40.9 s and 213 MB for one season, 118 s for three.
- S3: 1,678 objects, 328.7 MB. Snowflake load of 522 files: 212 s; a repeat load loads 0 files.
- Teardown and rebuild (done once, before the widening): the whole AWS stack was deleted, then redeployed from the repo. Result: 452 of 452 object keys identical to the baseline, 210 of 210 silver and quarantine Parquet files byte-identical, row counts matching Snowflake. The first `sam deploy` after the rebuild failed silently once (cause unknown); the retry worked. Since then the stack was updated in place, and the teardown script's dry run lists the same 11 resources.
- AWS: 0.00 USD on the budget tracker (limit 5.00); an earlier Billing-page reading showed 140.00 USD of credits remaining (100 sign-up plus 40 earned) and was not repeated. This shows no charges; it is not a to-the-cent account of usage.
- Snowflake: 0.63 of a 10-credit monthly cap used across all loads, dbt builds and exports, on a trial account.
- CI caught one real mistake: the dashboard's data files were not committed because of an ignore rule, found by a failing GitHub run and fixed.

## What does not work, or is not shown `[retracted if claimed]`
- **No GitHub OIDC deploy.** An AWS service control policy explicitly denies creating an OIDC provider in this account (ADR 0014). CI has no AWS access and deploys are run by hand. Do not write "deployed via OIDC" or "CI/CD to AWS".
- **The Snowflake storage integration was built but never worked** (Snowflake could not assume its AWS role; cause not established, a possible organization policy is unproven; CloudTrail held no trace of the failed attempts, ADR 0019). Data is loaded through an internal stage (ADR 0011). Do not claim an S3 external-stage load.
- Pit loss is an estimate and breaks down under neutralisation: Safety Car medians were 10.7 s, 4.2 s and -3.9 s in 2024, 2025 and 2023, so only the green-flag figure (about 23 s) is steady. The Monza pit-loss figure disagrees with the earlier project (24.6 to 26.8 s here, 21.2 s there) and neither is validated.
- The fuel effect is partly an assumption. Three seasons, no production users, no team, no scale beyond about 84,000 laps. Skill level for AWS, Snowflake, dbt and MLflow is project-scale working knowledge, not production experience.
- Built using data from the unofficial OpenF1 API, credited in the README; only aggregated tables and a small fixture are committed, not full row-level data (ADR 0018). 2026 sessions are not ingested.
- The failure-alert email path was re-checked on the current stack only as far as the publish call succeeding; receipt of the email was not confirmed.
## Authorship `[verified]`
- Solo project. The candidate set the scope and the defaults, made and approved the decisions recorded as ADRs, created and secured the AWS and Snowflake accounts, entered every credential, confirmed the alert subscription, ran the real teardown and typed its confirmation, and approved each deploy and each push.
- **Do not write that the candidate wrote every line of the code.** The repository does not record who wrote each part, so a claim of sole authorship of the code is `[unverified]`. Describe the work as the candidate's design decisions, account setup, verification and operation of the system.
- Evidence: the public repository, its CI history and the decision records in `docs/adr/`.

## Power BI semantic model and DAX `[verified]` (candidate answer 13 Nov 2026, counted in the PBIP TMDL files the same day)
- The model in `dashboard/powerbi/f1-pitwall/` has **43 DAX measures across 17 tables and 8 relationships, and no calculated columns**: every derived value is a measure, so nothing is precomputed into the import.
- Relationships (a star): four race-level tables (`mart_tyre_degradation`, `mart_pit_loss`, `mart_dq_health`, `model_by_race`) join `dim_race` on `session_key`; `dim_race`, `pit_loss_by_season` and `model_by_season_out` join `dim_season` on `season`; `mart_dq_health` joins `dim_rule` on `rule_code`. One synced season filter then serves the Tyres, Pit stops and Data quality pages (candidate statement).
- Measures the candidate can walk through: `SC Range Text` (VAR lo/hi with `CALCULATE ( MIN/MAX ( pit_loss_by_season[median_pit_loss_s] ), track_status = "SC", ALL ( dim_season ) )`, returned with `FORMAT` as "Unstable by season: -3.9 to 10.7 s"; `ALL ( dim_season )` keeps it the across-seasons range under a season selection); `Model Verdict` (reads the two interval bounds of the "LightGBM minus B1" comparison and uses `SWITCH ( TRUE (), ... )` to pick one of three sentences, so the conclusion cannot drift from the numbers); `Primary Rate` (`AVERAGE ( undercut_primary[rate] )`, shared by the matrix and a card).
- Limits: the tables are **imported from CSV exports** in a data folder (`Csv.Document ( File.Contents ( DataFolder & ... ) )`), not a live or DirectQuery connection to Snowflake; no row-level security, no scheduled refresh, no users or adoption; the report is a published PBIP project with a PDF and screenshots, no .pbix. This is the only place the candidate has used DAX (no other project, not Embin).

## Open items
- Power BI: published without a .pbix (Desktop refuses to save one); a few cosmetic fixes are pending (footer overlap, verdict panel on the model page, raw column names in tables).

---

# 08. Harvest Surprise (satellite signals and the physical economy)

**Domain:** Applied data science and geospatial analysis: remote-sensing measurement, validation against ground truth, null results reported with reasons.
**Built:** around 11 Nov 2026 (the final report is dated 2026-11-11). Personal project. Not employment, not coursework.
**Repo:** `SharlEclair/harvest-surprise` (public since 13 Nov 2026, MIT licence; one clean commit; the full history sits in a private archive repo). GitHub Actions is green on the public repo.
**Status:** research complete and packaged: an 11-stage pipeline runner, tests, a data-quality catalogue and a read-only API. **Not deployed**; there is no live link.

## Why it exists `[observation]`
- It began as a corn-yield project and widened after reading all 535 comments (337 top-level, 198 replies) under a public YouTube video about trading on satellite photos; 54 domain proposals were extracted from them. Part of it rebuilds the video's own project (oil tank fill at Cushing) more carefully. The README credits the video and its creator.
- Framing, not a result: "can free satellite data measure something real about the physical economy, and does that measurement carry information the market does not already have?"

## Results `[measured]` (from the project's final report; each stage is re-runnable)
Four signals were tested; two held up and two did not.
- **Reservoir storage from Sentinel-2 water extent**, scored leave-one-out against daily CDEC gauges: Spearman 0.886 (Shasta, 36 scenes), 0.927 (Oroville, 37) and 0.661 (Don Pedro, 33); level error cut by 50%, 62% and 15% against a mean baseline (linear RMSE 25.3, 32.9 and 24.9 ft). A screen for failed water masks (scenes under 50% of a reservoir's median area dropped) raised every score, and the report states that its earlier numbers were contaminated. Rank correlation of successive changes: 0.76, 0.71 and 0.24.
- **Water to rice acreage (California):** elasticity +0.407 (t 5.24, n 36, 1990 to 2025); +0.281 (t 4.97, n 31) when fitted on 1990 to 2020 and used out of sample; the placebo with next year's storage is +0.165 (t 1.60). End to end with no gauge (2021 to 2025): MAPE 28.6% gauge-fed and 26.7% satellite-fed, both about 80% too high in the 2022 drought. A 10,000-draw error-propagation simulation shows the elasticity attenuating by about 45% when storage is noisy.
- **Corn yield (a null):** weather improves point-in-time RMSE from 17.63 to 15.38 bu/ac; the satellite index adds nothing (15.38 to 15.38); USDA's own August forecast is 9.46. Trading the disagreement compounds +116% against +222% for buy-and-hold over 16 years and beats it in 4 of 16 years, one year carrying it. No edge.
- **Cushing oil tank fill (fails three ways):** optical signal-to-noise 0.27 (a 20 Mbbl hub-wide move shifts roof brightness 2.4% against an 8.9% noise floor); radar amplitude within-year correlation +0.026 (2022 to 2025); InSAR phase is coherent over the roofs (0.637) but shows no motion (0.0% of tanks above 5 cm) and the displacement scales with the perpendicular baseline, which is a geometric artefact. The HyP3 products are 80 m (finest 40 m), larger than a 30 to 60 m tank. The +0.628 aggregate correlation between tank brightness and EIA stocks holds between years only; within a year it averages near zero, and the report retracts its earlier "the measurement works".
- A physics feasibility filter (`resolution_filter.py`, `tank_detectability.py`) was applied to the commenters' proposals before testing them.
- Evidence: `FINAL_REPORT.md`, `research/`, `data/processed/` (every number in the report, run logs and figures), `analysis/`, `tests/`.

## Engineering `[verified]`
- Data sources named in the README: Microsoft Planetary Computer (Sentinel-1 and 2, MODIS), NASA ASF HyP3, USDA NASS Quick Stats and WASDE, US EIA, California CDEC, NASA POWER and OpenStreetMap. An H3 water-accessibility layer is queryable in DuckDB. `hsp.py` runs the stages and stops at the first failing one.
- A read-only FastAPI service with four endpoints (`/health`, `/water/{year}`, `/county/{name}`, `/reservoirs`), smoke-tested with a test client. A data dictionary and a data-quality catalogue counted per raw table.
- Tests `[measured]`: 28 passed and 4 skipped (reason not checked) on a clean export on 13 Nov 2026. The README's "27 assertions" and an older report's "21 tests" are both stale. CI installs a light requirements file; the heavy ingest stack is excluded.

## What does not work, or is not shown `[retracted if claimed]`
- Not deployed, no users, no live link.
- It is research, not a trading strategy: the corn signal showed no edge and the tank signal failed. Do not write "satellite trading", "alpha" or "profitable".
- The water-to-power link is blocked (CAISO node data); the satellite-to-economics chain is closed by error propagation (5.2% storage error to 2.1% acreage error), not by an out-of-sample run on real years; full-resolution SLC interferometry is untested; only three reservoirs; the full-sample elasticity is inflated by the 2021 to 2025 drought, so 0.281 is the figure to quote.
- The comment corpus is the video's public comment text: commenter handles are replaced by stable pseudonyms and the raw metadata dump is not published (13 Nov 2026).
- Finance-adjacent but no finance employment: do not claim trading or commodities domain experience.

## Authorship `[unverified]`
- Personal project with one author identity in the repo. How the code was produced has not been stated by the candidate, so use the project 07 wording rule: "designed, directed, reviewed and verified"; do not write "I wrote every line". Ask before drafting any authorship claim.

---

# Source index

| File | What it is |
|---|---|
| `about me/projects.md` | Summary fact sheet. Rewritten 14 Nov 2026 from this dossier; the retracted claims are removed. |
| `Desktop/Personal Projects/harvest-surprise/FINAL_REPORT.md` and `README.md` | Source for entry 08 (Harvest Surprise) |
| `hero-section/research/SITE-COPY.md` | Frozen site copy, page order, consolidated do-not-ship index |
| `hero-section/research/project-f1-notes.md` | F1 copy, traps, deployment and three.js open items |
| `hero-section/research/project-sql-notes.md` | SQL copy, fan-out correction, benchmark qualifier, defects |
| `hero-section/research/project-transit-notes.md` | Transit copy, corrections, TDI circularity, measurement limits |
| `hero-section/research/project-milp-notes.md` | MILP copy, the ML error, false resume claims |
| `hero-section/research/project-ocr-notes.md` | PowerOCR false claims, genuine strengths, code fixes |
| `hero-section/v2/ABOUT.md` | About copy, credential corrections, resume gaps |
| `hero-section/v2/CONTENT.md` | Content model, the four razors, the metric audit |
| `f1-three-test/docs/onboarding-architecture.md` | The animation's design rationale and invariants |
| `f1-three-test/docs/onboarding-contributor.md` | The animation's contributor guide and glossary |
| `hero-section/v2/SPEC.md` | The site renderer's acceptance criteria |
| `about me/experience_education.md` | Rewritten 14 Nov 2026 against the resume and the source docs. See the resolved note in the warnings section. |
| `RMIT Hackathon/README.md` | **AssignMate.** Product argument, repo status, stack summary, demo accounts |
| `RMIT Hackathon/docs/handoff/01-STATE.md` | **AssignMate: the authoritative live state.** Gates and their output, defects I-68 and I-69, environment traps (T42, T44) |
| `RMIT Hackathon/docs/05-AI-GUARDRAILS.md` | AssignMate: the policy layer spec, the verdict enum, the 53-case golden set (section 11) |
| `RMIT Hackathon/docs/04-TECH-ARCHITECTURE.md` | AssignMate: the fixed stack, the provider adapter, Drizzle, the no-vector-database decision |
| `f1-pitwall-platform` (public repo: `README.md`, `docs/ML-RESULTS.md`, `docs/DQ-CATALOGUE.md`, `docs/adr/`) | Entry 07 evidence: results, data-quality counts and decision records |