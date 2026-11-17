---
title: "Project Portfolio & Engineering Artifacts"
author: "Ashwin Pillai"
last_updated: "2026-11"
---

# Project Portfolio Summary

This is the summary fact sheet. The detailed source of truth is
[projects-detailed.md](projects-detailed.md), updated November 2026. Where this
file and the detailed dossier disagree, the dossier wins.

The four projects selected for the website rebuild are: **F1 Pitwall Platform**,
**Self-Healing SQL Agent**, **Transit Desert**, and **Harvest Surprise**. Their selected
website copy is reproduced below; the F1 Pitwall copy has been updated to match the
dossier, with the original wording recorded in the copy note. This selection supersedes
the earlier four-card order in the dossier (F1 Strategy Engine, SQL Agent, Transit Desert,
MILP). The current mockup page still shows the older four (F1 Strategy Engine, SQL Agent,
PowerOCR, Transit Desert); the website rebuild will use this selection.

---

# The website four

## 1. F1 Pitwall Platform

> Formula 1 produces huge amounts of live timing data, and some of it is wrong. I built a
> system that collects it automatically every week, runs 23 checks on it, and accounts for
> all 84,140 laps from 88 race sessions: 84,122 clean laps and 18 quarantined, with none
> unaccounted for. It also tested whether a machine-learning model could predict lap times
> better than a simple formula. On the first season it could not; across three seasons it
> made a small but detectable improvement over the linear baseline. I reported both.

**Verified detail**

* Built 10-11 Nov 2026. Solo project, not employment or coursework. Repo:
  `SharlEclair/f1-pitwall-platform`.
* Cloud path: OpenF1 historical API, Lambda ingest on an EventBridge weekly schedule,
  immutable S3 raw objects named by content hash, a second Lambda validating with Polars
  against 23 coded rules, S3 silver and quarantine Parquet, an SNS summary email, a
  Snowflake internal stage, dbt staging/intermediate/eight marts, and a DuckDB fixture for
  CI. One AWS SAM template; GitHub Actions runs lint, 112 Python tests, offline SAM
  validation, and a dbt build with 8 unit tests.
* Data quality: 88 sessions (70 races and 18 sprints). Laps: 84,140 raw = 84,122 silver +
  18 quarantined. Stints: 4,472 raw = 4,433 silver + 39 quarantined. 37,778 position
  events and 1,812,781 interval rows kept. Every session reconciles, and the counts match
  Snowflake on all 9 loaded tables. The 18 quarantined laps and 39 quarantined stints are
  accounted for rather than loaded into silver.
* Reporting: a seven-page Power BI report on the three-season data, 43 DAX measures across
  17 tables and 8 relationships, imported from CSV exports (not a live Snowflake
  connection), plus a deployed Streamlit app.
* ML evaluation: 66 held-out races, dry running only, fixed hyperparameters,
  leave-one-race-out. Mean absolute error: 1.624 s persistence, 1.085 s linear physics
  baseline, 0.935 s LightGBM. LightGBM minus the linear baseline is -0.150 s (95% interval
  -0.265 to -0.047), better in 47 of 66 races. On the first season alone the comparison
  showed no detectable difference (-0.058 s, interval -0.166 to +0.043).
* **Copy note:** the copy supplied on 14 Nov 2026 said "It couldn't" and "none lost or
  altered". It has been updated here to the dossier: the first season is null, the pooled
  66-race result is a small gain, and 18 laps and 39 stints are quarantined, so "accounted
  for" is the accurate wording. This is the corrected wording for the website copy.
* Limits: no GitHub OIDC deploy (the account policy denies an OIDC provider); the
  Snowflake storage integration was built but never worked, so loads use an internal
  stage; pit loss is unstable under Safety Car; project-scale working knowledge, not
  production experience; 2026 sessions are not ingested.
* Authorship: solo project. The repository does not record who wrote each line, so
  describe the design decisions, account setup, verification, and operation of the
  system. Do not claim every line of code.

## 2. Self-Healing SQL Agent

> Most people can’t ask a database a question without knowing a query language. This tool
> lets you ask in plain English: an AI writes the database query, safety checks review it
> before it runs, and if it fails, the tool diagnoses the error and fixes it itself. On a
> 10-question test it went from 9 correct to all 10 after fixing its own mistakes, and 45
> automated tests keep it honest.

