# ABT CPD Complaint Analytics Platform: UI/UX Design Specification (for approval)

## 0. Context and honest limitations

**Why this plan exists.** You asked for a design system, navigation architecture, page layouts, widget specs and responsive behaviour, based on three reference sites, before any code is written. This document is that specification. No implementation starts until you approve it.

**What I actually inspected**
| Source | What I saw | What I could NOT see |
|---|---|---|
| Screenshot 1 (ClarityComply landing page, full page) | Visual layout, colours (estimated by eye), hero dashboard mockup with sidebar, module selector, card grids, FAQ, footer | Anything inside the real app |
| Screenshot 2 (QSA Control landing page, full page) | Visual layout, teal palette, "site panel" KPI mockup, paper-vs-platform comparison, feature grid, pricing, testimonials | Anything inside the real app |
| qsacontrol.com, clarity-comply.app, focus2work.com (text fetch) | Section order, nav items, module names, mockup text, Focus2Work screenshot **captions** (NC register, NC detail, CAPA stage gates, closed-loop diagram, "tables become cards on mobile") | CSS, exact hex values, fonts, breakpoints, images, JS behaviour. The ClarityComply demo is behind a signup form, which I did not submit |

- **Focus2Work:** I have no screenshot, so everything I say about it comes from caption text only.
- **Hex values:** every colour I attribute to a reference is my estimate from the screenshots, not extracted CSS.
- **Internal screens:** none of the three sites shows its internal app publicly. My notes on complaint, CAPA and investigation screens come from their hero mockups and captions, plus standard enterprise QMS conventions. They are not copied from real product screens.

**Repository state.** `c:\Users\KESHAV\Downloads\ABT` contains only `CLAUDE.md`. **The ML/NLP ZIP and the datasets are not present yet.** So this spec designs every page with "capability gating". Each AI or risk page has a defined *unavailable / insufficient data* state. Once the ML audit and the data readiness report exist, the backend decides which pages are live. Nothing will show invented numbers.

**Rule for using the references.** I take layout and interaction patterns only. No branding, logos, copy, illustrations, testimonials or pricing. QSA's "-90% / 100% / <1 wk" stat counters and testimonial cards are specifically **excluded** because we would have to invent them.

---

## 1. Reference analysis: best source per design element

| # | Element | What the references show | Best reference | Adopted for ABT |
|---|---|---|---|---|
| 1 | Dashboard layout | Clarity mockup: sidebar plus a 3-tile KPI row plus a "due/open items" list. QSA: one "site panel" card with a % score, KPI tiles and status rows. Focus2Work caption: KPI tiles, open items, trends, per-role view | **Focus2Work** (structure), **QSA** (KPI tile density) | KPI strip, then a trend row, then an "open items / attention" list, with role-aware content |
| 2 | Sidebar navigation | Clarity mockup: dark sidebar, icon plus label, active item shown as a tinted pill | **ClarityComply** | Grouped dark sidebar, icon plus label, tinted active pill, collapsible to an icon rail |
| 3 | KPI cards | QSA: big number, small caps label, coloured accent. Clarity: tile with a coloured progress bar | **QSA Control** | Label, value, delta vs. prior period, provenance chip, optional sparkline |
| 4 | Charts | References show almost none. QSA has a sparkline in its photo overlay | None suitable | Our own spec (§5.6), built with the dataviz guidance |
| 5 | Complaint management | Focus2Work NC register: status, severity, owner, age, filters, open/overdue/closed counts | **Focus2Work** | Register table with a count-tab strip (All / Open / Overdue / Closed) |
| 6 | Investigation workflow | QSA/Clarity: NC log, root cause, action, verification, closure. Focus2Work: Detect, Investigate, Correct, Verify loop | **Focus2Work** loop plus **QSA** step list | Horizontal stage stepper on complaint detail |
| 7 | CAPA interface | Focus2Work: "CAPA stages with signature gates", linked CAPA on NC detail | **Focus2Work** | Stage-gated CAPA detail. "Closed" and "Effective" are separate states |
| 8 | Tables and filters | Focus2Work register plus mobile cards | **Focus2Work** | Dense table, sticky header, filter bar with chips, card list on mobile |
| 9 | AI prediction presentation | **None of the references has this** | None | Our own design (§5.3). It is the main thing that sets ABT apart |
| 10 | Alerts and notifications | QSA: Telegram/email alerts. Clarity: inline "Reading out of range" warning row | **ClarityComply** (inline row warnings) | In-app bell drawer, toasts and inline banners. No third-party messaging |
| 11 | Upload interface | Not shown | None | Our own 5-step wizard (§4.9) |
| 12 | Forms and validation | Clarity demo form (name, company, email, phone). Focus2Work contact form | **ClarityComply** (minimal fields) | Stacked labels, inline errors, sectioned long forms |
| 13 | Typography | Both use a geometric/grotesk sans with bold, tight headlines | **ClarityComply** (hierarchy) | IBM Plex Sans plus IBM Plex Mono (§2.2) |
| 14 | Colour | Clarity: near-black navy with signal green. QSA: deep teal with mint/cyan accent | **ClarityComply** (dark-surface discipline) | Our own graphite plus petrol-blue palette (§2.1), so neither brand is copied |
| 15 | Spacing and layout | Both: centred ~1120–1200px container, generous section padding, 2–4 column card grids, ~10–12px card radius | **QSA Control** | App uses tighter density. Marketing pages use the QSA rhythm |
| 16 | Responsive | Focus2Work: "tables become cards on phones" | **Focus2Work** | §6 |
| 17 | Dark/light | Clarity: dark hero, light body sections, dark platform band, dark CTA and footer. QSA: same alternation in teal | **ClarityComply** | Public site alternates bands. App is light by default with a dark theme toggle |

