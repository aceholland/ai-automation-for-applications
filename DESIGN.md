---
version: alpha
name: Opportunity Desk
description: A personal field notebook for finding and preparing the next application.
colors:
  primary: "#214b3d"
  background: "#edf1eb"
  surface: "#fbfcf8"
  ink: "#1e3029"
  muted: "#59695f"
  border: "#ccd5cc"
  accent: "#dad4ef"
  danger: "#a63335"
  focus: "#65509c"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "3.5rem"
    lineHeight: "1.1"
  body:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: "1.6"
  utility:
    fontFamily: "Consolas, ui-monospace, monospace"
rounded:
  DEFAULT: "0.75rem"
  sm: "0.375rem"
  lg: "1.5rem"
spacing:
  unit: "0.5rem"
  section: "2rem"
  page-max: "76rem"
components:
  button: {}
  field: {}
  card: {}
  dialog: {}
---

# Opportunity Desk Design System

## Overview

Product register: a single-user opportunity assistant for the person in this chat. English UI; user-entered international text is preserved. No inferred market or nationality. It should feel like an organized research notebook: pale green paper, deep green ink, restrained lilac annotations, and an expressive serif heading surrounded by practical controls. The signature is a four-stage application path that makes the handoff to the user visible. Avoid fake live statistics, a sales landing page, or a busy analytics dashboard.

## Colors

`web/styles.css :root` is the canonical runtime token owner. This frontmatter mirrors its accepted values. `colors.primary` maps to `--primary`; background, surface, ink, muted, border, accent, danger, focus follow the same names. Shared controls consume these variables, including extension styles through a local shared-token import. Light theme only. Forced-colors mode retains platform borders and outlines. Status is expressed through text as well as color.

## Typography

Display uses Georgia with restrained italic emphasis. Body uses locally installed Segoe UI/system sans, avoiding external font requests and font swapping. Metadata and counts use Consolas. Form labels are body text; headings are sentence case. Long opportunity names and pasted URLs wrap. Browser formatting uses the user's locale; date-only deadlines remain date-only, and timezone uncertainty is written explicitly.

## Layout

A 220 px navigation rail and a natural-height workspace, limited to 76rem, with 2rem section rhythm. At 840 px the rail becomes a top navigation bar; at 560 px multi-column forms collapse. Desktop inbox uses a list and a small next-step panel. Application details and profile use the same form width and panel grammar. All content scrolls in the document; no viewport-height clipping. Lists show at most 20 entries per page, with explicit previous/next controls.

## Elevation & Depth

Borders and tonal paper layers express hierarchy. Static panels have no shadows. Native dialog overlays receive a modest shadow and a dim backdrop. Status and error regions reserve space rather than moving primary actions during requests.

## Shapes

Controls use the 0.375rem radius, panels 0.75rem, and the hero/path panel 1.5rem. Use circles only for the four real lifecycle stages. No decorative chart shapes.

## Components

Shared owners are `web/ui.js` for buttons, fields, status, dialogs, requests, and downloads; `web/app.js` for navigation and unsaved-work guarding. Native selects own popup appearance and keyboard behavior. Typed ISO deadline input owns date entry; no authored calendar. `web/styles.css` owns focus, scrollbar, spacing, colors, and responsive behavior. No custom table selection exists.

Buttons have solid/outline/ghost emphasis. Hover, active, focus-visible, disabled, and busy states remain distinct. Loading uses an indeterminate indicator and stable button geometry, never fabricated percentages. Fields retain input after failures, place errors next to the form, and focus the first invalid field. Dialogs use native `dialog.showModal()`, close on Escape, and restore focus. Feedback uses one live status region plus persistent inline errors. Search has an explicit clear button. Empty, no-results, setup-missing, error, and saved states are separate.

Motion is limited to 140ms control feedback, suppressed for reduced motion. Every icon is accompanied by text or an accessible label. No custom icons carry essential meaning alone. Avoid external resources. Opportunity data is rendered with `textContent`, never injected HTML.

## Do's and Don'ts

- Do keep the user's review and submit step visible.
- Do show where drafts came from and what is still missing.
- Do keep saved facts and inferred matches distinct.
- Don't present an empty integration as a successful search.
- Don't move focus or reset forms during background updates.
