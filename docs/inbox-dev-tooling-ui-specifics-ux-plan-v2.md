# Inbox Dev Tooling — UI Specifics & UX Plan v2

**Status:** Working design plan (v2 — merged with per-page UX plan)
**Companion to:** `inbox-implementation-plan.md` (build order, layer discipline), `inbox-ui-pages-and-ux-plan-v1.md` (per-page UX specs for all 26 screens)
**Purpose:** Define the concrete visual system, interaction patterns, validation, fetching/caching, error handling, and debug surfaces that every screen inherits. Build agents reference this doc when implementing any screen; for screen-level layout and UX specifics, they reference the per-page UX plan.

**Role split with the per-page UX plan:**

- **This doc** = the system/primitives layer. Token system, field state machines, exact debounce numbers, cache key strategy, error boundary patterns, keyboard shortcuts, a11y floor, Storybook discipline, cross-screen UX rules.
- **Per-page UX plan** = the per-screen specs. The 26 individual screens with their layout, controls, interactions, and edge cases.

When a build agent picks up “the inbox list page,” they read the per-page section for what’s on the screen, and this doc for how the tokens, validation, fetching, and errors work.

-----

## 1. Design Theme: “Operator’s Console”

The aesthetic is **industrial-editorial**. Bloomberg terminal × print magazine. High information density without becoming a wall of text. Serif headlines convey gravitas; monospace and clean sans convey technical precision. Borders not shadows. Sharp corners not bubble UI.

Every choice serves three goals: **legibility**, **scannability**, **trust**.

### Type system

```css
/* Display — page titles, screen headers, KPI labels */
@font-face { Fraunces (variable, opsz + soft axes); }

/* UI / body — every interface element */
@font-face { Geist Sans (variable weight); }

/* Mono — IDs, addresses, code, timestamps, JSON */
@font-face { Geist Mono (variable weight); }
```

**Fraunces** is a modern variable serif with character. We use the optical-size axis to slim it at large sizes (display) and beef it at small sizes (table headers). The “soft” axis stays around 50 — neither bone-hard nor decorative.

**Geist Sans** is technical-interface sans. Sharp at small sizes, true variable weight, paired with Geist Mono by the same designers. Both are open-source from Vercel.

**No Inter, no system fonts.** Default fonts are the visual equivalent of unflavored oatmeal. Fraunces + Geist gives us distinctive without weird.

### Type scale

```css
--text-xs:    0.6875rem; /* 11px — table micro-text, badges */
--text-sm:    0.8125rem; /* 13px — UI default for dense surfaces */
--text-base:  0.9375rem; /* 15px — body text, normal density */
--text-lg:    1.0625rem; /* 17px — emphasized rows, KPI numbers */
--text-xl:    1.375rem;  /* 22px — section titles */
--text-2xl:   1.75rem;   /* 28px — screen titles */
--text-3xl:   2.25rem;   /* 36px — display KPIs */
--text-4xl:   3rem;      /* 48px — splash KPIs only */

--leading-tight: 1.15;
--leading-snug:  1.35;
--leading-normal: 1.5;

--tracking-tight: -0.015em;
--tracking-normal: 0;
--tracking-wide:  0.04em;
```

Numbers always use `font-variant-numeric: tabular-nums`. Tracking goes wide for caps/labels (`text-xs uppercase tracking-wide`), tight for display headlines.

### Color tokens

The full palette lives in CSS variables. Engagement state colors are **frozen** and identical across every screen — same color = same meaning, everywhere.