Additional marketing-page patterns I adopt (layout only):
- **Clarity:** a standards/capability chip strip, a 4-step "How it works", an interactive module selector (list on the left, detail panel on the right), and a FAQ accordion.
- **QSA:** a "before vs. with platform" two-column comparison.

---

## 2. Design system

### 2.1 Colour tokens (exact hex)

**Neutrals ("graphite")**
| Token | Hex | Light theme use | Dark theme use |
|---|---|---|---|
| graphite-950 | `#0B1117` | primary text | app background |
| graphite-900 | `#111A22` | sidebar background (both themes) | sidebar / surface |
| graphite-800 | `#1A2530` | headings on tinted backgrounds | raised surface / card |
| graphite-700 | `#2A3744` | — | borders |
| graphite-600 | `#3E4C5A` | secondary text | — |
| graphite-500 | `#5B6B7B` | muted text, axis labels | muted text |
| graphite-400 | `#8696A7` | placeholder, disabled | secondary text |
| graphite-300 | `#B4C0CC` | strong borders | body text |
| graphite-200 | `#D6DDE4` | borders, dividers | — |
| graphite-100 | `#EAEFF3` | table header, hover row | — |
| graphite-50 | `#F5F7F9` | app background | — |
| white | `#FFFFFF` | cards / surfaces | primary text (`#E8EDF2`) |

**Primary ("petrol")**: actions, links, focus, active navigation
| 800 | 700 | 600 (default) | 500 | 400 | 100 | 50 |
|---|---|---|---|---|---|---|
| `#083F52` | `#0A4F66` | `#0B6A87` | `#0E86A8` | `#3AA5C4` | `#DDF1F7` | `#EFF8FB` |

- In dark theme, primary buttons use 500 `#0E86A8` and links use 400 `#3AA5C4`.
- The focus ring is 2px `#3AA5C4` with a 2px offset.

**Semantic status**
| Role | Foreground | Background tint | Border |
|---|---|---|---|
| Success / Closed-effective | `#1F7A45` | `#E6F4EC` | `#A8D5BA` |
| Warning / Overdue | `#9A6212` | `#FDF3E1` | `#EBC98A` |
| Danger / Critical | `#B42F28` | `#FBE9E7` | `#EDB0AA` |
| Info / In progress | `#2A62A0` | `#E7F0FA` | `#A9C6E8` |
| Neutral / Draft | `#3E4C5A` | `#EAEFF3` | `#D6DDE4` |

**Severity scale** (complaints)

Critical `#B42F28`, Major `#D0622A`, Minor `#B07D1A`, Observation `#5B6B7B`. A severity is always shown with its text label, never by colour alone.

**Provenance tokens** (required by CLAUDE.md §2 and §11, and the core of the visual language)
| Label | Text | Background | Border style | Icon |
|---|---|---|---|---|
| Recorded fact | `#3E4C5A` | `#EAEFF3` | solid `#B4C0CC` | database |
| Model prediction | `#5B3FC4` | `#F0ECFD` | **dashed** `#B9A9F0` | cpu |
| NLP classification | `#7A3AA8` | `#F6ECFB` | **dashed** `#D3B0E8` | tag |
| Similarity evidence | `#0C6E76` | `#E3F4F5` | dotted `#9FD3D7` | link |
| Rule-based calculation | `#3F548A` | `#E9EDF6` | solid `#B3BFDD` | function |
| Human verified | `#1F7A45` | `#E6F4EC` | solid `#A8D5BA` | badge-check |
| Insufficient data | `#5B6B7B` | hatched `#F5F7F9` | dashed `#B4C0CC` | circle-slash |
| Demo / synthetic | `#92400E` | `#FEF3C7` | solid `#F2C66D` | flask, plus a page-level "DEMO DATA" ribbon |

Dashed borders mean machine-generated. Solid borders mean recorded or verified. This is a non-colour cue, so it still works for colour-blind users.

**Chart categorical palette** (8 series, in order)

