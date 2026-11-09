# Verification and delivery notes

This is a runnable first version of the local application assistant. The source includes the companion service, dashboard, browser helper with LinkedIn-post import, three n8n workflows, launchers, Compose configuration, and automated checks.

## Checks run

- **31 Python tests passed** using `python -m unittest discover -s tests -v`: persistence, duplicate identity including social posts, status preservation, pack versions/conflicts, URL intake, explicit/unknown eligibility, uncertain deadlines, RSS/Atom, partial source errors, malformed provider responses, grounded AI selection validation, API authentication/origin rules, attachments, and document output.
- **10 JavaScript tests passed** using `node --test tests/*.test.cjs`: matching and ambiguity, existing values, native select matching, skipped consequential controls, numeric/URL compatibility, and post normalization/deduplication.
- Python compilation and browser JavaScript syntax checks completed successfully.
- The strict frontend project audit reported **zero findings**. The machine-readable result is `premium-audit.json`. Runtime tokens are shared with the extension through generated `extension/tokens.css`.
- `docker compose config --quiet` completed successfully; this validates configuration syntax, not container startup.
- The n8n package registry's published **stable version 2.46.7** was verified and pinned in Compose. A 3.1 version mentioned in fetched documentation was not published in the checked registry, so it was not used.

## Real browser checks

The delivered app and a separate disposable-data instance were exercised in the in-app browser.

- Empty workspace, required profile validation and first-error focus, reusable answer creation, save confirmation, and unsaved-navigation protection.
- Pasted fellowship intake, category/deadline input, missing-timezone messaging, preparation, editable answer-pack saving, and explicit submitted-status tracking.
- No-results search, explicit clear action, native select interaction, and missing-source/provider error states.
- Desktop 1280px and narrow 390px views. Narrow inbox and long profile forms had no horizontal document overflow. Shared components and sibling views retained the same navigation and form language.
- **13/13 DOM autofill fixture checks passed**, including native select writing, ambiguous/unknown fields left blank, existing data preserved, upload/consent/password/hidden controls untouched, and no form submission.
- **7/7 synthetic LinkedIn-style post fixture checks passed**, including visible post capture, activity permalink, opportunity type, application link, and successful local inbox save.
- No browser console errors were observed in the checked dashboard flow. A production-workspace screenshot is included in `docs/images/`.

The browser download-event tool did not return successfully for a blob download. Document responses and download headers were verified through the HTTP integration tests; a successful browser file-save dialog is not claimed.

## Review

A fresh-context whole-project review inspected the backend, helper, workflows, and approved design. Three material findings were reproduced with failing tests and fixed:

1. Duplicate question labels stay ambiguous even when one matching field is already populated.
2. An incompatible visible question such as “Company name” is not overridden by `autocomplete="name"`.
3. Wrong-shaped successful provider JSON becomes a source-specific error while healthy sources continue.

The workflow setup note was also aligned with the supported Compose/local-host arrangements. No known material review findings remain. Cosmetic alternatives and universal/custom-widget autofill were outside this review's scope.

## Not verified live / setup still required

- **n8n import and execution:** the local Docker engine did not respond. A temporary npm fallback was attempted, but its dependency download ran out of disk space and encountered the host's older Node runtime. Only the two temporary caches created for that attempt were removed afterward. No n8n runtime success is claimed. Use the documented Compose setup once Docker is working, import the JSON workflows, and select the local Header Auth credentials.
- **Official DESIGN.md CLI lint:** its temporary installation also failed when the same disk limit was reached. The separate strict frontend audit passed; it does not replace that unavailable CLI run.
- **Live AI and Brave Search:** no provider credentials were supplied. The integrations are implemented and their failure/validation paths tested, while live requests remain unexercised. They are disabled until configured.
- **Actual signed-in LinkedIn UI and packaged-extension installation:** post parsing and saving were tested with synthetic LinkedIn-style DOM; the user must load the helper and invoke it in their existing signed-in tab. LinkedIn layout changes can require the selected-text fallback.
- **External application sites:** the actual DOM filling engine passed fixture checks. No real application was submitted or employer/fellowship website changed. Native form coverage is documented; custom widgets, assessments, and cross-origin frames may require manual completion.
- **GitHub Actions:** the repository contains a CI workflow. Its live result is reported separately after publication.

## Builder choices

The service uses the Python standard library to avoid installation requirements. Data and drafts are local rather than requiring Google Docs/Sheets. AI prioritizes exact saved profile excerpts rather than inventing factual claims; users can edit prose. LinkedIn capture is user-invoked in an opened page, while n8n schedules operate on configured sources. The helper leaves final submission and file selection to the user, as requested.

No API keys, local pairing tokens, personal profile database, resume attachment, or temporary dependency downloads are included in the repository or source archive.
