# Opportunity Agent Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user has approved the design and instructed us to build it; proceed inline without another approval round.

**Goal:** Deliver a runnable personal n8n application assistant with discovery, profile-based preparation, tracking, and review-before-submission browser autofill.

**Architecture:** A Python standard-library companion service owns SQLite data and serves a local dashboard. Three n8n workflows call its authenticated API. A Manifest V3 browser extension previews and fills selected native controls from a chosen application pack.

**Tech Stack:** Python 3.11+, SQLite, HTML/CSS/JavaScript, Chrome/Edge Manifest V3, n8n 3.1-compatible built-in HTTP/webhook/schedule nodes, unittest and node:test.

**Spec:** ../../../opportunity-agent-design.txt (delivered alongside this source directory; copy under docs for portability).

## Global Constraints

- The user reviews and submits every application; the helper never clicks Submit.
- Keep personal data local by default and provider keys out of workflows and browser pages.
- Missing personal facts remain missing; unknown eligibility is visible rather than rejection.
- Support ordinary native form controls and report unsupported controls explicitly.
- Discovery must distinguish source failure, missing configuration, and zero results.
- All third-party AI and paid search are disabled until configured by the user.
- No existing repository is present; deliver self-contained source without creating a Git worktree.

## Review Focus

- Similar or duplicate form labels: ambiguous fields stay untouched and appear in preview.
- Expired, timezone-free, and malformed deadlines: record uncertainty and never invent a timezone.
- Provider failures and hostile source URLs: bound requests and reject private-network destinations.
- A previously submitted application: preparation and autofill cannot silently reset its status.
- An empty profile or unavailable AI: display an actionable state and preserve missing answers.

## Files

- `agent/server.py`: HTTP API, authentication, static files, uploads, download responses.
- `agent/store.py`: SQLite persistence and status/version history.
- `agent/opportunities.py`: intake, metadata, deadlines, eligibility, discovery.
- `agent/network.py`: bounded public-network retrieval and provider requests.
- `agent/preparation.py`: profile answer packs, AI integration/validation, document export.
- `agent/config.py`, `agent/__main__.py`: environment, data paths, startup.
- `web/index.html`, `web/app.js`, `web/styles.css`: dashboard and shared tokens.
- `extension/manifest.json`, `extension/popup.*`, `extension/autofill.js`: pairing, preview, matching, filling.
- `workflows/*.json`: discover, intake, prepare.
- `tests/test_*.py`, `tests/autofill.test.cjs`, `tests/form-fixture.html`: behavior and integration checks.
- `scripts/setup.py`, `Start-Agent.cmd`, `Start-Agent.ps1`, `compose.yaml`, `Dockerfile`, `.env.example`, `README.md`: installation and operations.
- `DESIGN.md`, `premium-ui.json`: UI system and verification contract.

### Task 1: Persistent profile and application lifecycle

**Interfaces:** `Store(data_dir: Path)`; `get_profile() -> dict`; `save_profile(dict) -> dict`; `upsert_opportunity(dict) -> tuple[dict,bool]`; `list_opportunities() -> list[dict]`; `get_opportunity(id: str) -> dict`; `set_status(id: str,status: str) -> dict`; `save_pack(id: str,pack: dict) -> dict`; `get_settings()/save_settings(dict)`.

- [ ] Write and run failing unittest cases for persistence, canonical URL deduplication, distinct opportunities at one organization, pack versions, submitted-status preservation, and invalid transitions.
- [ ] Implement config and store, using parameterized SQL, per-operation connections, and atomic JSON data updates.
- [ ] Run `python -m unittest tests.test_store -v`; expect all cases to pass.

### Task 2: Intake, discovery, eligibility, and truthful preparation

**Interfaces:** `intake(payload: dict,store: Store) -> dict`; `discover(store: Store) -> dict`; `assess(profile: dict,opportunity: dict) -> dict`; `prepare(profile: dict,opportunity: dict,ai: callable|None=None) -> dict`; `render_document(opportunity: dict,pack: dict,kind: str) -> str`.