`#0E86A8` `#D0622A` `#5B3FC4` `#1F7A45` `#C2367A` `#8C6D1F` `#2A62A0` `#5B6B7B`

- **Sequential:** `#EFF8FB` to `#0E86A8` to `#083F52`.
- **Diverging:** `#B42F28`, then `#F5F7F9` in the middle, then `#0B6A87`.
- **Validation:** during implementation I will run the palette through the dataviz validator for colour-vision-deficiency separation and AA contrast against both themes, and adjust hex values if any pair fails.

**Contrast targets:** body text at least 4.5:1, large text and UI glyphs at least 3:1. Every foreground/background pair above was picked to meet AA. I will check each pair programmatically at implementation time.

### 2.2 Typography
- **UI typeface: IBM Plex Sans** (400/500/600/700). It reads industrial and engineered, it is open licence, and it is distinct from both references.
- **Data typeface: IBM Plex Mono**, used for complaint IDs, batch numbers, model versions and timestamps. Every numeric table column uses `font-variant-numeric: tabular-nums`.
- Both fonts are self-hosted (no Google CDN call), which suits confidential environments.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| display | 44/52 | 700 | Marketing hero only |
| h1 | 28/36 | 600 | Page title |
| h2 | 20/28 | 600 | Section / card group title |
| h3 | 16/24 | 600 | Card title |
| body | 14/20 | 400 | App default |
| body-lg | 16/24 | 400 | Marketing body, form help text |
| small | 13/18 | 400 | Table cells, metadata |
| caption | 12/16 | 500 | Labels, chips |
| overline | 11/16 | 600, +0.08em, uppercase | Section eyebrow (the Clarity pattern) |
| kpi | 30/36 | 600, tabular | KPI values |

### 2.3 Spacing, layout, shape and elevation
- **Spacing:** 4px base. The scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96.
- **App shell:**
  - Sidebar 248px expanded, or a 64px icon rail.
  - Top bar 56px.
  - Content padding 24px (16px on mobile).
  - Content max width 1600px, on a 12-column fluid grid with 24px gutters.
- **Marketing:** 1200px container, 96px section padding on desktop and 64px on mobile.
- **Radius:**
  - 6px for inputs and buttons.
  - 8px for cards, panels and table containers.
  - 12px for modals and drawers.
  - Full radius for chips and pills.
  - The app is deliberately tighter than the references' ~12px, which suits an enterprise look.
- **Elevation:** flat by default, separated by 1px borders.
  - `shadow-1`: `0 1px 2px rgba(11,17,23,.06)`, for cards.
  - `shadow-2`: `0 8px 24px rgba(11,17,23,.12)`, for popovers, drawers and modals.
  - Dark theme uses borders only, with no shadows.
- **Density toggle** (tables): comfortable rows 44px, compact rows 36px.
- **Icons:** Lucide, 16px inline and 20px in navigation, 1.75px stroke.

### 2.4 Themes
- **Public site:** fixed band alternation, following the Clarity pattern.
  - Dark bands: hero, platform band, CTA and footer, on `#0B1117` / `#111A22` with a faint 1px grid texture at `rgba(255,255,255,.03)`.
  - Light bands: content sections on `#F5F7F9` / `#FFFFFF`.
- **App:**
  - **Light theme is the default**, because it suits dense data, printing and reports.
  - The dark theme is a user preference stored on the user profile.
  - The sidebar stays dark (`#111A22`) in both themes.
  - Implementation: CSS custom properties per theme, Tailwind `darkMode: 'class'`, and tokens mapped in `tailwind.config.ts`. Charts read theme tokens.

---

## 3. Navigation architecture

### 3.1 Surfaces
1. **Public site** (no authentication): `/` home, `/demo` request a demo, `/login`.
2. **Authenticated app** (`/app/...`): the sidebar shell.

### 3.2 Sidebar (grouped, permission- and capability-aware)
```
OVERVIEW
  ▸ Overview                      /app
COMPLAINTS
  ▸ Complaint Register            /app/complaints
  ▸ New Complaint                 /app/complaints/new
INTELLIGENCE                      (shown only if the ML audit marks the model ready)
  ▸ AI Analysis                   /app/ai
  ▸ Root Cause Intelligence       /app/root-cause
QUALITY
  ▸ CAPA Effectiveness            /app/capa
  ▸ Product & Batch Risk          /app/risk   (label becomes "Product Risk" if batch linkage is unsupported)
INSIGHTS
  ▸ Analytics                     /app/analytics
  ▸ Reports                       /app/reports
DATA
  ▸ Data Management               /app/data   (tabs: Upload · Import History · Data Quality)
ADMIN                             (admin role only)
  ▸ Demo Bookings                 /app/admin/bookings
  ▸ Users & Roles                 /app/admin/users
  ▸ Model Registry                /app/admin/models
  ▸ Audit Log                     /app/admin/audit
──────────
  ▸ Settings                      /app/settings  (profile, theme, density)
```

