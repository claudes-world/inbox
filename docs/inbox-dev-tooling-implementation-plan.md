# Inbox Dev Tooling — Implementation Plan

**Status:** Build plan
**Companion to:** `inbox-dev-tooling-spec-v3.md` (screen inventory), `inbox-contracts-brief-v2.md` (data contracts)
**Purpose:** Define the stack, aesthetic, library choices, folder structure, build order, and dependency rules so the UI can be built layer-by-layer without rework.

-----

## 1. Stack

### Core

- **React 18** + **TypeScript** (matches the contracts package)
- **Vite** for dev server and build (no Next.js — this is a local dev tool, no need for SSR/edge rendering)
- **TanStack Router** for routing (type-safe, file-based, plays well with TanStack Query)
- **TanStack Query** for all data fetching (handles cache, refetch, optimistic updates, and the mock/real adapter swap is one config flag)
- **TanStack Table** for data tables (headless, the right amount of power for the dozen+ tables in this app)
- **Zod** for runtime validation at the boundary (already used in `inbox-contracts`)

### Styling

- **Tailwind CSS v4** — using the new CSS-first config (`@theme` directive) wired to design tokens
- **CSS variables** for all theme values, so light/dark and per-environment tinting Just Work
- **No CSS-in-JS** (no Emotion, no styled-components — slower, harder to debug, redundant with Tailwind)

### Component primitives

- **shadcn/ui** as the primitive base layer — Radix UI under the hood, copy-paste source so we own and customize. Provides accessible Button, Dialog, Popover, Tabs, Tooltip, Toast, Select, Combobox, etc.
- We do NOT use shadcn’s defaults verbatim — we restyle aggressively to match our aesthetic

### Visualization

- **Recharts** for normal charts (line, bar, area, sankey). Battle-tested, declarative, React-native.
- **D3** (just `d3-scale`, `d3-shape`, `d3-force`) for the bespoke pieces — graph layout, replay scrubber, anomaly highlighting on timelines
- **React Flow** for the communication graph (force-directed mode). Has built-in pan/zoom/select, edge animation, and good React integration.
- **visx** as a fallback for any chart Recharts can’t do — only if needed

### Animation

- **Motion** (formerly Framer Motion) — replay scrubber, panel transitions, page-load orchestration
- Use sparingly. Dev tooling. Restraint > flash.

### Data & utilities

- **date-fns** for date formatting (lighter and more tree-shakable than dayjs/luxon)
- **clsx** + **tailwind-merge** for conditional class composition (`cn()` helper)
- **Lucide React** for icons (clean monoline, huge library, tree-shakable)
- **MSW** (Mock Service Worker) for the mock API mode — intercepts fetch requests at the network layer so the same code path runs against real and fake data
- **Zustand** for any local UI state that doesn’t belong in URL or server cache (selected view scope, sidebar collapsed, filter panel state)

### Dev tooling

- **Storybook** for primitive and component development in isolation
- **Vitest** + **Testing Library** for component tests
- **Playwright** for the handful of end-to-end tests (sandbox scenario runs)

-----

## 2. Aesthetic Direction

### Concept: “Operator’s Console”

Industrial-editorial. Think a Bloomberg terminal designed by a print magazine. High information density without becoming a wall of text. The serif headlines tell you you’re in a serious tool; the monospace and clean sans tell you it’s for technical work.

This is dev tooling, not a marketing site. Every aesthetic choice serves legibility, scannability, and trust.

### Type system

**Display — Fraunces (variable serif)**
Used for: page titles, screen headers, modal titles, key KPI labels, feature names in marketing-adjacent surfaces (settings, links page, sandbox scenario titles).

Why: Fraunces is a modern variable serif with character — adjustable optical size and “soft” axis. Editorial without being precious. Gives the app gravitas without feeling corporate.

**UI / Body — Geist Sans (variable)**
Used for: all interface text, table cells, labels, buttons, navigation, body copy.