```css
:root {
  /* Surface */
  --surface-base:    #FAFAF7;  /* warm off-white, the page bg */
  --surface-raised:  #FFFFFF;  /* cards, panels */
  --surface-sunken:  #F2F2EC;  /* table headers, hover, secondary panels */
  --surface-overlay: rgba(14, 14, 14, 0.6); /* modal backdrop */

  /* Text */
  --text-primary:   #0E0E0E;
  --text-secondary: #5A5A55;
  --text-tertiary:  #8A8A82;
  --text-inverse:   #FAFAF7;

  /* Borders — hairlines */
  --border-subtle:  #E8E8E0;
  --border-default: #D4D4CC;
  --border-strong:  #1A1A1A;

  /* Brand */
  --brand-ink:   #0E0E0E;
  --brand-paper: #FAFAF7;

  /* Engagement states (FROZEN — same colors everywhere) */
  --state-unread:       #1F4FE6;  /* cobalt */
  --state-read:         #8A8A82;  /* neutral */
  --state-acknowledged: #2D6B3E;  /* forest */
  --state-hidden:       #B4B4AC;  /* muted */

  /* Address kinds */
  --kind-agent:   #00838F;  /* deep cyan */
  --kind-human:   #C2410C;  /* burnt orange */
  --kind-service: #6D28D9;  /* deep violet */
  --kind-list:    #B45309;  /* amber */

  /* Environments */
  --env-local:        #5A5A55;
  --env-dev:          #1F4FE6;
  --env-staging:      #B45309;
  --env-prod:         #B91C1C;  /* danger */
  --env-experimental: #6D28D9;

  /* Semantic */
  --semantic-success: #2D6B3E;
  --semantic-warning: #B45309;
  --semantic-danger:  #B91C1C;
  --semantic-info:    #1F4FE6;

  /* Highlight (god-mode visibility annotation) */
  --highlight-bg:     #FFF7D6;  /* warm yellow tint, low saturation */
  --highlight-border: #E8C657;
}

[data-theme="dark"] {
  --surface-base:    #0E0E0E;
  --surface-raised:  #161616;
  --surface-sunken:  #080808;
  --text-primary:    #FAFAF7;
  --text-secondary:  #A0A099;
  --text-tertiary:   #6A6A62;
  --border-subtle:   #1F1F1F;
  --border-default:  #2A2A2A;
  --border-strong:   #FAFAF7;
  --highlight-bg:    rgba(232, 198, 87, 0.12);
  --highlight-border: #E8C657;
  /* state and kind colors stay the same — they're meaningful */
}
```

### Spatial system

```css
--space-0: 0;
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.5rem;    /* 24px */
--space-6: 2rem;      /* 32px */
--space-7: 3rem;      /* 48px */
--space-8: 4rem;      /* 64px */

--radius-sm:  2px;
--radius-md:  4px;     /* default for interactive elements */
--radius-lg:  6px;     /* cards, panels */
--radius-pill: 9999px; /* state badges only */
```

**Sharp corners are the default.** No `rounded-2xl` bubble UI. Pills only for state badges. Cards get 6px max.

### Motion

```css
--duration-instant: 80ms;
--duration-fast:    160ms;
--duration-medium:  240ms;
--duration-slow:    400ms;

--ease-out:    cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

- Hover/focus: instant or fast
- Panel reveals, popovers: medium with ease-out
- Page transitions: **none**. Don’t fade pages. Don’t slide pages. Render them.
- Replay scrubber: real-time, no easing — it represents actual time

-----

## 2. Layout System

### App shell grid

```
┌──────────────────────────────────────────────────────────────┐
│  TOP BAR (56px)                                              │
│  brand · primary nav · view-scope · send-id · env · search   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  LEFT RAIL │  MAIN CONTENT                                   │
│  (240px)   │                                                  │
│            │                                                  │
│  folders   │                                                  │
│  sub-nav   │                                                  │
│            │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

- Top bar: fixed 56px, `border-b border-subtle`, no shadow
- Left rail: 240px default, collapsible to 56px (icon-only) at narrow widths
- Main content: fluid, max-width depends on screen — tables and lists go full-width, prose-shaped content caps at ~880px

### Screen layouts (three patterns cover most screens)

**A) Three-column mail (split reading pane)**