**Gating rules**
- The frontend reads `GET /api/meta/capabilities` at login. It returns enabled modules, role, model readiness and data readiness.
- Disabled modules are **hidden**, not greyed out, because CLAUDE.md §14 says "no nonfunctional menu items".
- When a page is partly supported (for example CAPA records exist but recurrence cannot be computed), the page renders and the unsupported widgets show the *Insufficient data* state.

**Roles**
- **Admin:** everything.
- **Analyst:** all non-admin pages. Can create and edit complaints, run AI analysis, review predictions and upload data.
- The design can take a read-only **Viewer** role later, if you want one (see §8).

### 3.3 Top bar
From left to right:
- Mobile hamburger
- Breadcrumbs
- Global search (`Ctrl+K`, searching complaint ID, batch, product, text)
- "Demo data" ribbon, when applicable
- Notification bell
- Theme toggle
- User menu (profile, role badge, sign out)

### 3.4 Cross-page navigation flows
- **Overview KPI card or chart point** opens the Complaint Register with that filter pre-applied. The URL query string holds the filter state, so links can be shared.
- **Complaint Register row** opens Complaint Detail. From there:
  - "Run AI analysis" goes to the AI result.
  - "Similar cases" opens a drawer.
  - The linked CAPA chip goes to CAPA Detail.
  - The product or batch chip goes to Risk Detail.
- **AI result:** "Confirm / Reject / Correct" writes a review and returns to Complaint Detail.
- **Root Cause row:** "Evidence" lists the linked complaints in the register.
- **CAPA Detail:** "Recurrence after closure" lists complaints in the register, filtered by product/category and date greater than the closure date.
- **Data Management import summary:** "View imported records" opens the register filtered by `import_id`.
- **Admin booking notification** (bell) opens Demo Bookings detail.

---

## 4. Page-by-page layouts

Every page uses the same template:
- Page header: title, one-line description, primary action on the right.
- Optional count-tab strip or filter bar.
- Content grid.

Every data widget has four defined states: **loading** (skeleton), **empty**, **error** (retry), and **insufficient data** (explains why, links to the data readiness doc).

### 4.0 Public: Home `/`
Bands, from top to bottom:
1. **Dark hero:** eyebrow; headline; 2-line value statement; **"Request a demo"** (primary) and **"Sign in"** (secondary). On the right, a stylised product mockup built from our real components with **clearly placeholder data, labelled "Illustrative"**.
2. **Capability chip strip:** complaint analytics, NLP classification, similar cases, root cause, CAPA effectiveness, Pareto, reports. These are capabilities, not certifications we cannot claim.
3. **Light band, "Before / With the platform":** two-column comparison (QSA pattern).
4. **Light band, "How it works":** 4 numbered steps: Upload, Analyse, Investigate, Verify CAPA.
5. **Dark band, "Modules":** interactive selector (Clarity pattern). A module list on the left. On the right, a detail panel with 3 bullets and "what you see" text.
6. **Light band, "How we treat AI output":** a visual explainer of the provenance badges. Predictions are never facts.
7. **FAQ accordion.**
8. **Dark CTA band**, then the **footer.**

No statistics, testimonials, pricing or logos.

### 4.0b Public: Request a demo `/demo`
- **Layout:** two columns at lg and above (single column on mobile).
  - **Form (left, 7 of 12 columns):**
    - Full name
    - Organisation
    - Role
    - Work email
    - Phone (optional)
    - Preferred date (date picker, weekdays, no past dates) and time slot (select)
    - Time zone (auto-detected, editable)
    - Purpose (textarea, 20 to 1000 characters)
    - Consent checkbox
  - **Right (5 of 12 columns):** "What to expect" list and a privacy note.
- **On submit:** a confirmation screen with a booking reference (mono), a summary, and "Add to calendar" (.ics download).
- **Separation:** this flow is fully separate from complaint workflows (CLAUDE.md §9).

### 4.0c Public: Login `/login`
- Split screen: a dark brand panel on the left (hidden below md) and a form card on the right.
- Fields: email and password, a show-password toggle, and generic error text ("Invalid email or password").
- Lockout message after rate limiting.

### 4.1 Overview `/app`
```
[Page header: Overview · date-range picker (default: all data) · Export]
[KPI strip ×4–6]  Total complaints | Open investigations | Critical (period) | Repeat complaints | CAPAs open | Recurrence after closure
[Row: Complaints by month (line/area, 8 col) | Severity mix (stacked bar, 4 col)]
[Row: Top products (horizontal bar, 6 col) | Top categories, Pareto mini (6 col)]
[Row: Needs attention list (8 col): overdue investigations, unreviewed predictions, CAPAs closed <90d with recurrence | Data status card (4 col): last import, record count, data-quality score, demo-data flag]
```
- Each KPI card carries a provenance chip, which is "Recorded fact" or "Rule-based" for derived counts.
- If a KPI cannot be computed, the card shows **"Not available: <reason>"** in a hatched style. It is never hidden silently and never shows zero.

