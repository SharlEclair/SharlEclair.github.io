---
title: "Work Experience, Education & Professional Development"
author: "Ashwin Pillai"
last_updated: "2026-11"
---

# Education

## Master of Data Science

* **Institution:** RMIT University, Melbourne, VIC
* **Dates:** Mar 2025 to Dec 2026 (final year at time of writing; the course completes in December 2026)
* **Result:** Not recorded. No GPA or classification is stated anywhere in the source material.
* **Scholarship:** RMIT Future Leaders Scholarship, a 20% tuition reduction across the program. The name "RMIT Academic Merit Scholarship" is wrong and must not be used.
* **Relevant coursework:** Applied Analytics, Time Series Analysis, Database Concepts, Data Wrangling
* **Core competencies:** Advanced Python and R, machine learning pipelines, statistical sampling, regression analysis, DBSCAN clustering, classification models, generative AI workflows.

## Bachelor of Engineering

* **Institution:** St. Francis Institute of Technology, Mumbai, MH, India
* **Dates:** Jan 2020 to May 2024
* **Major:** Computer Science
* **Honours:** Artificial Intelligence and Machine Learning
* **Result:** Cumulative GPA 8.48 / 10.0

### BEng mini-projects and labs

* **Fake News Detection** (Second Year, Semester IV, AY 2021-22; four-person coursework). Binary fake/real news classification on a crowdsourced dataset supplemented by scraped reliable sources. Random Forest on TF-IDF features; Logistic Regression and SVM on Doc2Vec features; parameter tuning; the three models compared with confusion matrices. Word as co-built coursework, not solo work.
* **Fatigue Recognition System** (Third Year mini-project; four-person coursework). Facial landmarks for eye and mouth extracted from video, features standardised, train/test split, classifier trained, face calibration, use-case and activity diagrams. The classifier is not readable in the report, so no model should be named. Word as co-built coursework.
* **Applied Data Science anomaly-detection lab** (Semester 8, Experiment 8). Boston Housing data (506 rows) plus synthetic blobs; IQR rule, DBSCAN, Isolation Forest, Local Outlier Factor, One-Class SVM and quantile thresholding. Coursework on a standard teaching dataset and synthetic data: no real fraud data and no evaluation against labelled anomalies.

Neither mini-project supports a deep-learning claim. Doc2Vec is an embedding, not a trained deep network. Both reports name the team but not who wrote which part.

## Certifications and professional development

These are evidence, not degrees or employment. The claim limits matter.

| Credential | Issuer | Date | Claim limit |
|---|---|---|---|
| AI Fluency: Framework and Foundations; Building with the Claude API; Claude Code 101; Claude Code in Action; Introduction to Model Context Protocol | Claude Academy (Anthropic) | 10 Nov 2026 | Course-completion badges with public verify links. Not employment or accreditation. |
| Academy Accreditation: Databricks Fundamentals; AI Agent Fundamentals | Databricks Academy | 3 Sep 2026 | Introductory accreditations, not the Databricks Certified Data Engineer Associate exam. No project uses Databricks or Delta. |
| AWS Cloud Practitioner Essentials; Data Engineering on AWS - Foundations | AWS Training & Certification | 11-12 Nov 2026 | Course-completion certificates, not exams. Not "AWS certified". The second was completed 8 of 9 lessons and had no hands-on lab. |
| Data Analytics; Data Science; Data Science; GenAI Powered Data Analytics; Introduction to Data Science | Deloitte, British Airways, BCG X, Tata, Commonwealth Bank, issued by Forage | 8-10 Nov 2026 | Job simulations, not employment or accredited qualifications. Word as "completed ... job simulation". |
| AI Engineer for Data Scientists Associate; Data Engineer Associate; Data Engineer | DataCamp | 8 Nov 2026 | Entry-level skills certifications. Word as "DataCamp Data Engineer certification (Nov 2026)". The pages name no tools, so claim no tool from them. |

**AWS exam lab (13 Nov 2026):** hands-on work in a live AWS-provisioned account against a Glue Data Catalog database `streaming_db`. In Athena: an `ALTER TABLE ... ADD COLUMNS` to repair schema drift (4.0 s) and a `CREATE OR REPLACE VIEW monthly_executive_summary` rolling weekly revenue up by month (1.0 s). In Glue: browsed the Data Catalog only; no job, no crawler, no database created. The exam outcome and any credential are not stated, so no credential is claimed. Claim limit: "hands-on Athena queries and DDL in an AWS exam lab"; never "Athena experience at work", "Glue", or "AWS certified".