```
┌──────────┬──────────────┬──────────────────┐
│  LEFT    │  LIST        │  READING PANE    │
│  RAIL    │  (320-420px) │  (fluid)         │
└──────────┴──────────────┴──────────────────┘
```

Used by: Inbox List, Conversation Inspector (with tree on left, details on right).

**B) Full-width table**

```
┌──────────┬─────────────────────────────────┐
│  LEFT    │  FILTER BAR                     │
│  RAIL    ├─────────────────────────────────┤
│          │  TABLE (full width)             │
│          │                                  │
│          │                                  │
└──────────┴─────────────────────────────────┘
```

Used by: Agent Directory, Search results, Command Run history, OTEL events.

**C) Section cards**

```
┌──────────┬─────────────────────────────────┐
│  LEFT    │  PAGE HEADER                    │
│  RAIL    ├─────────┬───────────┬───────────┤
│          │  KPI    │  KPI      │  KPI      │
│          ├─────────┴───────────┴───────────┤
│          │  SECTION CARD                    │
│          ├─────────────────────────────────┤
│          │  SECTION CARD                    │
│          └─────────────────────────────────┘
```

Used by: Dashboards, Agent Profile, Settings.

### Breakpoints

```css
--bp-sm:  640px;   /* phone landscape */
--bp-md:  900px;   /* tablet */
--bp-lg:  1200px;  /* laptop */
--bp-xl:  1600px;  /* desktop */
--bp-2xl: 1920px;  /* wide desktop */
```

This is dev tooling. Optimize for `lg` and `xl`. `md` should be functional but cramped. `sm` collapses to single-pane navigation. Below `sm` is unsupported — show a “this tool is desktop-only” message.

### Density modes

Two density modes per screen, persisted in user prefs:

- **Comfortable** (default): `--row-height: 40px`, `--cell-padding-y: 10px`
- **Compact:** `--row-height: 28px`, `--cell-padding-y: 6px`

Density toggle lives in the user prefs dropdown, not per-screen.

**No third density mode.** Comfortable + compact only. Adding a third makes layouts impossible to test and confuses users.

-----

## 2A. Page Classes

Every screen belongs to exactly one of four classes. The class determines default density, default chrome weight, and how much canvas the page gets.

### Operator class

Pages an operator uses daily to get work done.

- Inbox list, Reader, Compose, Agent directory, Agent profile, Executive dashboard
- **Default density:** comfortable
- **Chrome:** minimal — the content is the point
- **Validation weight:** standard
- **Feels like:** a calm, familiar email client

### Debug class

Pages used to investigate, trace, and understand system state.

- Conversation inspector, Thread view, OTEL explorer, Raw event inspector, Command runs, API debug viewer, Search
- **Default density:** compact
- **Chrome:** denser — filters, tabs, raw-response toggles, inspector rails
- **Validation weight:** lighter (most are read-only)
- **Feels like:** a developer console — high information density, multiple panes, keyboard-heavy

### Visualization class

Pages that need canvas space for graphs, timelines, and replays.

- Communication graph, Replay mode, Workflow dashboard, Incident review
- **Default density:** comfortable (but canvas dominates the layout)
- **Chrome:** minimal side rails, maximum canvas
- **Validation weight:** standard (most inputs are filters and time ranges)
- **Feels like:** an observability tool — the visualization is the primary surface, controls wrap around it

### Admin class

Pages that mutate system state and must prevent mistakes.

- System configuration, Config explorer, Feature flags, Important links, Sandbox scenario library, Sandbox run results, Agent editor, List membership editor
- **Default density:** comfortable
- **Chrome:** heavy — validation strips, diff panels, impact previews, confirmation dialogs
- **Validation weight:** maximum — every field validated, every save gated, every destructive action confirmed
- **Feels like:** a controlled form — edit, validate, preview diff, confirm, save

### Why this matters