### 4.2 Complaint Register `/app/complaints`
- **Header:** "New complaint" (primary) and "Export CSV".
- **Count tabs:** All · Open · Under investigation · Overdue · Closed, with live counts (Focus2Work pattern).
- **Filter bar:**
  - Search (text and ID)
  - Date range
  - Product (multi-select)
  - Category (multi-select)
  - Severity (multi-select)
  - Status
  - "More filters" (batch, source, AI-reviewed yes/no)
  - Active filters show as removable chips, plus "Clear all".
- **Table columns:**
  - Complaint ID (mono, link)
  - Received date
  - Product
  - Batch
  - Category (recorded), plus a small NLP chip if a prediction exists
  - Severity pill
  - Status pill
  - Owner
  - Age (days, turns amber or red past the SLA)
  - Row overflow menu
- **Table behaviour:**
  - Sticky header, sortable columns.
  - Column chooser and density toggle.
  - Server-side pagination (25/50/100).
  - Row checkboxes for bulk export only.

### 4.3 Complaint Detail `/app/complaints/:id`
```
[Header: ID (mono) · title (first 80 chars) · Severity · Status · actions: Edit | Run AI analysis | ⋯]
[Investigation stepper: Received → Triage → Investigation → Root cause → CAPA → Verification → Closed]
[Main (8 col)]                                  [Right rail (4 col)]
 Card: Complaint description (Recorded fact)     Card: Key facts (product, batch, customer, dates, source file + row)
 Card: AI analysis summary (latest prediction,   Card: Linked CAPA(s) (status, closure, effectiveness state)
       badge, review status) → open full result  Card: Similar historical complaints (top 5, similarity evidence)
 Card: Root cause (Recorded / Predicted / Human  Card: Provenance (import id, created/updated by)
       verified, shown as separate labelled rows)
 Tabs: Activity timeline | Prediction history (all model versions, never overwritten) | Audit trail
```

### 4.4 New / Edit Complaint `/app/complaints/new`
- A sectioned form, with sections as cards: Complaint details, Product & batch, Customer, Classification (recorded), Attachments (optional).
- The required fields follow the actual data dictionary, to be finalised after the data audit.
- A sticky footer holds Cancel, Save draft, and **"Save & analyse"**. The last one is shown only if the NLP model is ready, and it goes to the AI result.
- Validation: inline, on blur and on submit, with an error summary at the top that links to each field. The backend's 422 field errors map onto the same fields.

### 4.5 AI Analysis `/app/ai`
Two tabs:
1. **Analyse text.**
   - **Left:** a textarea for the complaint description, plus optional product. Shows a character count and the minimum length the model needs (taken from the audit).
   - **Right:** the **Prediction Result Panel** (§5.3).
   - **Empty or too-short text:** rejected with an inline error. No call is made.
   - **Unsupported input:** an *Insufficient data* result.
2. **Review queue.**
   - A table of predictions with no human review yet: ID, model version, predicted label, confidence (if supported), created.
   - Opening one gives a review drawer with Confirm / Reject / Correct (correct means pick a label and give a reason).

A model info strip at the top shows: model name · version · status · last validated. It links to the Model Registry if the user is an admin.

### 4.6 Root Cause Intelligence `/app/root-cause`
- **KPI strip:**
  - Complaints with a recorded root cause (%)
  - Distinct root causes
  - Top root cause
  - Human-verified (%)
- **Row:**
  - Root-cause Pareto (bars plus a cumulative line).
  - Root cause × product heatmap. Shown only where the identifiers really link records.
- **Table:** root cause · category · # linked complaints · first and last seen · status chips for Recorded / Predicted / Verified counts.
- **Detail drawer:**
  - Definition
  - Linked complaints (evidence)
  - Similar cases
  - "Suggested investigation direction", always labelled *Possible explanation* and dashed.
- **Banner:** if no root-cause model exists, a permanent info banner says "Root causes shown are recorded values. No predictive root-cause model is available."

### 4.7 CAPA Effectiveness `/app/capa`
- **Count tabs:** All · Open · Overdue · Closed (effectiveness pending) · Effective · Not effective · Cannot be established.
- **KPI strip:** Open CAPAs · Overdue · Median days to close · Recurrence after closure (%).
- **Table columns:** CAPA ID, description, related complaint(s), owner, created, due, closed, status, **effectiveness state** (separate pill), and recurrences after closure.
- **CAPA Detail `/app/capa/:id`:**
  - **Stage stepper with gates:** Open → Action planned → Implemented → Closed → Effectiveness check → Effective / Not effective.
  - **Main:** description, actions, evidence.
  - **Right rail:** linked complaints, owner and dates.
  - **"Recurrence after closure" panel:** a timeline chart of matching complaints before and after the closure line, with a vertical marker at closure.
  - **Rule text explains the matching criteria.** If data is insufficient, the panel says "Effectiveness cannot yet be established" and gives the reason (for example: observation window under N days, or no product linkage).