---

# Professional Experience

## Software Engineer @ Spectrum Tuition (Capstone Project)

* **Dates:** Jul 2026 to Present
* **Location:** Melbourne, VIC
* **Team:** Five-student RMIT capstone team (project P000305DS); industrial supervisor at Spectrum Tuition, academic supervisor at RMIT
* **Ownership:** Product and frontend workstream and the integration branch; single largest contributor, 487 of the repository's 636 commits (77%), 1,082 files changed across 15 branches
* **Nature of engagement:** University capstone delivered for Spectrum Tuition as industry partner. Weekly individual contribution logs and an AI-use acknowledgement were assessment artefacts.

**Title note, 13 Nov 2026:** "AI & Data Lead" and "Frontend Lead" are not official titles. The verified description is "Software Engineer" on the capstone, with product and frontend ownership among five peers. Approved resume variants include Data Engineer (Human-in-the-Loop AI Pipeline), Software Engineer (Data Quality and Validation Systems), Full-Stack Engineer (Testing and Performance), Data Quality and Performance Engineer, and Software Engineer (Industry Project). Never use Lead, Architect, or Senior as a title.

### What I did

* Designed and built the Python/FastAPI engine that ingests `.docx` coursebooks through OpenXML, extracts a structured AST, and validates it against a 137-code check engine covering band sequencing, worked-example/Have-a-Go pairing, NAPLAN keys, SymPy-verified maths, and print-spec conformance. 80 REST endpoints across 87 modules; three run types: audit an AI draft, verify a master coursebook, and compile a book from a tag-sheet `.xlsx`.
* Built the human review gate: every finding anchored to its page and box; per-item accept/edit/AI-fix/dismiss decisions recorded with who and when; group actions that cannot sign off wording or maths without an opened preview; server-persisted undo; dry-run exact-change previews; per-book correction sheets.
* Shipped the review product surface: a server-saved Book Studio with drag reordering and a live page budget, a page filmstrip with finding dots and before/after view, a coverage heatmap that filters the review, run progress over server-sent events with reconnect and fallback, reusable "memory" rules, and AI suggest-an-edit plus picture redraw at the gate.
* Built the white-labelling layer for partner books (26 commits): versioned brand kits with a live-preview editor, a kit minted from a dropped document, brand tags and named picture frames, brand checks at the review gate, and application to built books with the front cover restricted to full books.
* Established the frontend design system and accessibility baseline: design tokens with an automated contrast check, shared primitives, axe and screenshot design lint, keyboard shortcuts across the review loop (J previous, K next, D dismiss), 44 px touch targets, reduced-motion handling, and layouts verified from 320 px to 1920 px.
* Rendered legacy Word maths and diagrams in the browser by writing WMF and EMF vector parsers and an MTEF (MathType) transpiler to SVG and LaTeX, with in-memory asset resolution.
* Ran a measurement programme on the checks themselves: two independent labellers plus an adjudicator over 3,160 stored findings from six real tutor books, then 21 code changes in seven measured iterations, each with a regression test.
* Cut dashboard load time by reshaping the data path: a stored per-run summary, partial reads of only the fields a read uses, paged review, and one shared run list polled only while a run works.
* Hardened the trust boundary: same-origin proxy behind a strict CSP, httpOnly cookie sessions, Supabase removed from the browser, RBAC, a 250 MB upload guard with package preflight, and engineering detail filtered out of reviewer-facing payloads.
* Designed and ran the AI-stage performance programme: a 2,604-call benchmark against a tracked spend ledger, sweeping worker concurrency (w = 1, 2, 4, 8, 16), batch size, and render DPI; six candidate models on latency, cost per 10k items, JSON validity, defect recall, and SymPy pass rate. Concurrency alone took a Year 4 tag-sheet build from 389.9 s to 34.2 s (11.4x) and a Year 8 master audit from 315.6 s to 38.4 s (8.2x).
* Set the operating point from measurement: w = 8 (w = 16 added under 1.15x and triggered 429s under concurrent audits), batch 60 (batch 120 lost 64% of defect recall through attention dilution), 100 DPI (72 DPI produced false positives on clean pages; 150 DPI cost 56% more latency for zero recall gain). Proved order equivalence (0 output mutations) and fault isolation (0 run crashes) under injected batch failures.
* Introduced multi-provider LLM routing (Gemini vision primary; OpenAI/Anthropic fallback with per-provider backoff) and 8-way parallel stage execution, with per-stage model and worker overrides.
* Directed the adversarial audit programme that gated release: an independent end-to-end QA/UX audit with six area auditors across 12 runs (62 issues logged: 1 blocker, 17 major, 36 minor), a precision audit of the checks, a load-performance audit, and a read-only branch verification. Fixes include 63 phantom-page 404s, the all-caps cover check, and the reviewer-payload diagnostic leak.
* Shipped a release-hardening branch and stood up staging: tracked tree cut from 1,012 to 970 files, 45 scattered documents consolidated into 14 canonical ones with an index, dead exports and an unreachable page removed, and 13 Supabase migrations plus three private storage buckets applied and verified with a persisted end-to-end run.