**Verified detail**

* Natural-language-to-SQL analyst over the Home Credit Default Risk dataset. Repo:
  `SharlEclair/home-credit-agent`.
* Benchmark: 10 handcrafted queries. 9/10 zero-shot, 10/10 with the self-healing loop.
  Exactly one query was healed: `query_04`, an omitted `SK_ID_CURR` in a Top-N listing,
  caught by validator rule 1/5. 45 unit and integration tests pass.
* Safety: a `sqlglot` AST whitelist (single statement, `SELECT`/`UNION` only, three allowed
  tables) plus DuckDB opened `read_only=True`. That guarantees tables cannot be dropped or
  altered. It does not guarantee "absolute safety": there is no DuckDB memory limit and no
  statement timeout, and a `read_csv`/`read_parquet` bypass could read local files.
* The fan-out rule is a pre-emptive constraint, not a healed bug. The anti-fan-out rule was
  present in the initial commit in the generator, validator, and few-shot seeds. The agent
  never generated an un-aggregated fan-out in the benchmark. The genuine healed bug was a
  `LEFT JOIN` that should have been `INNER`, caught by validator rule 3 and fixed on retry 1.
* Do not say the agent healed Cartesian fan-out bugs, and do not say "absolute safety".

## 3. Transit Desert

> Some parts of a city are hard to get out of without a car. I mapped a city into more than
> 10,000 small squares and measured how long it takes to reach places from each one. Adding
> 177 planned metro stations would cut travel time in about one square in five (20.2%). The
> map measures land area, not number of people, and the page says so.

**Verified detail**

* Mumbai quantized into 10,891 Uber H3 cells at **Res-09**. Raw GTFS timetables routed
  over OpenStreetMap network data through **Conveyal R5 / FastRaptor**; no routing
  algorithm is coded in the repo.
* Four destinations only: BKC, KEM Hospital, IIT Bombay, Palladium. Cutoff 90 min, max
  walking 25 min, max 2 public-transport transfers. One departure time: Tuesday
  2026-09-08, 08:45. Not a peak average.
* Finding: adding 177 planned stations reduces travel time in 2,204 cells, 20.2% of the
  10,891-cell grid. For the 360 informal-settlement cells (V = 1.0), mean TDI moves 0.5523
  to 0.5493, a 0.5% change; 128 of those 360 (35.6%) improve. Baseline gap: slum cells
  0.55 TDI against 0.16 for the rest of the city, a 3.4x difference.
* TDI is circular. Vulnerability is binary (1.0 for slum intersection, 0.2 otherwise), so
  formal-area TDI is capped at 0.20 while the severe-desert threshold is 0.50. All 205
  "severe desert" cells are slums by construction. Do not ship "205 severe transit
  deserts."
* Measurement limits: no population data (area, not people); only four destinations;
  synthetic metro GTFS (constant 35 km/h, fixed headways, zero congestion); one departure
  time; unclipped bounding box (46.28% of cells reach no POI within 90 min, but the box
  includes sea, creek, and national park land).
* Retracted: "H3 Res-08" (actual Res-09), "Dijkstra/A*" (actual Conveyal R5), "3.8 million
  residents" (no population calculation), "dynamic isochrone engine" (no isochrone layer),
  "trains run empty in wealthy suburbs" (contradicted by the data; Western Suburbs gained
  the most at 31.0%).

## 4. Harvest Surprise

> Can free satellite photos tell us how the economy is doing? I tested it. Satellite images
> of three California reservoirs tracked their real water levels closely (correlation 0.66
> to 0.93 against gauge readings). Those water levels also helped predict how much rice
> farmers plant, when tested on years the model hadn’t seen. Two of my four ideas worked
> and two didn’t, and I report the failures too.

**Verified detail**

* Personal research project, final report dated 11 Nov 2026. Repo:
  `SharlEclair/harvest-surprise`. Not deployed, no users, no live link.