### 4.8 Product & Batch Risk `/app/risk`
- The page title and level come from the capabilities endpoint: **"Batch risk" only if** batch linkage and a valid model target are verified. Otherwise it shows **"Product & process monitoring"**.
- **Level banner:** "Risk is estimated at the PRODUCT level using complaint rate over time (rule-based)."
- **Table:** product (or batch) · complaints (period) · trend sparkline · rate change · top category · risk indicator, with a provenance chip on each row.
- **Detail:** monthly trend, category mix, related CAPAs, and recent complaints.

### 4.9 Data Management `/app/data`
Three tabs:
1. **Upload wizard**, as a 5-step horizontal stepper:
   1. **File:** dropzone that accepts .csv and .xlsx up to N MB, showing type and size validation.
   2. **Sheet:** choose a worksheet, with row and column counts.
   3. **Map columns:** source column → target field, auto-suggested and with the confidence of the name match shown. Required fields are flagged.
   4. **Validate & preview:** a summary of errors, warnings and duplicates. The first 100 rows have row-level error icons. Invalid rows can be downloaded as CSV.
   5. **Confirm:** an import summary (insert / skip / duplicate counts), then commit.

   The original file is stored unchanged. The wizard warns before it leaves an unfinished import.
2. **Import history:** table with import ID, file, sheet, user, date, rows ok/failed, status, and a link to view records.
3. **Data quality:** completeness per field (bar), duplicate counts, date coverage, and the demo/synthetic flag.

### 4.10 Analytics `/app/analytics`
- **Global filter bar:** date, product, category, severity.
- **Chart grid** (2 per row on desktop):
  - Complaint trend (with a 3-month moving average)
  - Pareto by category
  - Product comparison (grouped bar)
  - Category distribution (horizontal bar, not pie)
  - Recurrence analysis
  - CAPA cycle time (box/strip)
  - Day-of-week / month seasonality
- Each chart card has: title, provenance chip, "i" (calculation definition), and a menu to export PNG or CSV.

### 4.11 Reports `/app/reports`
- **Report templates (cards):** Monthly complaint summary, Pareto report, CAPA status report, Product quality report.
- **Builder:** pick a template, a date range and filters, then preview (HTML) and export (PDF/CSV/XLSX).
- **History table** of generated reports.
- **Stamping:** every report is stamped with the data snapshot time, filters used, and a provenance legend.

### 4.12 Admin pages
- **Demo Bookings:**
  - Count tabs: New · Contacted · Scheduled · Completed · Cancelled.
  - Table: reference, name, organisation, preferred slot, submitted, status.
  - Detail drawer with status change and internal notes.
- **Users & Roles:** user table, invite or create, role select, deactivate (with a confirmation dialog).
- **Model Registry:** one card per model with ID, version, artifact path, purpose, input and output schema (expandable JSON), preprocessing version, status (Ready / Needs training / Blocked), and last validation date.
- **Audit Log:** filterable table (user, action, entity, time, IP). Read-only.

### 4.13 Settings
Profile, password change, theme, table density, notification preferences.

---

## 5. Widget specifications

### 5.1 KPI card
- **Size:** about 280×116px, 1px border, 16px padding.
- **Layout:**
  - Row 1: overline label and provenance chip on the right.
  - Row 2: value (kpi token) and unit.
  - Row 3: delta vs. prior period (▲ or ▼ with a text label, coloured by whether the change is good, not by its direction) and an optional 24px sparkline.
- **Clickable:** goes to a filtered list.
- **States:** skeleton; "Not available" (hatched, with a reason tooltip); error.

### 5.2 Provenance badge
- A pill with icon and label, using the §2.1 provenance tokens and border styles.
- Tooltip: source ("Model nlp-category v1.2, 2026-11-23 14:02") or the rule definition.
- It is used everywhere a value is displayed whose origin is not obvious.