### Tools and methods

Python (FastAPI, Pydantic, SymPy, python-docx, lxml), Next.js 16.3 / React 19 / TypeScript / Tailwind 4 / Zustand, PostgreSQL (Supabase, server-side only), Google Gemini 3.5 Flash Lite (text and vision), OpenAI/Anthropic fallback routing, LibreOffice headless PDF, pytest / Vitest / Playwright, Railway, Git.

### Scale and data

Six real Spectrum tutor books (Grade 4-9, maths and English), 3,160 analysed findings, 1,703 verified pages; 137 check codes; 80 REST endpoints across 87 modules; 23 dashboard routes; 2,604 benchmark API calls; 1,082 files changed across 487 commits.

### Measurable outcomes

* Check false positives down 68% (2,740 to 886) across six books; the held-out book went from 345 to 3.
* Run-list load 7.4-11.5 s to 0.83 s (about 90%); per-run reads about 2.4 s to 0.5-1.1 s; whole review from four requests to one.
* Eliminated a 16.5 MB database read per list call that returned 78 KB (0.47% useful).
* Release branch: tracked files 1,012 to 970 and documentation 45 to 14 files.
* Test suite at release: 857 frontend tests across 123 files and 1,424 backend tests.
* AI-stage turnaround 389.9 s to 34.2 s (11.4x) on a Year 4 tag sheet; 315.6 s to 38.4 s (8.2x) on a Year 8 master audit; per-stage speedups 7.2x (`visuals_detect`), 6.9x (`language_check`), 6.6x (`content_write`), 4.3x (`naplan_keys`).
* Audit budget held: 2,604 calls for US$0.28 of a US$9 OpenRouter cap (3.1%) and US$1.70 of a ~US$3.20 Google cap (53.2%), with a running spend ledger written from provider usage metadata.

### Validation and limits

Every figure is reproducible from the repository. The precision audit records the frozen sample, labelling rubric, inter-labeller agreement, and per-iteration counts; the load audit records before/after client timings at a stated commit; the release figures and test counts are measured on `release/ashwin-2026-11` (`7bc0c05`); the benchmark figures come from the concurrency and model sweep report and its raw telemetry. The sweep was run by an agent against a brief I wrote: I set the budget caps, metric definitions, and branch discipline, and verified the results. The earlier "60% parsing time", "98% accuracy", and "AWS deployment" figures appear in no artefact and have been removed.

## Data Analytics Engineer @ Embin Technologies

* **Dates:** Dec 2023 to Apr 2024 (5 months)
* **Location:** Mumbai, MH, India
* **Team and ownership:** Not recorded. Whether the role was sole, team member, or lead is unknown.

### What I did

* Engineered automated Python (Pandas) ETL pipelines to ingest, clean, and standardize time-series IoT sensor data.
* Conducted exploratory data analysis to isolate IoT sensor calibration drift, reducing device-level data errors by 25%.
* Designed and deployed interactive Power BI dashboards with multi-level drill-downs.
* Conducted walkthroughs of those dashboards for technical and non-technical operational managers.
* Modeled facility occupancy trends and peak-demand patterns to generate space-utilization insights, enabling leadership to optimize physical space planning and resource allocation.

### Tools and scale

Python (Pandas); Power BI (DAX, data modeling, multi-level drill-downs); ETL. SQL is claimed in the resume's skills section, but no SQL is described in this role's bullets. The role covered 40+ commercial, corporate, and retail facilities and more than 50,000 records processed daily.

### Measurable outcomes and caveats

Manual reporting time reduced by 40%; device-level data errors reduced by 25%. Neither figure has a recorded measurement method, baseline, or denominator. Keep them as reported but do not present them as audited results.