* Reservoir storage from Sentinel-2 water extent, scored leave-one-out against daily CDEC
  gauges: Spearman 0.886 (Shasta, 36 scenes), 0.927 (Oroville, 37), and 0.661 (Don Pedro,
  33). Level error cut by 50%, 62%, and 15% against a mean baseline.
* Water to California rice acreage: elasticity +0.407 on the full sample (t 5.24, n 36,
  1990-2025); +0.281 (t 4.97, n 31) when fitted on 1990-2020 and used out of sample. The
  placebo with next year's storage is +0.165 (t 1.60). The full-sample figure is inflated
  by the 2021-2025 drought, so quote 0.281, not 0.407.
* Two of four signals held: reservoir storage and the water-to-rice relationship. Corn
  yield was a null (the satellite index added nothing to weather; no trading edge). Cushing
  oil tank fill failed three ways: optical signal-to-noise 0.27, radar amplitude
  within-year correlation +0.026, and InSAR coherence over roofs with no motion. The
  earlier "the measurement works" claim is retracted.
* Engineering: an 11-stage pipeline, a read-only FastAPI service with four endpoints, a
  data dictionary, a data-quality catalogue, and 28 passing tests plus 4 skipped on a clean
  export. Not deployed.
* Do not call it a trading strategy, alpha, or profitable. It is research, not finance
  employment. Only three reservoirs.
* Authorship is unverified. Treat it as the candidate's project, but use "designed,
  directed, reviewed, and verified" rather than "I wrote every line" unless the candidate
  confirms otherwise.

---

# Other verified projects

## F1 Strategy Engine

* **Domain:** Quantitative decision modeling, discrete-event simulation, sports analytics.
* **Core question:** Could Car A beat McLaren's Oscar Piastri by executing a dynamically
  optimized undercut at the 2024 Italian Grand Prix (Monza)?
* **Architecture:** No Python loops and no Pandas. A native Polars columnar execution graph
  evaluates 10,000 permutations (530,000 matrix rows) in about 184-200 ms. Compute-heavy
  MCMC and survival fitting run offline; the Streamlit layer consumes precomputed parameter
  contracts for sub-millisecond slider response. The 103% stint-median pace filter purges
  aerodynamic wake. Net pit-loss delta is corrected at 21.199 s normal versus 11.199 s
  under Safety Car.
* **Statistics:** Hierarchical Beta-Binomial MCMC (PyMC, 0 divergences across 4k draws);
  Safety Car posterior Beta(5.10, 56.16); right-censored Weibull (lifelines, lambda 85.45,
  rho 0.94); Medium tyre degradation cliff at Lap 57.8.
* **Result:** 53.77% win probability for the Lap 15 undercut; median finish delta +5.91 s;
  19/19 pytest suite passing.
* **Honest framing:** This is a coin toss. 53.77% moves more on which variables are included
  than on the race itself. There is no baseline for 53.77%, so it cannot be a headline
  metric without a comparison. The app runs locally; only the source is on GitHub.
* **Terminology:** call it an "offline-compute contract", never "air-gapped". Air-gapped
  means physically disconnected from networks; this is a precomputed offline artifact.

## MILP Roster Optimizer

* **Domain:** Exact combinatorial optimization and analytical Bayesian inference for VCT
  fantasy esports.
* **What it is:** a Daily Fantasy Sports roster optimizer for the Valorant Champions Tour,
  not an "operational resource allocation engine."
* **Solver:** `scipy.optimize.milp` / HiGHS, not PuLP. The captaincy rule doubles the
  decision space to 2N binary variables and keeps the objective linear. Six constraint
  classes: exact roster of 11, one IGL, IGL drafted, budget cap, per-role bounds 2-5, max
  two players per pro team.
* **Result:** mean solve 8.76 ms on a 28-player pool (min 6.77, max 11.52), MIP gap 0.0,
  exact. Two gameweeks evaluated: the model roster scored 140.0 points against a hindsight
  optimum of 199.0. No multi-gameweek backtest and no projection validation exist.
* **Projection layer:** analytical Bayesian inference, not machine learning. Conjugate
  Gaussian-Gaussian updating, exponential time decay with a 138.6-day half-life, per-role
  z-scores, a bounded tanh Elo multiplier, Kish effective sample size, and a variance
  floor. Closed-form and hand-weighted.