Without a class hierarchy, every screen drifts toward the same visual weight and density, and the app loses the ability to signal “this is a calm reading surface” versus “this is a dense debug view.” A build agent implementing a screen should first identify its class, then inherit the class defaults, then add screen-specific overrides.

-----

## 3. Validation Patterns

**Every input field has explicit validation, every form has a clear submit gate.** No silent failures. No “the button just doesn’t work” mystery.

### Validation layers

1. **Type-level** — Zod schemas at the contract boundary. Always.
1. **Field-level** — synchronous validation as the user types. Debounced 200ms.
1. **Form-level** — cross-field validation (e.g., “to or cc must have at least one entry”). Runs on blur and on submit attempt.
1. **Server-level** — the BFF dry-run endpoint. Used for compose, where server-side validation produces the warning list and resolution preview.

### Field state machine

Every input has these visual states:

```
empty (untouched) → focused → typing → debouncing → validated
                                              ↓        ↓
                                          invalid    valid
```

- **Empty/untouched**: subtle placeholder, default border
- **Focused**: border becomes `--border-strong`, no shadow
- **Typing**: small loading dot top-right while debounce timer ticks
- **Validated invalid**: border `--semantic-danger`, error message below in `text-xs`, error icon
- **Validated valid**: border returns to default. **Do not turn every field green just because it has text.** The success state is reserved for fields where positive confirmation carries real information — address autocomplete resolving a known recipient, a dry-run passing, a password strength meter crossing a threshold. A filled-in subject line is not an accomplishment.

### Error messages

- Always one line if possible
- Always actionable: “Address must be local_part@host” not “Invalid format”
- Always positioned directly below the field
- Always `text-xs` `text-semantic-danger`
- Never use red border alone — colorblind users need the icon + message too

### Submit button gating

The primary action button is disabled until:

- All required fields have valid values
- All async validation has completed
- No outstanding warnings the user hasn’t acknowledged

When disabled, hover shows a tooltip listing what’s blocking submit. **Never** disable a button silently — the user must always be able to discover why.

### Special case: compose

Compose has live dry-run validation. As the user types recipients, debounced 300ms after last keystroke, the dry-run endpoint runs and the expansion preview panel updates. The submit button gates on `dryRunResult.validation.ok === true`.

-----

## 4. Fetching, Loading, and Caching

### The global fetch button

The top bar owns a **global Fetch Data button** as a first-class control, always visible. It operates on the current page’s primary query. This answers the original requirement for “a button to fetch the data” — one obvious place, same pattern everywhere.

**States:**

|State                      |Label                  |Visual                                                             |
|---------------------------|-----------------------|-------------------------------------------------------------------|
|Idle (no request in flight)|`Fetch data`           |Default button                                                     |
|Pending                    |`Fetching…`            |Button disabled, inline spinner, timer starts                      |
|Success (brief dwell)      |`Fetched 14:03:27`     |2s dwell, then back to `Fetch data`                                |
|Error                      |`Fetch failed`         |Red accent, sticks until next attempt                              |
|Rate-limited               |`Cooldown 3s`          |Disabled with countdown tooltip                                    |
|Stale query                |`Fetch data ·` with dot|Subtle stale indicator when current form state ≠ last fetched state|

**Rules:**

- Debug/visualization pages do **not** auto-fetch on mount — the button is the trigger
- Operator pages (inbox list, agent directory) may auto-fetch on first mount but the button is still visible and useful for manual refresh
- Repeated clicks while a request is in flight are ignored, not queued
- The button reflects the *primary* query of the current page; heavy debug pages with multiple queries get additional contextual fetch bars inside the page, but the global button still refreshes the primary one

### Global sync state chip

A single sync chip lives next to the fetch button, always visible. Seven states:

|State               |Tooltip                                                               |
|--------------------|----------------------------------------------------------------------|
|`Idle`              |“Nothing to fetch yet.”                                               |
|`Ready`             |“Live data loaded. No pending fetches.”                               |
|`Fetching`          |“Request in flight.”                                                  |
|`Cached`            |“Showing cached response from 14:03:27. Click Fetch data to refresh.” |
|`Stale`             |“Current filters differ from last fetch. Click Fetch data to refresh.”|
|`Error`             |“Last fetch failed. Click for details.”                               |
|`Offline cache only`|“Persistent storage unavailable. Cache survives until tab close only.”|

The chip is the fastest way to answer “what am I looking at right now?” No screen should require the user to guess whether data is fresh.

### Cache key strategy

Every fetched query has a deterministic cache key derived from:

- The endpoint path
- The full request body (filters, pagination, context)
- The active environment

Same key = same response (cached). Different key = different cache entry.

### Cache layers

Three cache layers, used in this order:

1. **In-memory** (TanStack Query default) — fast, lost on refresh
1. **IndexedDB** — persisted between refreshes, bigger budget, async
1. **localStorage** — fallback when IndexedDB is unavailable, ~5MB budget, sync
1. **None** — final fallback, in-memory only, app still works

The cache adapter probes for IndexedDB on app boot:

```ts
async function selectCacheAdapter(): Promise<CacheAdapter> {
  if (await indexedDBAvailable()) return new IndexedDBAdapter();
  if (localStorageAvailable()) return new LocalStorageAdapter();
  return new InMemoryOnlyAdapter();
}
```

The probe is wrapped in try/catch. The app must **never** crash because storage is unavailable. It should log the chosen tier, then continue.

**When persistence is unavailable:** show a single mild warning once in the debug drawer and settings page. Do not flood console or UI with repeating warnings. The sync chip shows `Offline cache only` to signal the degraded state.

### Stale-while-revalidate

When a cached response exists for a key:

1. Render the cached data immediately
1. Sync chip shows `Cached`
1. Re-fetch in the background (if auto-fetch applies for this page class)
1. When the new response arrives, swap silently with a 240ms cross-fade, sync chip flips to `Ready`

If the user clicks “Fetch data,” skip the cache and force a fresh fetch with a visible loading state.

### Debounce and rate limits

- **Text input that triggers a fetch**: 300ms debounce
- **Filter chips, dropdowns**: 100ms debounce (gives the user time to click multiple)
- **Slider inputs**: 200ms debounce
- **Hard rate limit**: no endpoint may be called more than 5 times in 2 seconds from a single screen — exceeding throws the request into a queue and shows a small “throttled” badge

### Loading states (the rule of three)

Every fetched view has three loading representations:

1. **First load (no cache)** — full skeleton placeholder matching the final layout. Show within 50ms.
1. **Background refresh (have cache)** — render cached data + small “refreshing” indicator. No skeleton.
1. **Long load (>2 seconds)** — skeleton + a subtle “still working…” line below. At 8 seconds, add a “cancel” button.

Skeletons are gray rectangles matching the final dimensions of cells, headers, panels. They use a 1.6s pulse animation (`opacity: 0.4 → 0.7 → 0.4`).

### Empty states

Empty states are honest and direct. No friendly illustrations. No “Oops!” copy.

```
┌─────────────────────────────────────┐
│                                     │
│    No messages match these filters  │
│                                     │
│    [Clear filters]                  │
│                                     │
└─────────────────────────────────────┘
```

Centered, `text-secondary`, with at most one helpful action button.

### Status messages and visual affordances

The user must never wonder if the app is alive. Three feedback channels:

1. **Inline status** — primary feedback channel. Lives next to the action that triggered it. Buttons show “Saving…” → “Saved ✓” → fade after 2s.
1. **Toast** — for confirmations of out-of-context actions and async failures. Top-right. Auto-dismiss success after 4s, errors stick until clicked.
1. **Status bar** (bottom of app shell, 24px tall) — shows the current connection state, last sync time, active environment, and any background activity. Always visible.