### 5.3 Prediction Result Panel (the core AI widget)
```
┌ MODEL PREDICTION (dashed violet border) ────────────────────────┐
│ Status: Completed · Prediction ID PRD-000123 · 2026-11-23 14:02   │
│ Model: <name> v<version> · preprocessing v<x>                    │
│ Predicted category:  Packaging defect                              │
│ Confidence: 0.71 ▓▓▓▓▓▓▓░░░ "Moderate" (only if the model gives      │
│   calibrated probabilities; otherwise: "Model provides no         │
│   confidence score")                                              │
│ Other candidates: Labelling 0.18 · Contamination 0.06 (if given)    │
│ Key input factors: top terms (only if the model exposes them)      │
├ SIMILAR HISTORICAL COMPLAINTS (similarity evidence) ─────────────┤
│ 5 rows: ID · date · recorded category · similarity score · open   │
├ RECOMMENDED NEXT STEP ───────────────────────────────────────────┤
│ "Review against similar cases; confirm or correct the category."  │
├ LIMITATIONS ─────────────────────────────────────────────────────┤
│ From the ML audit: training data period, classes covered, etc.    │
├ HUMAN REVIEW: Pending  [Confirm] [Reject] [Correct…]          │
└──────────────────────────────────────────────────────────────────┘
```
- **Low-confidence behaviour:** below a threshold set in the model registry, the panel shows an amber "Uncertain prediction: manual classification recommended" banner.
- **Insufficient-data behaviour:** the panel is replaced by an *Insufficient data* card that names the missing fields.
- **After review:** the badge switches to "Human verified" (green, solid) and the original prediction stays visible in history.

### 5.4 Data table
- Built on TanStack Table.
- Features: sticky header, sortable, resizable, column chooser, density toggle, server pagination, row hover `#EAEFF3`, selected row `#EFF8FB` with a 2px left border `#0B6A87`.
- Numeric and date columns are right-aligned and tabular. IDs are mono.
- Empty state: an illustration-free icon, a message, and a clear-filters action.

### 5.5 Filter bar
- Inline controls on desktop: search 280px, then popover multi-selects with search and counts.
- Active-filter chips underneath.
- Below md it collapses to "Filters (n)", which opens a bottom sheet.
- Filter state lives in the URL.

### 5.6 Chart card
- Built with **Recharts** (its React fit is better and its bundle lighter than Plotly).
- Card: header with title, subtitle (period) and a provenance chip; a menu (export, definition); 280px chart height (220 on mobile).
- **Chart rules:**
  - No 3D, no pies with more than 4 slices, and no dual axes, except the Pareto cumulative line.
  - Horizontal grid lines only, in `#EAEFF3`.
  - Direct labels where possible.
  - Tooltip shows exact values and N.
  - Every chart comes with an accessible data table toggle.
- The dataviz skill will be applied before any chart code is written.

### 5.7 Status, severity and stage
- **Status pill:** semantic tokens, 22px tall, caption text.
- **Stage stepper:** completed (filled petrol with a check), current (ring), future (graphite-300), blocked (danger). On mobile it collapses to "Step 3 of 7 · Investigation" with a dropdown.

### 5.8 Alerts and notifications
- **Toast:** top-right, auto-dismisses after 5s. Errors persist until dismissed.
- **Inline banner:** info, warning, danger or demo, placed at the top of a page or card.
- **Bell drawer:**
  - Unread count.
  - Items: prediction awaiting review, import finished or failed, CAPA overdue, new demo booking (admin).
  - Notifications are persisted server-side.
- **Admin email:** new demo bookings email the admin through configured SMTP. No Telegram or other third parties.

### 5.9 Forms
- Label above the field, help text below it, and an error replacing the help text in `#B42F28` with an icon.
- Required fields marked with "*", plus an "optional" tag on optional fields.
- Built with **React Hook Form + Zod**, using the same rules as the Pydantic schemas.
- The submit button shows a spinner and blocks double-submit.
- **Confirm dialogs** for destructive or important actions: delete, deactivate user, commit import, reject prediction.

### 5.10 Upload dropzone and column mapper
- **Dropzone:** dashed 2px `#B4C0CC`, turning `#0E86A8` on drag-over. Shows accepted types and size limit.
- **Column mapper:** a two-column list of source columns, each with a target select, a match-confidence chip, and a sample value preview.

---

## 6. Responsive behaviour

Breakpoints are Tailwind defaults: sm 640, md 768, lg 1024, xl 1280, 2xl 1536. **The app is designed desktop-first** (analysts work on desktops). The public site is designed mobile-first.

| Element | ≥xl | lg | md | <md |
|---|---|---|---|---|
| Sidebar | 248px expanded | 248px (collapsible) | 64px icon rail with tooltips | Off-canvas drawer via hamburger |
| KPI strip | 6 or 4 columns | 3 columns | 2 columns | 1 column, horizontal scroll-snap for 4 or more |
| Chart grid | 2-up (or 8/4) | 2-up | 1-up | 1-up, 220px tall |
| Detail pages | Main 8 + rail 4 | Main 8 + rail 4 | Stacked, rail cards after main | Stacked; key facts first |
| Tables | Full | Hide low-priority columns | Column chooser defaults reduced | **Card list** (ID, status, severity, product, date) (Focus2Work pattern) |
| Filter bar | Inline | Inline, wraps | "Filters (n)" | Bottom sheet |
| Stepper | Full horizontal | Full | Compact labels | "Step n of N" dropdown |
| Upload wizard | Full | Full | Full | Mapping becomes stacked cards |
| Marketing module selector | List + panel | List + panel | Accordion | Accordion |