* **The ML that does exist:** LightGBM and CatBoost match-winner classifiers in `ml/`, with
  Optuna tuning. LightGBM ROC-AUC 0.6289 against a logistic-regression baseline of 0.6530;
  the supervised model loses to the baseline and is not wired into the optimizer.
* **Retracted:** PuLP, Monte Carlo simulation, "machine learning" for the projections,
  "70.4% efficiency ratio", "1,900+ records", "500 Monte Carlo iterations", "field average
  107", and "operational resource allocation engine."

## AssignMate

* **Domain:** Applied agentic AI, AI policy and guardrail engineering, full-stack TypeScript.
* **What it is:** an assignment workspace for students and tutors where the assignment, not
  a chat window, is the central object. A tutor uploads the brief; ingestion proposes
  structure; the tutor approves it; the student works through the brief, checklist, a
  constrained AI coach, private tutor questions, and anonymous peer discussion.
* **Guardrail:** a pure, network-free module at `src/lib/guardrail/` that runs deterministic
  checks before any model call. Five verdicts with fixed severity order: REFUSE >
  ESCALATE_TO_TUTOR > CLARIFY > ALLOW_WITH_SCOPE > ALLOW. Failure, malformed output, or
  uncertainty resolves to REFUSE. Refusal text is generated from a template plus a cited
  rule, not by a model. The guardrail cannot be widened by conversation, upload, or
  student-supplied text.
* **Architecture:** one Next.js App Router deployable; Postgres holds all state including
  full-text `tsvector` retrieval; no vector database (rejected by decision); one provider
  adapter and a CI import gate; Gemini default, DeepSeek alternative, offline mock.
* **Golden set:** 53 cases, no skip list. Verdicts: 30 REFUSE, 15 ALLOW, 2
  ALLOW_WITH_SCOPE, 3 CLARIFY, 3 ESCALATE_TO_TUTOR. 765 tests across 49 files; four live
  HTTP acceptance runs (verify-student 18/18, verify-review 20/20, verify-analytics 13/13,
  verify-discussion 20/20).
* **Limits:** team hackathon project, not solo. No per-member authorship split was located;
  do not present it as individual work. Not deployed: local commits only, no live link. The
  "53/53 per suite" number is a specification and shipped-run statement, not a per-suite
  total from the last recorded run.

## Retail Supplier Scorecard (Microsoft stack exercise)

* **Domain:** Self-service reporting and automation on the Microsoft stack.
* **What it is:** a solo exercise on the public Kaggle Superstore dataset (9,800 rows, 18
  columns, 2015-2018), built 10 Nov 2026. Not employment, coursework, or a job simulation.
* **Stack:** Power Query (four yearly CSVs, `AllSales`, `MonthlySales`, `SubCatSummary`),
  Excel (`tblScorecard`, SUMIFS, EDATE, MoM %, conditional formatting, PivotChart), Power
  Automate (scheduled weekly flow emailing an HTML table), Copilot Studio (draft agent
  "Supplier Insights Assistant").
* **Result:** 9 of 17 sub-categories flagged Review; a 17-row scorecard; the draft agent
  answered 4/4 test questions correctly, including refusing an out-of-scope question.
* **Limits:** US sample data, not a retail employer's data; no repo or README; the flow
  read a static OneDrive snapshot and only manual test runs were observed; the agent was
  not published and has no users. Copilot in Excel and Copilot in Power Automate were not
  used. Skill level is exposure.

---

# Index-row and supporting projects

## PowerOCR (index row, not on the website)

* **What is real:** the clipboard race guard (`OcrPipelineManager.cs`), the heap-corruption
  fix (0xC0000374, commit `09c2bf55bf`), multi-monitor DPI math, the Undo toast, and the
  `SetWindowSubclass` hotkey work.
* **Retracted:** "air-gapped by default" (the app POSTs to `api.openai.com` even with an
  empty key), "four hotkey modes: A, V, S, T" (only S and T exist, and only in the legacy
  module), "0 ms / 1.2 s" (unmeasured), "Gemini Vision" (the live app uses
  `api.openai.com`/`gpt-4o-mini`, and the image path is not wired), and the
  `WS_EX_NOACTIVATE` transparent-HUD claim (an unconnected prototype; the overlay is 65%
  black).