Why: Designed for technical interfaces. Clean, neutral, sharp at small sizes, has a true variable axis. Open source. Made by the same team as Geist Mono so they pair perfectly.

**Mono — Geist Mono**
Used for: IDs (msg_…, cnv_…), addresses, timestamps, JSON payloads, code, stack traces, raw inspector content.

### Why not Inter / system fonts

Inter is the default everyone reaches for. We’re better than that. Geist + Fraunces is distinctive without being weird, technical without being cold.

### Color tokens

```css
/* Surface (light) */
--surface-base: #FAFAF7;        /* warm off-white, not pure white */
--surface-raised: #FFFFFF;
--surface-sunken: #F2F2EC;
--surface-overlay: rgba(14,14,14,0.6);

/* Surface (dark) */
--surface-base-dark: #0E0E0E;
--surface-raised-dark: #161616;
--surface-sunken-dark: #080808;

/* Text */
--text-primary: #0E0E0E;
--text-secondary: #5A5A55;
--text-tertiary: #8A8A82;
--text-inverse: #FAFAF7;

/* Borders */
--border-subtle: #E8E8E0;
--border-default: #D4D4CC;
--border-strong: #1A1A1A;

/* Brand accent — used sparingly */
--accent-primary: #1A1A1A;       /* near-black is the primary "brand" */
--accent-paper: #FAFAF7;

/* Engagement states (frozen in spec) */
--state-unread: #1F4FE6;         /* cobalt */
--state-read: #8A8A82;           /* neutral gray */
--state-acknowledged: #2D6B3E;   /* forest green */
--state-hidden: #B4B4AC;         /* muted */

/* Address kinds */
--kind-agent: #00838F;           /* deep cyan */
--kind-human: #C2410C;           /* burnt orange */
--kind-service: #6D28D9;         /* deep violet */
--kind-list: #B45309;            /* amber */

/* Environments — used for tinting and badges */
--env-local: #5A5A55;            /* neutral */
--env-dev: #1F4FE6;              /* blue */
--env-staging: #B45309;          /* amber */
--env-prod: #B91C1C;             /* red — danger color */
--env-experimental: #6D28D9;     /* violet */

/* Semantic */
--semantic-success: #2D6B3E;
--semantic-warning: #B45309;
--semantic-danger: #B91C1C;
--semantic-info: #1F4FE6;
```

**Discipline:** the engagement state colors are sacred. They appear identically in inbox lists, thread views, conversation inspector, replay particles, and the visibility matrix. Same color = same meaning, everywhere.

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

--radius-sm: 2px;
--radius-md: 4px;
--radius-lg: 6px;
--radius-pill: 9999px;

--border-width-thin: 1px;
--border-width-emphatic: 2px;
```

Sharp corners by default. `--radius-md: 4px` is the standard for interactive elements. Pills only for state badges. No rounded-2xl bubble UI — this isn’t a chat app.

### Motion

```css
--duration-instant: 80ms;
--duration-fast: 160ms;
--duration-medium: 240ms;
--duration-slow: 400ms;

--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

- Hover/focus transitions: instant or fast
- Panel reveals: medium with ease-out
- Replay scrubber: real-time, no easing
- Page transitions: none. Don’t fade pages. Don’t slide pages. Just render them.

### Visual language rules

- **Borders, not shadows.** This is a tool, not a card-based product UI. Shadow only for floating elements (popover, tooltip, modal).
- **One pixel borders** everywhere. Hairlines.
- **Generous horizontal space, dense vertical space.** Tables are narrow rows, lots of columns, scrollable horizontally if needed.
- **Numbers right-aligned and tabular** (`font-variant-numeric: tabular-nums`).
- **IDs are always monospace and always copyable** (cmd-click → copy to clipboard, or hover → copy button).
- **Empty states are honest.** No friendly illustrations. Just clean text: “No messages match these filters.”

-----

## 3. Folder Structure