- [ ] Write failing tests for pasted text and URLs, RSS/Atom and public-board adapters, invalid/private source URLs, duplicates, partial-source failure, deadline uncertainty, missing eligibility facts, and strict AI response validation.
- [ ] Implement public-network retrieval with redirect validation, size/time limits, and provider calls; feed/search adapters; deterministic explicit-fact assessment; profile-based baseline packs and optional configured AI drafts with evidence references.
- [ ] Run `python -m unittest tests.test_opportunities tests.test_preparation -v`; expect all cases to pass.

### Task 3: Authenticated API and local dashboard

**Interfaces:** API endpoints `/api/health`, `/api/bootstrap`, `/api/state`, `/api/profile`, `/api/settings`, `/api/intake`, `/api/discover`, `/api/opportunities/{id}`, `/api/opportunities/{id}/prepare`, `/api/opportunities/{id}/pack`, `/api/opportunities/{id}/status`, `/api/opportunities/{id}/documents/{kind}`, `/api/export.csv`, `/api/resume`.

- [ ] Write failing HTTP tests for required token, rejected cross-origin mutation, profile persistence, intake/preparation round trip, resume limits, missing resources, and escaped downloads.
- [ ] Implement service routing, validation, safe errors, static pages, uploads and exports.
- [ ] Implement a responsive dashboard with profile, opportunity queue, editable pack, integrations and source setup; no fabricated metrics. Use an editorial cream/ink/green visual system with strong typography, clear pending states, and visible keyboard focus.
- [ ] Run API tests and check service/dashboard in a real browser at desktop and narrow widths, including empty, invalid, loading, success, and search no-results states.

### Task 4: Review-before-fill browser extension

**Interfaces:** `OpportunityAutofill.scan(document,pack) -> array`; `OpportunityAutofill.fill(document,preview) -> object`. Preview rows contain a stable locator, label, existing value, proposed value, status, and reason. Packs have `profile`, `answers:[{question,answer}]`, and `opportunity_id`.

- [ ] Write failing node:test cases for label/name/autocomplete matching, exact user answers, ambiguous duplicate labels, select values, existing user data, and unsupported/consequential controls.
- [ ] Implement a pure matching core plus injected scan/fill, extension pairing, opportunity selection, per-field preview/check controls, result reporting, and filled-status recording only when values were written.
- [ ] Run `node --test tests/autofill.test.cjs` and exercise the DOM fixture; assert no submission and untouched consent/upload/password controls.

### Task 5: n8n workflows and usable startup

**Interfaces:** Importable JSON uses only supported built-in nodes; companion URL defaults to `http://agent:8765` in Compose. Use an n8n Header Auth credential for `X-Opportunity-Token`; protect webhook triggers with a separate Header Auth credential. No credentials are distributed.

- [ ] Write workflow checks for connected nodes, authentication, HTTP body mappings, errors, and disabled-by-default schedules.
- [ ] Generate discover/manual+schedule, intake, and prepare workflows with notes and explicit error responses. Add Compose with loopback-only ports and persistent volumes, Python-only launcher, setup/pairing instructions, and environment examples.
- [ ] Validate workflow schemas and import/run against a local n8n instance if Docker can run; report environmental limits precisely otherwise.

### Task 6: Whole-project verification, review, and delivery

- [ ] Run complete Python and JavaScript tests, syntax checks, strict UI audit and configured UI commands.
- [ ] Verify the running app, download/export flow, extension integration and narrow layout; save representative screenshots.
- [ ] Request one fresh-context code review against this plan and the approved design; fix material findings with reproducing tests and rerun the suite.
- [ ] Provide a clean zip without runtime personal data or secrets, source folder, startup link, setup guidance, and a verification report that distinguishes mocked from live provider tests.