- Touch targets are at least 44px below md.
- No horizontal page scroll at 360px width.
- Verification follows CLAUDE.md §20: Playwright screenshots of every page, full page at 1440×900 and 390×844, inspected and fixed before anything is reported done.

---

## 7. Frontend stack and structure (confirmed)
- React 18, Vite, TypeScript, Tailwind CSS (tokens via CSS variables).
- React Router, TanStack Query (server state), TanStack Table, React Hook Form + Zod, Recharts, Lucide icons, Radix UI primitives (dialog, popover, dropdown, tabs) for accessibility.
- Structure follows CLAUDE.md §6: `frontend/src/{components/ui, components/domain, pages, layouts, services, hooks, types, utils, charts, theme}`.
- No justification exists for another stack, because the repo is empty.

## 8. Decisions I've assumed (correct me before approval if wrong)
1. **Brand.** No ABT logo or colours were supplied, so I use the graphite plus petrol palette above. If ABT has brand colours, the primary token is swapped and everything else stays.
2. **Theme defaults.** The app is light by default, with a dark toggle. The public site uses Clarity-style dark/light bands.
3. **Roles.** Admin and Analyst, per CLAUDE.md. A read-only Viewer role is optional.
4. **Public site scope.** Home, Request a demo and Login only (no pricing or about pages).
5. **Additional references.** If you send more templates, I'll add a column to the §1 table and revise only the affected elements.

## 9. Blockers and next steps after approval
- **Blocker:** the ML/NLP ZIP and the datasets are not in `c:\Users\KESHAV\Downloads\ABT`. Under CLAUDE.md §17 Phase 1, the ML audit and data audits must come before any frontend build. The final page content of AI Analysis, Root Cause, Risk and the complaint field list depends on them.
- **After approval:**
  1. Save this spec as `docs/DESIGN_SYSTEM.md` (plus `docs/NAVIGATION_AND_PAGES.md`).
  2. Once you supply the ZIP and data, run Phase 1: the ML audit and the data inventory, quality and readiness reports.
  3. Revise the gated pages to match.
  4. Then move through Phases 2–5.

## 10. Verification (when implemented)
- Programmatic WCAG contrast check of all token pairs in both themes. Dataviz palette validator for the chart colours.
- Playwright desktop and mobile full-page screenshots of every route, inspected for overflow, spacing and missing states.
- Component tests (Vitest + Testing Library): ProvenanceBadge variants, PredictionResultPanel with no-confidence, low-confidence and insufficient-data cases, the table-to-card switch, and form validation.
- An end-to-end Playwright run of new complaint → AI result → review, and of the demo booking flow, kept separate.

Project status: design specification drafted for approval. Repository contains only CLAUDE.md. ML ZIP and datasets not yet supplied (blocker for Phase 1). No implementation started.

---

## 11. Amendments made during implementation (2026-11-23)

**Product name:** CauseLine (approved by the project owner).

**A. Chart palette - corrected after running the dataviz validator.** The approved 8-colour palette **failed** (grey slot below the chroma floor; grey↔blue normal-vision ΔE 8.9). An exhaustive search over orderings found this order, which passes every check with no warnings:

| Slot | Light (vs #FCFCFB) | Dark (vs #1A2530, validated separately) |
|---|---|---|
| 1 | `#0E86A8` | `#2A9EC2` |
| 2 | `#D0622A` | `#D9733A` |
| 3 | `#5B3FC4` | `#8169E0` |
| 4 | `#1F7A45` | `#2F9A5C` |
| 5 | `#2A62A0` | `#4F86CF` |
| 6 | `#8C6D1F` | `#A8873A` |
| 7 | `#C2367A` | `#D3518C` |
| Other | `#8696A7` | `#5B6B7B` |

Worst adjacent CVD ΔE 10.1 (light) / 10.5 (dark); normal-vision floor 18.1 / 20.3; all ≥ 3:1 contrast. Grey is no longer a series colour - it means "Other / outside vital few" only.

**Conflict with §2.1 ("violet reserved for model output") and resolution:** no ordering of the six remaining hues passes without violet. Violet therefore appears as chart series 3. Model output is still identified by the provenance badge **text + icon + dashed border**, never by colour alone, so the rule's purpose (never mistaking a prediction for a fact) holds.

**B. Severity colours in charts** use a single-hue ordinal ramp (`#9FD0E0` Routine → `#0E86A8` Major → `#083F52` Critical) instead of the red/amber status colours, which stay reserved for status pills. **Pareto** charts plot share and cumulative share on one 0–100% axis (no dual axis).

**C. New provenance token - "Historical model output"** (`#6B4F2A` on `#F6EFE4`, dashed `#D8C4A3`, history icon) for pre-computed outputs shipped with the ML package, so they are not confused with live predictions.

**D. KPI card layout:** provenance badge moved from the top-right corner to the card footer (the corner position clipped on 6-column rows).