### Optimistic updates

Mutations (ack, hide, unhide, update profile) use optimistic updates:

1. UI updates immediately
1. Request fires
1. On success: silent confirmation (small ✓ flash)
1. On failure: rollback + inline error + retry button

-----

## 5. Error Handling

**No silent errors. Every failure has a UI representation.**

### Error categories

|Category                     |UX response                                                                                 |
|-----------------------------|--------------------------------------------------------------------------------------------|
|Network failure (fetch threw)|Inline error card with retry button + raw error in expandable details                       |
|Server error 5xx             |Same as network failure, plus “report this” link if telemetry enabled                       |
|Server error 4xx             |Render the BFF error envelope’s `code` + `message` directly. The codes are stable.          |
|JSON parse failure           |Show raw response text in a `<pre>` block + parse error message + “copy raw response” button|
|Schema validation failure    |Show “BFF returned data the client can’t understand” + raw response + Zod error + “copy”    |
|Timeout                      |Same as network failure with “the request took longer than 30 seconds”                      |
|Offline                      |Status bar turns red, all fetch buttons disabled, last cached data still browsable          |

### The raw response fallback

This is critical. **If JSON parse or schema validation fails, the user must always be able to see the raw response.** The pattern:

```tsx
<ErrorCard
  title="Could not parse response from /api/v1/inbox/list"
  message={parseError.message}
>
  <details>
    <summary>Raw response (1.2 KB)</summary>
    <pre className="font-mono text-xs">{rawText}</pre>
    <button>Copy raw response</button>
  </details>
</ErrorCard>
```

### Error boundary

A top-level React error boundary catches any uncaught render errors. It shows:

- The error message
- The component stack
- A “reset to last good state” button (clears the affected query’s cache and re-renders)
- A “reload app” button as the nuclear option

### Validation errors vs server errors

Distinguish them visually:

- **Validation errors** (the user can fix this) — yellow accent, calm tone, points at the offending field
- **Server errors** (the system is wrong) — red accent, “we’re looking into it” tone, expandable details

-----

## 6. The Debug Viewer

Every screen has a hidden debug drawer accessible via keyboard shortcut `cmd+shift+d` (or a `</>` icon in the bottom-right corner). The drawer slides up from the bottom and shows:

### Tabs

1. **Request** — the BFF request body that produced the current view (pretty-printed JSON)
1. **Response** — the BFF response, both the raw text and the parsed object
1. **Cache** — current cache key, age, source (memory / IndexedDB / fresh fetch)
1. **State** — relevant local state (selected view scope, send identity, environment, filter values)
1. **Errors** — any errors caught on this screen, last 50

### Debug drawer behavior

- Always available, even in production builds
- Never auto-opens
- Persists open/closed across navigations
- Resizable from the top edge
- The “copy as cURL” button on the Request tab generates a cURL command that reproduces the exact request

This is the tool you reach for when something looks wrong on screen. It’s the single most useful piece of UX in a debug-oriented app.

-----

## 7. Visual Affordances

### Hover, focus, active, disabled

Every interactive element has all four states explicitly designed.

|Element         |Default                       |Hover           |Focus                                          |Active                   |Disabled                       |
|----------------|------------------------------|----------------|-----------------------------------------------|-------------------------|-------------------------------|
|Primary button  |`bg-brand-ink text-inverse`   |`bg-opacity-90` |`ring-2 ring-brand-ink ring-offset-2`          |`bg-opacity-80`          |`opacity-50 cursor-not-allowed`|
|Secondary button|`border-default`              |`bg-sunken`     |`ring-2 ring-brand-ink`                        |`bg-sunken bg-opacity-80`|`opacity-50`                   |
|Ghost button    |transparent                   |`bg-sunken`     |`ring-2`                                       |`bg-sunken bg-opacity-80`|`opacity-50`                   |
|Table row       |none                          |`bg-sunken`     |`bg-sunken outline outline-2 outline-brand-ink`|`bg-sunken/80`           |n/a                            |
|Input           |`border-default`              |`border-strong` |`border-strong` (no ring)                      |n/a                      |`bg-sunken opacity-60`         |
|Link            |`underline-offset-4 underline`|`text-brand-ink`|`ring-1 ring-brand-ink`                        |n/a                      |n/a                            |

