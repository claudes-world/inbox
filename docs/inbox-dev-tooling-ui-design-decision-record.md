# Inbox Dev Tooling — UI Design Decision Record

**Status:** Pending decisions
**Context:** Merging `inbox-ui-specifics-plan.md` with `inbox-ui-pages-and-ux-plan-v1.md` revealed two genuine divergences that need explicit decisions before screen specs are frozen.

-----

## Decision 1: Reader layout — inline metadata vs right rail

### The two options

**Option A — Inline metadata (current demo, original plan)**

```
┌─────────────────────────────────────────────┐
│  [urgency]                                  │
│  Subject headline (Fraunces, large)         │
│                                             │
│  FROM    PM Bot · pm-bot@agents.local       │
│  TO      [chip] [chip] [chip]               │
│  SENT    2024-04-10 14:00 · 4 min ago       │
│  ───────────────────────────────────────    │
│                                             │
│  Body text full width here. Prose reads     │
│  cleanly at a comfortable measure...        │
│                                             │
│  DELIVERY SOURCES                           │
│  [source breakdown panel]                   │
│                                             │
│  ENGAGEMENT TIMELINE                        │
│  [timeline strip]                           │
│                                             │
│  REFERENCES (2)                             │
│  [reference list]                           │
│                                             │
│  THREAD CONTEXT (3)                         │
│  [thread nodes]                             │
└─────────────────────────────────────────────┘
```

**Option B — Right rail metadata (from page plan §7.3)**

```
┌───────────────────────────────┬────────────┐
│  Subject headline             │  METADATA  │
│                               │            │
│  Body text at a narrower      │  From      │
│  measure because the right    │  To        │
│  rail consumes horizontal     │  Sent      │
│  space. Reads fine for a      │            │
│  dense operator view but      │  SOURCES   │
│  may feel cramped for long    │  ──────    │
│  prose.                       │            │
│                               │  TIMELINE  │
│  [thread preview inline]      │  ──────    │
│                               │            │
│  [action footer]              │  REFS      │
│                               │  ──────    │
│                               │            │
│                               │  DEBUG     │
└───────────────────────────────┴────────────┘
```

### Trade-offs

|Aspect                                               |Inline (A)                             |Right rail (B)                           |
|-----------------------------------------------------|---------------------------------------|-----------------------------------------|
|Body measure                                         |Full width, prose reads well           |Narrower, cramped for long bodies        |
|Metadata scannability                                |Must scroll to find metadata below body|Always visible while reading             |
|Mental model match                                   |Gmail / Outlook / Apple Mail           |Linear / Notion / Jira                   |
|Fits the “bland is good for inbox surfaces” principle|Yes — familiar                         |Less so — feels like a SaaS tool         |
|Vertical space efficiency                            |Better for short messages              |Better for long messages                 |
|Thread context placement                             |Natural bottom-of-page flow            |Needs its own section, right rail is full|
|Debug rail integration                               |Has to live in a drawer                |Can live inline in the right rail        |
|Fixture-validated (screenshot reviewed)              |**Yes** — built and reviewed           |No                                       |

### Recommendation

**Adopt Option A (inline metadata) as the default for the reader.**

Reasoning:

1. The per-page plan itself states “bland is good for inbox surfaces” and “familiarity lowers cognitive load” (§1.2). Inline metadata is the email convention the user already knows; right rail is the SaaS convention that breaks the mental model match.
1. The body measure matters. Messages can be long, and a right rail narrowing the body column to ~520px creates awkward line lengths for prose.
1. The reader screen is already built and screenshot-reviewed in Option A. It works visually. Switching to B without a matching screenshot pass means adopting an unreviewed layout.
1. Right-rail metadata has a legitimate home: the **conversation inspector** (debug class), where the visibility matrix + participants timeline + anomalies naturally want a side rail. Use right-rail there, use inline here.

**Overrideable exception:** if the reader is opened inside a modal/drawer (e.g., from the conversation inspector deep-link), use a compact inline variant that collapses metadata into a two-column header block above the body. Still no right rail.

### Status

**Proposed: Option A.** Awaiting confirmation.

-----

## Decision 2: Fetch button location — global top bar vs per-screen

### The two options

**Option A — Per-screen fetch bar (original plan)**
Every page has its own fetch bar near its filter row. No global fetch button in the top bar.