* **Repository note:** `PowerOCR/` is the active WinUI 3 app; `src/modules/PowerOCR/` is a
  legacy PowerToys module with dead code. Most old portfolio claims came from the legacy
  module. Do not use those claims in site copy.

## Transit Patronage Forecasting

* 8-year transit patronage forecasting model using ARIMA/SARIMA/GARCH with 2.84% MAPE.
* Status: unverified. No repo, dataset, code, or date range was located. Keep as a
  one-line index entry with the MAPE and no architectural claim.

## Knowledge Extraction Pipeline

* Status: unverified. No description, repo, or result was located.
* Likely the same work as the Automated Video-to-Obsidian Pipeline or the Cortex/Second
  Brain. Confirm which, and use one name in both places.

## F1 x Currents (`f1-three-test`)

* Real-time graphics and shader engineering: about 1,650 streamlines in one draw call.
* Supporting artifact only; not a portfolio project.

## Portfolio site renderer (`hero-section` v2)

* Bare WebGL2, type engineering, 1,400-quad field, no framebuffer or bloom.
* Supporting artifact; not a portfolio project.

---

# Secondary and exploratory projects

These are recorded, not verified against a repository in this workspace. Treat the
technical detail as unconfirmed.

* **VCT Prediction Engine:** probably the same repo as the MILP Roster Optimizer
  (`vct-prediction-model`). Its match classifier is LightGBM/CatBoost; LightGBM ROC-AUC
  0.6289 against a logistic baseline of 0.6530, so the model loses to the baseline. Confirm
  whether it is a separate deliverable before listing it separately.
* **The Cortex / Second Brain:** local markdown notes in a vector space, cosine-similarity
  retrieval, CLI integration. No repo or retrieval evaluation located. The "surfaces
  latent connections" claim is an observation, not a measured result.
* **Automated Video-to-Obsidian Pipeline:** pull media by URL, local transcription, emit
  tagged markdown into an Obsidian vault. No repo or measurement located. Possibly the
  same work as the Knowledge Extraction Pipeline.
* **EMROS Guest Privacy and Service System:** client work from Embin, so it belongs under
  Experience, not the project grid. Wall-mounted touch panels, guest privacy, room states,
  hospitality services, Jinja2 templates. Technical claims unverified.

---

# Do not use

The detailed dossier records the full corrections ledger. The ones most likely to be
repeated in site copy or a resume:

| Claim | Project | Correction |
|---|---|---|
| "Air-gap architecture" | F1 Strategy Engine | Offline-compute contract, not physical network isolation |
| "Deployed to GitHub" | F1 Strategy Engine | Only the source is public; the app runs locally |
| "100% accuracy" | SQL Agent | 9/10 zero-shot, 10/10 with healing, on a 10-query benchmark |
| "Healed Cartesian fan-out bugs" | SQL Agent | The anti-fan-out rule was pre-emptive in the initial commit |
| "Absolute safety" | SQL Agent | No memory limit, no statement timeout, `read_csv` bypass |
| "0 ms / 1.2 s" | PowerOCR | Unmeasured; no timing instrumentation exists |
| "Four hotkey modes" | PowerOCR | Only S and T exist, in the legacy module |
| "H3 Res-08" | Transit Desert | Code uses Res-09, 10,891 cells |
| "Dijkstra/A*" | Transit Desert | Routing is Conveyal R5 / FastRaptor |
| "3.8 million residents" | Transit Desert | No population calculation exists |
| "205 severe transit deserts" | Transit Desert | Circular: formal areas cap at TDI 0.20 |
| "PuLP / Monte Carlo / machine learning" | MILP Roster Optimizer | scipy HiGHS; analytical Bayesian projections |
| "53/53 per suite" | AssignMate | 53 cases execute with no skip list; per-suite totals are not quoted |
| "Deployed" | AssignMate | Local commits only; no hosted deployment |
| "Trading / alpha / profitable" | Harvest Surprise | Research only; corn null and tank signal failed |
| "AWS certified" | Education | Course-completion certificates, not exams |
| "Databricks certified" | Education | Introductory accreditations, not the Data Engineer Associate exam |