```text
inbox-ui/
├── src/
│   ├── app/                      # Routing & layouts (TanStack Router)
│   │   ├── __root.tsx
│   │   ├── inbox.tsx
│   │   ├── inbox.$messageId.tsx
│   │   ├── agents.tsx
│   │   ├── agents.$addressId.tsx
│   │   ├── dashboard.tsx
│   │   ├── explorer.tsx
│   │   ├── explorer.conversations.$id.tsx
│   │   ├── settings.tsx
│   │   └── sandbox.tsx
│   │
│   ├── components/
│   │   ├── primitives/           # Generic UI atoms (shadcn-derived)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── card.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── loading-skeleton.tsx
│   │   │   └── error-state.tsx
│   │   │
│   │   ├── tokens/               # Domain atoms — Inbox-specific primitives
│   │   │   ├── address-chip.tsx
│   │   │   ├── id-badge.tsx
│   │   │   ├── message-state-badge.tsx
│   │   │   ├── visibility-badge.tsx
│   │   │   ├── effective-role-chip.tsx
│   │   │   ├── urgency-badge.tsx
│   │   │   ├── environment-badge.tsx
│   │   │   ├── timestamp-display.tsx
│   │   │   ├── duration-display.tsx
│   │   │   └── visibility-highlight.tsx
│   │   │
│   │   ├── composed/             # Molecules — combinations of tokens
│   │   │   ├── address-summary.tsx
│   │   │   ├── address-autocomplete.tsx
│   │   │   ├── message-header.tsx
│   │   │   ├── message-row.tsx
│   │   │   ├── thread-node.tsx
│   │   │   ├── delivery-source-breakdown.tsx
│   │   │   ├── event-timeline-strip.tsx
│   │   │   ├── reference-list.tsx
│   │   │   ├── parent-link-display.tsx
│   │   │   ├── resolution-summary-card.tsx
│   │   │   ├── validation-checklist.tsx
│   │   │   ├── kpi-card.tsx
│   │   │   ├── status-pill.tsx
│   │   │   ├── data-table.tsx
│   │   │   └── filter-bar.tsx
│   │   │
│   │   ├── panels/               # Organisms — full panels used in screens
│   │   │   ├── inbox-list-panel.tsx
│   │   │   ├── reader-panel.tsx
│   │   │   ├── compose-panel.tsx
│   │   │   ├── expansion-preview-panel.tsx
│   │   │   ├── thread-tree-panel.tsx
│   │   │   ├── thread-flat-panel.tsx
│   │   │   ├── visibility-matrix-panel.tsx
│   │   │   ├── conversation-tree-panel.tsx
│   │   │   ├── graph-canvas-panel.tsx
│   │   │   ├── replay-scrubber-panel.tsx
│   │   │   └── kpi-grid-panel.tsx
│   │   │
│   │   └── shell/                # App chrome
│   │       ├── app-shell.tsx
│   │       ├── top-bar.tsx
│   │       ├── view-scope-selector.tsx
│   │       ├── send-identity-selector.tsx
│   │       ├── environment-switcher.tsx
│   │       ├── global-search.tsx
│   │       └── left-rail.tsx
│   │
│   ├── screens/                  # Top-level screen compositions
│   │   ├── inbox-screen.tsx
│   │   ├── agent-directory-screen.tsx
│   │   ├── agent-profile-screen.tsx
│   │   ├── dashboard-screen.tsx
│   │   ├── conversation-inspector-screen.tsx
│   │   └── ...
│   │
│   ├── hooks/
│   │   ├── use-inbox-list.ts
│   │   ├── use-message-reader.ts
│   │   ├── use-compose-dry-run.ts
│   │   ├── use-view-scope.ts
│   │   ├── use-send-identity.ts
│   │   └── use-environment.ts
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts          # fetch wrapper, BFF envelope handling
│   │   │   ├── query-client.ts    # TanStack Query setup
│   │   │   ├── endpoints.ts       # typed endpoint functions
│   │   │   └── mock/
│   │   │       ├── handlers.ts    # MSW handlers
│   │   │       └── fixtures.ts    # imports from inbox-contracts
│   │   ├── design/
│   │   │   ├── tokens.ts          # exports CSS variable references
│   │   │   ├── motion.ts          # shared motion variants
│   │   │   └── kind-color.ts      # AddressKind → color mapping helper
│   │   ├── format/
│   │   │   ├── date.ts
│   │   │   ├── number.ts
│   │   │   ├── address.ts
│   │   │   └── duration.ts
│   │   └── utils/
│   │       ├── cn.ts              # clsx + tailwind-merge
│   │       └── copy-to-clipboard.ts
│   │
│   ├── stores/                   # Zustand stores
│   │   ├── view-scope-store.ts
│   │   ├── send-identity-store.ts
│   │   ├── environment-store.ts
│   │   └── ui-state-store.ts
│   │
│   ├── styles/
│   │   ├── globals.css           # @import tailwind, font-face, base resets
│   │   └── tokens.css            # @theme block with all CSS variables
│   │
│   └── main.tsx
│
├── stories/                      # Storybook stories
│   ├── primitives/
│   ├── tokens/
│   ├── composed/
│   ├── panels/
│   └── screens/
│
├── tests/
│   ├── unit/
│   └── e2e/
│
├── public/
│   └── fonts/                    # Self-hosted Geist + Fraunces
│
├── tailwind.config.ts            # minimal — tokens live in CSS
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Naming conventions

- **Files:** kebab-case (`message-row.tsx`, `compose-panel.tsx`)
- **Components:** PascalCase (`MessageRow`, `ComposePanel`)
- **Hooks:** camelCase with `use-` prefix file → `useInboxList` export
- **Stores:** kebab-case file → `useViewScopeStore` export
- **CSS variables:** kebab-case with namespace prefix (`--state-unread`, `--kind-agent`)
- **Tailwind utilities:** prefer the token-mapped utilities over arbitrary values (`bg-state-unread` not `bg-[#1F4FE6]`)

-----

## 4. Layer Discipline (Dependency Rules)

This is the most important section. Drift here makes the codebase unmaintainable.

### Strict layered import rule

A component may only import from layers below itself.

```text
screens/      ← may import from panels, composed, tokens, primitives, hooks, lib
panels/       ← may import from composed, tokens, primitives, hooks, lib
composed/     ← may import from tokens, primitives, lib
tokens/       ← may import from primitives, lib
primitives/   ← may import from lib only
shell/        ← may import from anything (it's the app frame)
```

**Banned cross-layer imports:**

- A primitive must never import a token (an `AddressChip` cannot live inside `Button`)
- A token must never import a composed (`AddressSummary` is composed; `AddressChip` is a token)
- A composed component must never import a panel (panels are screen-sized)

### One-way data flow

- All data comes from hooks (`useInboxList`, `useMessageReader`, etc.)
- Hooks call typed endpoint functions in `lib/api/endpoints.ts`
- Endpoint functions go through MSW in mock mode, real fetch in real mode
- The component never knows which mode is active

### Component contract rules

- Every component takes its data via props. No component reaches into a store except shell-level components and a few global selectors.
- Stores are for cross-cutting state only: view scope, send identity, environment, sidebar collapsed.
- Every component renders a `loading` and `empty` state — those are not optional. Add them when you create the component, not “later.”
- Every list component handles `error` state with the shared `ErrorState` primitive.

### Why this matters

The 26 screens share enormous amounts of DNA. The `AddressChip` token alone appears in inbox list, reader header, thread nodes, agent directory, agent profile, conversation inspector, communication graph nodes, command run history, dashboard top-communicators, dry-run preview, validation checklist, and more. If layer discipline drifts, fixing one bug ripples into 20 places. If layer discipline holds, fixing the token fixes everything.

-----

## 5. Build Order

### Phase 0 — Foundation (1-2 days)

Goal: An empty app shell renders, fonts load, theme works, mock API responds with fixture data.

1. Vite + React + TS scaffold
1. Tailwind v4 install + `tokens.css` with `@theme` block
1. Self-host Fraunces + Geist Sans + Geist Mono in `/public/fonts`, set up `@font-face` in `globals.css`
1. TanStack Router scaffold with empty routes for the five top-level areas
1. TanStack Query client + `lib/api/client.ts` with BFF envelope handling
1. MSW setup with handlers stubbed to return one fixture file per endpoint
1. Storybook installed and configured against the same Tailwind setup
1. Basic AppShell with stub TopBar and LeftRail — just to verify routing and layout
1. Light/dark theme provider via CSS variable swap on `<html>` class

**Done when:** you can `npm run dev`, navigate between empty Inbox/Agents/Dashboard/Explorer/Settings routes, and the top bar renders with the right typography.

### Phase 1 — Primitives (2-3 days)

All in Storybook first. No screens yet.

1. shadcn/ui install + selective copy of: `button`, `input`, `select`, `dialog`, `popover`, `tooltip`, `tabs`, `combobox`, `dropdown-menu`, `toast`, `command` (for the global search)
1. Restyle each one to match the aesthetic: borders not shadows, sharp corners, Geist sans, our color tokens
1. Build custom primitives: `Card`, `EmptyState`, `LoadingSkeleton`, `ErrorState`, `KeyValueRow`
1. Storybook stories for every primitive in every variant + state

**Done when:** the primitives storybook is complete and feels visually cohesive at a glance. Every primitive has a happy/empty/loading/error story.

### Phase 2 — Domain tokens (2-3 days)

All in Storybook first. These are the building blocks of every screen.

1. `IDBadge` — monospace, copyable, color-tinted by ID type prefix
1. `AddressChip` — kind-colored dot/badge + address text + optional display name
1. `MessageStateBadge` — engagement state pill with frozen color language
1. `VisibilityBadge` — active/hidden indicator
1. `EffectiveRoleChip` — to/cc minimal pill
1. `UrgencyBadge` — only renders for non-normal urgency
1. `EnvironmentBadge` — environment color tinting, used in TopBar
1. `TimestampDisplay` — relative + absolute on hover, tabular nums
1. `DurationDisplay` — for latencies (134ms, 4.2s, 3h)
1. `VisibilityHighlight` — wrapper that adds god-mode highlighting based on `isVisibleToHighlightedActor` field

**Done when:** every token has stories covering all its states. Test them all in light + dark.

### Phase 3 — Composed components (3-4 days)

Storybook first.

1. `AddressSummary` — chip + display name + status + small actions
1. `AddressAutocomplete` — typeahead picker against address list, used in compose
1. `MessageHeader` — sender, recipients, subject, urgency, timestamp, metadata drawer
1. `MessageRow` — single inbox list row
1. `ThreadNode` — tree node for thread/conversation views
1. `DeliverySourceBreakdown` — “delivered via X (to) + direct (cc)”
1. `EventTimelineStrip` — horizontal mini-timeline for delivery events
1. `ReferenceList` — typed references rendered with kind-aware icons
1. `ParentLinkDisplay` — handles visible/redacted/none states
1. `ResolutionSummaryCard` — the freezable resolution summary used in send + dry-run
1. `ValidationChecklist` — red/green checks for compose
1. `KPICard` — dashboard metric card with optional sparkline
1. `StatusPill` — generic status display
1. `DataTable` — TanStack Table wrapped with our styling, sortable headers, sticky first column option
1. `FilterBar` — composable filter chips + clear all

**Done when:** every composed component has stories using realistic fixtures from the contracts package.

### Phase 4 — Shared sections / panels (3-4 days)

Storybook + integration tests.

1. `TopBar` with view scope selector, send identity selector, environment switcher, global search
1. `LeftRail` with context-sensitive folder/sub-nav
1. `InboxListPanel` — wraps DataTable + FilterBar + the inbox-specific row
1. `ReaderPanel` — wraps MessageHeader + body + EventTimelineStrip + actions
1. `ExpansionPreviewPanel` — the live compose preview, the most novel piece
1. `ComposePanel` — wraps the form + ExpansionPreviewPanel
1. `ThreadFlatPanel` and `ThreadTreePanel` — both modes for thread view
1. `KPIGridPanel` — for the executive dashboard
1. `GraphCanvasPanel` — React Flow wrapper
1. `ReplayScrubberPanel` — Motion-driven scrubber

**Done when:** each panel has a Storybook story showing it in isolation against fixture data.

### Phase 5 — Screens (Phase 1 priority)

Now we compose. Each screen is small — just an arrangement of panels in a layout.

Phase 1 from spec inventory (13 screens):

1. App shell
1. Inbox list with split reading pane
1. Message reader full-page
1. Compose
1. Agent directory
1. Agent profile
1. Agent editor
1. List membership editor (sub-screen)
1. Executive / operator dashboard
1. System configuration
1. Important links & resources
1. Sandbox scenario library
1. Sandbox run results

**Done when:** all Phase 1 screens render against fixture data and survive the happy/empty/error fixture pack.

### Phase 6 — Phase 2 screens (debugging depth)

Thread view, conversation inspector, search, OTEL explorer, raw event inspector.

### Phase 7 — Phase 3 screens (visualization)

Communication graph, replay mode, incident review, experimental discovery, feedback board, workflow dashboard.

### Phase 8 — Phase 4 polish

Health dashboard, config explorer, feature flags.

-----

## 6. Library Wiring Notes

### Tailwind v4 setup

```css
/* src/styles/tokens.css */
@import "tailwindcss";

@theme {
  --color-surface-base: #FAFAF7;
  --color-surface-raised: #FFFFFF;
  --color-state-unread: #1F4FE6;
  --color-state-acknowledged: #2D6B3E;
  --color-kind-agent: #00838F;
  --color-kind-human: #C2410C;
  /* ... etc */

  --font-display: "Fraunces", Georgia, serif;
  --font-sans: "Geist Sans", system-ui, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", monospace;

  --radius-md: 4px;
  --spacing-7: 3rem;
}
```

This generates `bg-state-unread`, `text-kind-agent`, `font-display`, `rounded-md` etc. as utilities.

### shadcn/ui customization

Each shadcn component is copied into `src/components/primitives/` and edited directly. The CVA variants are rewritten to use our token-mapped Tailwind classes. We do not pull updates from shadcn upstream — once it’s in our tree, it’s ours.

### TanStack Query + MSW pattern

```ts
// lib/api/client.ts
async function bffFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  const envelope: BffResponse<T> = await response.json();
  if (!envelope.ok) throw new BffError(envelope.error);
  return envelope.result;
}

// lib/api/endpoints.ts
export const inboxApi = {
  list: (req: InboxListRequest) =>
    bffFetch<InboxListResult>("/inbox/list", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  // ...
};

// hooks/use-inbox-list.ts
export function useInboxList(req: InboxListRequest) {
  return useQuery({
    queryKey: ["inbox-list", req],
    queryFn: () => inboxApi.list(req),
  });
}
```

In dev with `VITE_USE_MOCK=1`, MSW intercepts the fetch and returns a fixture. In prod or with `VITE_USE_MOCK=0`, real fetch hits the local API server. The hook and component code is identical either way.

### Storybook + fixtures

Stories import fixtures directly from the contracts package:

```ts
// stories/composed/message-row.stories.tsx
import { MessageRow } from "@/components/composed/message-row";
import inboxListHappy from "@inbox-contracts/fixtures/derived/inbox-list.god.default.json";

export default { component: MessageRow };

export const Default = {
  args: { row: inboxListHappy.rows[0] },
};

export const Unread = {
  args: { row: inboxListHappy.rows.find(r => r.engagementState === "unread") },
};
```

This means storybook always renders against the same data the real app uses. No hand-crafted mock JSON inside stories — it’d drift immediately.

-----

## 7. Per-Screen Spec Template

Every screen spec doc that follows this plan uses this template. Build agents working on a screen should be able to read one doc top-to-bottom and have everything they need.

```markdown
# Screen: [Name]

**Area:** [Inbox / Agents / Dashboard / Explorer / Settings / Sandbox]
**Phase:** [P1 / P2 / P3 / P4]
**Route:** [URL pattern]
**Primary purpose:** [One sentence]

## Layout
[ASCII or description of the layout grid]

## Data dependencies
- Endpoint: [from contracts brief]
- Hook: [hook name]
- Required context: [view scope / send identity / env]
- Fixtures: [list of fixture files this screen renders]

## Panels used
- [list of panels from Phase 4 build order]

## Composed components used
- [list]

## Tokens used
- [list]

## States to design
- Happy path
- Empty
- Loading
- Error
- Dense / pathological
- [Any screen-specific states]

## Interactions
- [list of user actions and what they trigger]

## Keyboard shortcuts
- [list]

## Visibility highlighting
[How god-mode visibility annotation manifests on this screen]

## Edge cases
- [list of weird cases the design must handle]

## Open questions
- [list]
```

-----

## 8. Testing Approach

- **Storybook:** every primitive, token, and composed component has stories covering all states. This is the visual regression net.
- **Unit tests:** hooks, format helpers, store logic. Vitest.
- **Integration tests:** screens rendered against fixture packs in jsdom. React Testing Library.
- **E2E tests:** sandbox scenario runs against the mock API in Playwright. Just enough to catch routing, navigation, and data-loading regressions.
- **Type checking is the first-line defense.** With Zod schemas at the boundary and contract types throughout, most bugs are compile errors.

-----

## 9. Anti-Patterns to Reject

These will come up. Reject them.

- **A “shared” component that’s actually one-screen-specific.** If only one screen uses it, it lives in that screen’s folder, not in `composed/`.
- **Importing from a higher layer.** A composed component reaching into a panel is a sign you have the layering wrong. Refactor.
- **Deriving protocol truth in the UI.** Computing visibility, expanding lists, deciding action availability — that’s all backend territory.
- **Inline color values.** No `#1F4FE6` in JSX or className strings. Use the token.
- **Inline style props.** Use Tailwind utilities. The only exception is dynamic positioning (graph node x/y, scrubber thumb left).
- **Custom font sizes outside the type scale.** Use `text-sm`, `text-base`, `text-lg`, etc. mapped to our scale. No `text-[13px]`.
- **Card-with-shadow product UI.** Borders, not shadows. This is a tool.
- **Toast for everything.** Toasts are for action confirmations and async errors only. Use inline error states for form validation.
- **Storybook stories that hand-craft mock data.** Always import from the contracts fixtures.

-----

## 10. What Comes Next

This plan, once reviewed and approved, unlocks per-screen design specs. Each screen spec uses the template in §7 and references this plan for tech, aesthetic, and structural decisions.

Recommended order for producing screen specs:

**Batch 1 — App shell + Phase 1 inbox area** (the most-shared screens, exercise the most components)

- App shell
- Inbox list
- Message reader full-page
- Compose

**Batch 2 — Phase 1 agents area**

- Agent directory
- Agent profile
- Agent editor
- List membership editor

**Batch 3 — Phase 1 dashboard + settings + sandbox**

- Executive dashboard
- System configuration
- Important links & resources
- Sandbox scenario library
- Sandbox run results

**Batch 4 — Phase 2 debugging surfaces**

- Thread view
- Conversation inspector
- Search
- OTEL explorer
- Raw event inspector

**Batch 5 — Phase 3 visualizations**

- Communication graph
- Replay mode
- Incident review
- Experimental discovery
- Feedback board
- Workflow dashboard

**Batch 6 — Phase 4 polish**

- Health dashboard
- Config explorer
- Feature flags

Each batch is one delivery, with the screens designed against the same shared component vocabulary established in this plan.