### Embin client work: EMROS Guest Privacy and Service System

Client UI work from the Embin period: wall-mounted touch-panel interfaces for guest privacy, room states, and hospitality services, with front-end architecture in Jinja2 HTML templates and high-fidelity product rendering mockups. EMROS belongs under Experience, beside the role that produced it, not in the project grid. The technical claims are unverified.

---

# Leadership and community

* **Head of Graphics, CODEX** (Jul 2022 to Apr 2023): led a five-member design and media team producing technical data presentations and visual assets, driving engagement across 400+ participants; mentored junior team members and coordinated event logistics for the annual flagship coding competition.
* **Graphics Executive, CODEX** (Jul 2021 to Apr 2022): designed promotional infographics and digital reporting media, increasing engagement by 30%. The 30% figure has no recorded baseline or measurement method.
* **Volunteer, Wattle Volunteers** (Mar 2026 to Apr 2026): collaborated in teams on bushland regeneration and environmental conservation across Melbourne reserves.

---

# Technical skills

**Languages:** Python, R, SQL, JavaScript, HTML/CSS.

**Python libraries:** Pandas, NumPy, Scikit-Learn, PyTorch, PyMC, Polars, SciPy.

**SQL:** PostgreSQL, MySQL, DuckDB.

**BI and visualisation:** Power BI (DAX, data modeling, multi-level drill-downs; DAX evidence is project 07 only: 43 measures, 17 tables, 8 relationships, imported from CSV exports), Tableau, Streamlit, Matplotlib, data storytelling.

**ML and AI:** Scikit-learn, XGBoost, LightGBM, CatBoost, Optuna, SHAP, time series (ARIMA/SARIMA/GARCH), generative AI (RAG, Gemini, Claude), ChromaDB, LangChain.

**Microsoft stack (exposure only, sample-data exercise 10 Nov 2026):** Power Query, Excel (PivotTable/PivotChart, SUMIFS, EDATE, Tables), Power Automate (scheduled flow), Copilot Studio (draft agent, trial). Not claimable: Copilot in Excel, Copilot in Power Automate.

**Data engineering and cloud:** ETL pipeline automation; AWS (S3, Lambda, EventBridge, SNS, IAM, SAM from project 07; EC2 and ECS only from group coursework; Athena queries and DDL only from one exam lab). No Glue jobs or crawlers. PyArrow/Parquet, PySpark (university coursework, local mode, Oct 2023), FastAPI, Docker, Redis, Celery, n8n (legacy replacement context only, not built), Git.

**Geospatial and research methods (project 08):** Sentinel-1/2 and MODIS via Planetary Computer, H3 grids and DuckDB, leave-one-out validation against gauges, elasticity regression with placebo and price controls, error-propagation simulation, null results reported with reasons, read-only FastAPI. Not claimable: trading or commodities experience, a deployed service, or a profitable signal.

**Anomaly detection (coursework lab):** IQR rule, DBSCAN, Isolation Forest, Local Outlier Factor, One-Class SVM, score thresholding. Not claimable: anomaly or fraud detection on real data, labelled-anomaly evaluation, or a deployed detector.

**Data platform (project 07):** AWS deployed and operated with SAM/CloudFormation (Lambda, S3, EventBridge, SNS, IAM), Snowflake (key-pair auth, internal-stage loads, resource monitors), dbt Core (dbt-snowflake and dbt-duckdb, unit tests), MLflow, GitHub Actions CI, a 23-rule data-quality engine with quarantine and reconciliation, leave-one-race-out model evaluation. Not claimable: GitHub OIDC deploys, S3 external-stage loads into Snowflake, or production experience.

---

# Caveats and open items

1. **Master's result is absent.** No GPA or classification. Do not estimate one.
2. **Master's end date is Dec 2026.** Do not present the degree as completed before then.
3. **Spectrum title.** "AI & Data Lead" is not an official title and should not be used as one. The work is a five-person capstone with product and frontend ownership, not a lead/architect/senior appointment.
4. **Spectrum capstone link.** It may be the Master's capstone. If so, link it from Education as well as Experience.
5. **Embin ownership is not recorded.** Do not infer sole ownership or team leadership.
6. **Embin figures lack method.** The 40% and 25% figures have no stated baseline or measurement approach.
7. **CODEX 30% figure lacks method.** Keep it as reported, not as an audited result.
8. **Private networking notes removed.** Personal-networking notes, named contacts, and interview-event notes must never reach a published page. They have been removed from this file.