```
top bar:      [brand] [nav] [search] [identity] [env]
page header:  [title] [filters] [FETCH DATA] [debug]
```

**Option B — Global top-bar fetch button (page plan §2.2)**
The fetch button lives in the top bar and operates on the current page’s primary query. No per-screen fetch button.

```
top bar:      [brand] [nav] [FETCH DATA] [sync chip] [search] [identity] [env]
page header:  [title] [filters]
```

**Option C — Both: global default + per-screen overrides**
The top bar has a global fetch button that operates on the current page’s primary query. Heavy debug pages with multiple queries (OTEL explorer, conversation inspector) additionally get contextual fetch buttons inside the page for secondary queries.

```
top bar:      [brand] [nav] [FETCH DATA primary] [sync chip] [search] [identity] [env]
page header:  [title] [filters]
(debug pages also have inline fetch buttons per panel where needed)
```

### Trade-offs

|Aspect                                                            |Per-screen (A)                             |Global (B)                     |Both (C)                                |
|------------------------------------------------------------------|-------------------------------------------|-------------------------------|----------------------------------------|
|Matches the user’s original request (“a button to fetch the data”)|Partial — many buttons                     |Yes — one obvious place        |Yes — with per-panel exceptions         |
|Discoverability                                                   |Low — button location varies               |High — always same place       |High for primary, flexible for secondary|
|Heavy debug pages with multiple queries                           |Natural fit                                |Can’t trigger secondary queries|Handles both                            |
|Top bar density                                                   |No extra controls                          |+1 button +1 chip              |+1 button +1 chip                       |
|Signals “this is the action for this page”                        |Yes                                        |Yes — via title context        |Yes                                     |
|Consistency with the sync state chip                              |Chip would also need to be per-page (messy)|Chip fits naturally            |Chip fits naturally                     |

### Recommendation

**Adopt Option C (both).**

Reasoning:

1. The global top-bar button is the cleanest answer to “I want a button to fetch the data” — one obvious place, same shortcut, same visual state, every page.
1. The sync state chip has seven states and needs a single home. It belongs next to the global fetch button in the top bar.
1. Heavy debug pages like the OTEL explorer (which has traces + spans + events as separate queries) and the conversation inspector (which has canonical tree + visibility matrix + anomalies as separate queries) genuinely need secondary per-panel fetch controls. Not giving them that would be artificially restrictive.
1. Option B alone would force debug pages into awkward “fetch everything or nothing” behavior. Option C preserves that when it’s useful and allows granularity when it’s not.

**Rule for when a page gets its own fetch bar:**

- Default: no. The global button handles it.
- Exception 1: the page has multiple independent queries that update independently (OTEL tabs, conversation inspector panels).
- Exception 2: the page has a “run query” semantic that’s more than a refresh (sandbox scenario run, compose dry-run, graph recompute). These are semantically different actions and get their own labeled buttons.

### Status

**Proposed: Option C.** Awaiting confirmation.

-----

## What changes if decisions are accepted

If both recommendations are accepted:

1. **`inbox-ui-specifics-plan.md` v2** stays as-is. Its §4 already describes the global fetch button + sync state chip + heavy-debug-page exception.
1. **`inbox-ui-pages-and-ux-plan-v1.md`** needs two small edits:
- §7.3 (message reader) — replace the right-rail layout with the inline metadata layout, or note that right-rail is the secondary variant used only in drawer/modal contexts
- §7.15 (OTEL explorer), §7.12 (conversation inspector), §7.25/7.26 (sandbox pages), §7.4 (compose) — keep their per-page fetch bars, explicitly noted as “secondary fetch controls, global top-bar button still applies to primary query”
1. **The existing inbox list demo** is already Option A + Option C compatible. No demo changes needed.
1. **Per-page specs for the 26 screens** in the page plan get one of two markers per screen:
- `[uses global fetch]` — no per-page fetch bar
- `[has secondary fetch controls]` — global plus contextual per-panel buttons

-----

## Decision log

|Decision                       |Date      |Proposed|Accepted|Notes                                                      |
|-------------------------------|----------|--------|--------|-----------------------------------------------------------|
|Reader layout — inline metadata|2026-04-10|Option A|pending |Matches Gmail convention; screenshot-validated             |
|Fetch button location — both   |2026-04-10|Option C|pending |Global default + per-panel exceptions for heavy debug pages|