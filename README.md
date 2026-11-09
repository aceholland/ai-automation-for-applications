# AI automation for applications

**Opportunity Desk** is a personal application assistant built around n8n, a local tracker, and a Chrome/Edge autofill extension.

Use one profile for **jobs, internships, hackathons, research fellowships, competitions, scholarships, grants, and other opportunities**. Import listings, discover from configured sources, prepare truthful drafts, preview and fill supported fields, then review and submit yourself.

## Start in two minutes

Requires **Python 3.11 or newer**. The local service has **no pip dependencies**.

1. Download this repository and unzip it.
2. On Windows, double-click **Start-Agent.cmd**. Or run `python -m agent --open` from this folder on Windows, macOS, or Linux.
3. Open **http://127.0.0.1:8765**. Keep the agent process running.
4. Save your profile, add a listing, and choose **Prepare from profile**. Edit the pack before using it.

The workspace starts empty. Your real data is stored in `data/`, which is excluded from Git. No examples are presented as live opportunities. The Python-only service and the Docker version use separate storage unless you explicitly configure them otherwise.

## Install the browser helper

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Enable **Developer mode**, select **Load unpacked**, and choose this repository's **extension** folder.
3. In your dashboard, open **Connections**. Copy its local service address and pairing token.
4. Open an application website and invoke **Opportunity Desk — application helper** from your browser toolbar. Enter the address and token, then connect.
5. Select a prepared application pack and choose **Preview this page**. Review each proposed value and uncheck any field you want to complete yourself.
6. Choose **Fill selected fields**. Review the page, select attachments, and submit on the website yourself.

For a multi-page application, navigate to the next page yourself and preview again. Select **Refresh packs** after editing a pack in the dashboard. The extension requests temporary active-tab access when invoked and access to the local companion service. It does not request persistent access to all websites.

The helper supports visible native text, email, telephone, URL, number, textarea, and single-select fields. It skips existing entries, ambiguous questions, unsupported widgets, uploads, consent/declarations, passwords, payments, and assessments. It does not click buttons or submit forms. Custom controls and cross-origin frames can require manual entry. Test compatibility on each site; universal autofill is not claimed.

## What works without provider accounts

- Profile, pasted resume text, reusable answers, and an existing resume attachment.
- URL or text intake, local tracking, status history, and pack versions.
- RSS/Atom feeds and public Greenhouse/Lever company boards.
- Explicit-fact eligibility checks and transparent skill-phrase matching.
- Editable profile-based resume/statement drafts and direct profile/answer autofill.
- Printable HTML document downloads, existing-file downloads, and CSV tracker export.

An attached PDF/DOCX is stored for you to download and attach yourself. Paste its text separately in Profile to include it in preparation. The service does not silently extract or infer your qualifications.

## Optional AI and web search

Copy `.env.example` to `.env`, edit it locally, and restart the service. **Never commit `.env` or paste credentials into an application form.**

```dotenv
AI_ENABLED=1
AI_API_KEY=your-provider-key
AI_MODEL=your-model-id
AI_BASE_URL=https://api.openai.com/v1

BRAVE_SEARCH_API_KEY=your-search-key
```

Choose a model that supports the Chat Completions API and JSON mode. The model is intentionally configurable rather than tied to a stale default. Other compatible public HTTPS providers can be configured with `AI_BASE_URL`.

**Prepare with AI** sends the listing and profile excerpts to that provider. AI ranks existing profile facts and maps answerable listing questions to those facts. The server validates the IDs and builds factual text from your saved excerpts, so the model cannot invent degrees, awards, or work history. Drafts still need your editorial review. You can write and save more natural personal answers yourself.

With a Brave key, add search queries in Connections, one per line. Search runs when you choose **Find opportunities** or enable a configured n8n schedule. Search snippets are discovery leads; check the official listing before applying. Charges and limits follow your provider accounts. AI and paid search are not active out of the box.

For feeds, enter the complete RSS/Atom URL. For Greenhouse/Lever, select the provider and enter the company's **board slug**, not the full URL. Add separate sources for different opportunity types. Discovery is limited to configured sources and queries, with up to 100 entries per feed/board and 10 results per search query per run. It reports added records, duplicates, and source errors separately.

## Run n8n locally with Docker

Install/start Docker Desktop (or Docker Engine + Compose). **Choose either the Python-only service or Compose** for port 8765; stop the Python process first if it is running.

```sh
docker compose up -d --build
```

- Dashboard: **http://127.0.0.1:8765**
- n8n: **http://127.0.0.1:5678**
- Create your local n8n owner account in its UI.