Focus rings are mandatory. Tab navigation must work everywhere. Never use `outline: none` without an explicit replacement.

### Cursor affordances

- Buttons, links, sortable headers: `cursor-pointer`
- Disabled: `cursor-not-allowed`
- Resizable handles: `cursor-col-resize` / `cursor-row-resize`
- Loading: `cursor-wait`
- Draggable: `cursor-grab` / `cursor-grabbing`

### Click targets

Minimum 32×32px hit area for any clickable element. Even if the visual element is smaller, pad the hit area.

### Keyboard shortcuts

Global shortcuts visible via `?` key:

|Key      |Action                              |
|---------|------------------------------------|
|`⌘K`     |Open command palette (global search)|
|`⌘⇧D`    |Toggle debug drawer                 |
|`g i`    |Go to Inbox                         |
|`g a`    |Go to Agents                        |
|`g d`    |Go to Dashboard                     |
|`g e`    |Go to Explorer                      |
|`g s`    |Go to Settings                      |
|`j` / `k`|Next / previous list item           |
|`⌘↵`     |Submit primary form                 |
|`Esc`    |Close modal / drawer                |
|`?`      |Show all shortcuts                  |

Shortcut hints appear in tooltips: `Save (⌘↵)`.

-----

## 8. Accessibility Floor

This is a tool for technical users, but accessibility is non-negotiable.

- All interactive elements reachable by keyboard
- All form fields have associated labels (visible or `sr-only`)
- All icon-only buttons have `aria-label`
- Focus indicators always visible
- Color is never the only signal — pair with icon, weight, or text
- Contrast: 4.5:1 minimum for body text, 3:1 for large text
- Skip links from top of page to main content
- ARIA live regions for status messages and async updates
- Tables use proper `<th>` semantics with `scope`
- Modals trap focus and restore focus on close

-----

## 9. Per-Screen Inheritance

Every screen spec doc inherits this entire plan by reference. A screen spec only documents:

1. What this screen is
1. Its page class (operator / debug / visualization / admin)
1. Its layout (which of the three layout patterns)
1. Its data dependencies
1. Its panels and components
1. Screen-specific interactions
1. Screen-specific edge cases

Everything else — type, color, motion, validation, fetching, errors, debug — is inherited from this plan and must not be re-invented per screen.

For the full per-screen specs of all 26 screens, see `inbox-ui-pages-and-ux-plan-v1.md`.

-----

## 9A. Cross-Screen UX Rules

Rules that apply to more than one screen but are important enough to live in the system plan rather than per-screen specs.

### Visibility matrix must preserve orthogonal state

The `VisibilityMatrixCell` contract has two independent dimensions: `engagement` (unread / read / acknowledged) and `visibility` (active / hidden). A cell can be `read AND hidden`, or `acknowledged AND hidden`.

**The UI must not collapse these two dimensions into one color.** A read-but-hidden delivery is meaningfully different from a read-and-active delivery, and the user must be able to tell them apart at a glance.

Required presentation pattern:

- Use a small stacked indicator, split badge, or two-part symbol
- The engagement dimension gets the primary color (the frozen `--state-*` tokens)
- The visibility dimension gets a secondary treatment (diagonal hatch, strikethrough, half-tone fill)
- Hover popover always shows exact state text (e.g., `"acknowledged, hidden"`), never just the symbol

This rule applies to:

- Conversation inspector visibility matrix
- Any future per-actor delivery grid
- Any heatmap where a cell represents a delivery state

