# Opportunity Desk interaction contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in web/ui.js | DESIGN.md | platform-owned popup | Browser keyboard/popup check |
| Date | Typed ISO field in web/ui.js | agent/opportunities.py | date-only, explicit offset | tests/test_opportunities.py |
| Form | fields, formError, busy in web/ui.js | This contract | create, edit | tests/test_server.py; runtime QA |
| Scrollbar | web/styles.css global baseline | DESIGN.md | document, textarea, dialog | CSS and narrow browser check |
| Toast | shared #status live region | This contract | success, error, info | runtime QA |
| CRUD | web/app.js navigation + authenticated API | Approved design | save and stay, add and return to inbox | tests/test_server.py |

## Behavior

Save means server-confirmed persistence. Failed requests retain the current form. Buttons are disabled while their operation runs; errors remain visible with a retry path. Pack edits carry a base version and stale writes receive a conflict. In-app navigation asks before discarding dirty forms; actual page unload uses the browser lifecycle warning. Drafts are not persisted in localStorage because they contain personal information.

Search and category/status filters are local and immediate, with IME-safe input handling and an explicit clear action. Search state is transient and intentionally omitted from shareable URLs because it can contain personal application information. Lists paginate 20 entries per page. Navigation sections share the same rail/top bar. Dates use Intl browser locale formatting; deadline timezone uncertainty is never silently resolved.

No destructive delete action exists. Archiving retains the full record. Submitted means the user explicitly marked it submitted; autofill cannot set that status. The browser extension never clicks a submit control or writes into consent, upload, payment, authentication, or attestation fields. All form writes require a preview and explicit Fill action.

Accessibility target: WCAG 2.2 AA through native controls, labeled inputs, visible focus, semantic headings and regions, reduced motion, status announcements, and responsive natural-height layouts. No remote fonts or resources are required.