Both ports are bound to loopback only. n8n HTTP cookies are configured for this local HTTP setup. Do not expose this Compose setup directly to the public internet. Profile/application storage and n8n configuration persist in separate named volumes. `docker compose down` stops containers without removing those volumes.

### Import and configure the workflows

Import each JSON file from **workflows/** using n8n's Import from File:

| File | Purpose |
| --- | --- |
| `discover.json` | Manual discovery and an initially disabled daily schedule |
| `intake.json` | Authenticated webhook for a listing URL or description |
| `prepare.json` | Authenticated webhook for one application pack |

Configure two separate **Header Auth** credentials in n8n:

1. **Opportunity Desk service** — header name `X-Opportunity-Token`; value is the token shown in the dashboard's Connections page. Select it in each **Call local assistant** node.
2. **Opportunity webhook access** — header name `X-Workflow-Token`; value is a separate random secret you generate. Select it in each webhook trigger. Do not use a real provider key here.

In Compose, the HTTP node addresses the service at `http://agent:8765`. If both n8n and the companion run directly on the same machine, change it to `http://127.0.0.1:8765`. A container cannot reach a host's loopback-only service using its own localhost; use Compose's bundled agent for the simplest supported setup. n8n Cloud cannot reach this local service without a separately designed remote deployment.

Workflows are imported **inactive**. Discovery's schedule node is also **disabled**. Test manually, configure sources, then enable the schedule node and publish the workflow only when you want recurring runs. The initial schedule is 09:00 in **Asia/Calcutta**; change the workflow timezone and schedule to suit you. Successful and failed execution data are not retained by these workflow settings; n8n's global settings may also affect retention.

Intake request body:

```json
{"url":"https://example.org/opportunity","category":"Research fellowship"}
```

You can instead supply `text`, `title`, `organization`, `deadline`, and `application_url`. A deadline can be a date (`2027-01-15`) or an ISO timestamp with an explicit offset. Date-only closing time/timezone remain unknown.

Prepare request body:

```json
{"opportunity_id":"copy-the-id-from-the-application-URL","use_ai":false}
```

The workflow uses AI only when `use_ai` is explicitly `true` and AI is configured. The dashboard can run intake, discovery, and preparation directly as well; n8n provides the scheduled and webhook orchestration.

## Eligibility, privacy, and progress

Eligibility checks compare only explicitly recorded country, citizenship, degree, or graduation-year requirements. They report missing facts as unknown and mismatches as items to verify. They do not infer citizenship, work authorization, or identity. A skill match is a text match, not a hiring/acceptance prediction.

Status is one of **new → shortlisted → prepared → filled → submitted**, with archiving available. You mark submission after the website confirms it. Preparing or filling again cannot silently reset a submitted status. AI and application data are untrusted inputs, not executable instructions. Outbound listing requests validate public DNS destinations and each redirect, and use bounded request sizes/timeouts. API keys remain server-side; pairing uses a locally generated token. No passwords for opportunity websites are requested.

The app is designed for one user on one computer. Anyone with access to your local data folder can read its contents. Back up `data/` (or the Compose data volumes) if you need to preserve your tracker. Google Docs/Sheets are not mandatory in this version; local drafts and CSV export provide preparation/tracking without another required account.

## Test and inspect

```sh
python -m unittest discover -s tests -v
node --test tests/autofill.test.cjs
python -m compileall -q agent scripts tests
```

With the service running, open **http://127.0.0.1:8765/tests/form-fixture.html** and choose **Run autofill checks**. This exercises the distributed autofill core against real DOM fields using explicitly synthetic data. It verifies values, native selects, skipped controls, and that no form submission occurs. The fixtures are not actual opportunities.

See **VERIFICATION.md** for the checks actually run and any remaining environment/setup limits. Regenerate portable workflow files with `python scripts/generate_workflows.py`.

## Source map

`agent/` owns storage, discovery, preparation, and the API. `web/` serves the dashboard. `extension/` is the browser helper. `workflows/` contains importable n8n workflows. `tests/` contains behavior checks and the local browser fixture. `DESIGN.md` and `UX-CONTRACT.md` record the UI's tokens and behavior. `docs/` contains the approved design and implementation plan.

## Reference documentation

- [Original n8n tutorial](https://www.youtube.com/watch?v=lq8OaM-SeJo)
- [n8n workflow import/export](https://docs.n8n.io/build/manage-workflows/export-and-import)
- [n8n HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest)
- [Chrome activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Brave Web Search documentation](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)