### Communication graph default mode

The comm graph has three modes: force-directed, sankey/flow, matrix heatmap.

**Default on first load is matrix heatmap or ego view, not force-directed.** A force-directed graph of an unknown network is visual noise — the user can’t tell anything from a hairball. Let the user filter and narrow down first, then switch to force-directed once there’s a meaningful subset to show.

### God-mode visibility highlighting

When a view-scope actor is set, messages delivered to that actor get a subtle visual tint (warm yellow `--highlight-bg`) across inbox list, thread views, and conversation inspector. Messages without a delivery for that actor remain fully visible — no filtering, no ghost nodes, no leakage concerns.

Rule: highlight tint never fully saturates and never competes with selection state. When a row is both selected and highlighted, selection wins visually (solid background) and highlight degrades to a thin accent line on the left edge.

### Parent link handling across contexts

Every surface that renders a parent link (reader, thread node, conversation inspector) handles the same three states from `ParentLinkDisplay`:

- `visible` → clickable summary with subject
- `redacted` → neutral placeholder, not alarming (MVP god-mode should never produce this, but the UI must still handle it)
- `none` → hidden entirely, no empty chrome

-----

## 9B. Acceptance Checks

Before calling a page “good enough,” it must pass all of these. Use the list as a pre-merge checklist on every screen PR.

### Page-level acceptance (the 3-second tests)

1. Can I tell what the primary action is in under 3 seconds?
1. Can I tell whether the page is loading, cached, stale, or errored without reading labels?
1. Can I tell where the current data came from (environment, view scope, last fetch time)?
1. Are the important IDs and actions easy to copy or open?
1. Does the page still read cleanly with dense or pathological data (100+ rows, 20+ filter chips, branching threads)?
1. Does the debug surface feel integrated rather than bolted on?

If the answer to any is “no,” the page isn’t done.

### Screenshot review checklist

Every screen gets at least one screenshot at 1600×1000 and 1920×1200 against fixture data. The reviewer checks for:

1. **Chrome vs content ratio** — is actual data dominant, or is the app chrome eating the page?
1. **Color noise** — too many competing accents? Environment badge fighting the state colors? Filter chips too loud?
1. **Secondary text contrast** — can you read `--text-secondary` and `--text-tertiary` without squinting?
1. **Header space waste** — is the page title block taking more vertical space than it deserves?
1. **Table anchors** — do tables have sticky headers and scan lines? Can you track a row visually across horizontal scroll?
1. **Action button competition** — are primary, secondary, and ghost buttons visually distinct enough that the primary always wins?
1. **Debug chrome overwhelming operator tasks** — on operator pages, is the debug surface subtle enough to be ignored when not needed?

### Four questions the user must never need to ask

If the user ever asks any of these, the page has failed:

- “Is this thing stuck?”
- “What data am I looking at?”
- “Did my action actually work?”
- “Why is this error happening?”

-----

## 10. Implementation Order

This plan is implemented alongside the build phases in `inbox-implementation-plan.md`:

- **Phase 0 — Foundation:** ship the token system (§1), the app shell layout (§2), the page-class defaults (§2A), the global fetch button + sync state chip (§4), and the cache adapter probe (§4)
- **Phase 1 — Primitives:** implement validation patterns (§3) in form primitives, error display patterns (§5) in shared error components, and the loading skeleton system (§4)
- **Phase 2 — Domain tokens:** the visual affordance rules (§7) shape every domain token
- **Phase 4 — Panels:** the debug viewer (§6) ships as a panel that mounts in the app shell
- **Phase 5+ — Screens:** every screen inherits the entire plan and only documents its deviations. Cross-screen rules (§9A) enforce consistency. Acceptance checks (§9B) gate merges.

The first screen built — the inbox list with split reading pane — is the integration test for this entire plan. If it doesn’t feel right, this plan needs revision before the other 25 screens proceed.