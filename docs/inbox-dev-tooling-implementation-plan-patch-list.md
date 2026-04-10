# Inbox Dev Tooling — Implementation Plan Patch List

**Purpose:** Apply these edits to the current implementation plan before treating it as the canonical build plan.

**Scope:** This is a patch list, not a rewrite. The overall structure is good. These changes are intended to remove architectural drift, tighten layer boundaries, and align the plan with the contracts brief and current library assumptions.

---

## Patch 1 — Upgrade React baseline

### Change
Replace:

- `React 18 + TypeScript`

With:

- `React 19 + TypeScript`

### Why
Unless a dependency explicitly forces React 18, the plan should target the current baseline rather than freezing an older version without reason.

### Apply in
- `§1 Stack → Core`
- any setup snippets or starter commands that mention React version

---

## Patch 2 — Correct the React Flow claim

### Change
Rewrite the graph tooling section so it does **not** imply that React Flow provides force-directed layout by itself.

Replace:

- `React Flow for the communication graph (force-directed mode). Has built-in pan/zoom/select, edge animation, and good React integration.`

With something like:

- `React Flow for the communication graph canvas: pan/zoom, selection, node/edge rendering, and interaction shell.`
- `d3-force for force-directed layout calculation.`
- `React Flow consumes computed node positions from the layout layer.`

### Why
This removes a misleading assumption and makes the graph architecture accurate.

### Apply in
- `§1 Stack → Visualization`
- any graph panel notes in `§5 Build Order`

---

## Patch 3 — Freeze TanStack Router file-route generation setup

### Change
Add an explicit implementation decision for routing generation.

Recommended text:

- `Routing uses TanStack Router file-based routing with the Vite plugin (or TanStack Router CLI — choose one and freeze it).`
- `The route-tree generation mechanism is part of Phase 0 and must not be mixed with ad hoc manual route registration.`

### Why
Without this, teams may half-adopt file routing and half-manually define routes, which creates drift and confusion.

### Apply in
- `§1 Stack → Core`
- `§5 Phase 0 — Foundation`
- optionally `§3 Folder Structure` if you want to call out generated route-tree files

---

## Patch 4 — Move navigational/query state from Zustand to URL/search params

### Change
Revise the state-management guidance.

Current plan overuses Zustand for state that should be shareable and reload-stable.

### Freeze this split
Use **URL / router search params** for:
- current environment
- view scope / highlighted actor
- inbox folder
- time window
- table filters
- sorts
- selected message/conversation where appropriate
- explorer mode selectors

Use **Zustand only** for ephemeral local UI state such as:
- sidebar collapsed
- local panel open/closed state
- temporary unsaved draft state if intentionally not encoded in URL
- purely cosmetic shell preferences

### Why
This app benefits heavily from deep-linkable state, reproducible views, and refresh-safe navigation.

### Apply in
- `§1 Stack → Data & utilities`
- `§3 Folder Structure → stores/`
- `§4 Layer Discipline`
- `§5 Build Order`

### Concrete edits
- Narrow the Zustand description to local non-navigational UI state.
- Add a note that TanStack Router search params are the default home for view/query state.

---

## Patch 5 — Screens own hooks; panels stay presentational

### Change
Tighten the data-flow and import rules.

Current wording allows panels to import hooks, which weakens the layer boundary.

### Freeze this rule
- **Screens / route containers own data hooks.**
- **Panels are presentational orchestration components that receive data via props.**
- **Composed components, tokens, and primitives are pure presentational layers.**
- **Shell components may access only truly global state/selectors.**

### Why
This produces cleaner Storybook stories, easier testing, fewer hidden dependencies, and more stable contracts.

### Apply in
- `§4 Layer Discipline`
- `§3 Folder Structure → hooks/`
- `§5 Build Order`

### Concrete edits
Update the layer section so panels no longer list hooks as an allowed dependency.

Recommended revised dependency ladder:

```text
screens/      ← may import from panels, composed, tokens, primitives, hooks, lib
panels/       ← may import from composed, tokens, primitives, lib
composed/     ← may import from tokens, primitives, lib
tokens/       ← may import from primitives, lib
primitives/   ← may import from lib only
shell/        ← may import from tokens, composed, panels, and tightly-scoped global selectors only
```

And revise one-way data flow to:
- hooks are called in screens/route containers
- screen passes data into panels
- panels pass data into composed/tokens/primitives

---

## Patch 6 — Reconcile endpoint methods and paths with the contracts brief

### Change
Audit the implementation plan examples so they exactly match the contracts brief.

### Why
The most dangerous drift is when:
- contracts say one path/method
- UI helper code uses another
- MSW mocks support a third variation

That causes avoidable churn across hooks, handlers, and adapters.

### Apply in
- `§6 Library Wiring Notes`
- any code snippets showing endpoint usage
- any screen spec templates that mention endpoints

### Concrete edits
Before the plan is frozen, verify that every example matches the contracts brief exactly for:
- HTTP method
- path
- body/query shape
- BFF envelope handling
- request context fields

If the UI will intentionally use POST for complex list/search requests, make that explicit in the contracts brief too. Do not let the plan and contracts diverge.

---

## Patch 7 — Add a browser baseline note for Tailwind v4

### Change
Add one short note clarifying that this tool targets a modern browser baseline.

Suggested text:

- `Tailwind CSS v4 is used with a modern-browser baseline appropriate for an internal/local dev tool.`
- `Legacy browser support is not a design requirement.`

### Why
This prevents accidental future constraints from being inferred.

### Apply in
- `§1 Stack → Styling`
- optionally `§6 Tailwind v4 setup`

---

## Patch 8 — Make Motion package naming exact

### Change
Tighten the animation library note.

Replace vague wording with something explicit like:

- `Motion (package: motion, React entry: motion/react) for replay scrubber, panel transitions, and controlled UI animation.`

### Why
This avoids “Framer Motion vs Motion” ambiguity during install and import setup.

### Apply in
- `§1 Stack → Animation`
- any setup snippets or package lists

---

## Patch 9 — Relax the primitive-state requirement

### Change
Adjust the rule that every primitive must render happy/empty/loading/error states.

### Revised rule
- **Primitives:** visual variants + interaction states
- **Data-bearing composed components:** happy / empty / loading / error where applicable
- **Panels and screens:** happy / empty / loading / error / dense-pathological

### Why
Primitives like Button, Tooltip, or Tabs do not meaningfully have “empty/loading/error” states in the same way data-driven components do.

### Apply in
- `§4 Layer Discipline`
- `§5 Phase 1 — Primitives`
- `§8 Testing Approach`

---

## Patch 10 — Narrow the shell-layer exception

### Change
Replace `shell may import from anything` with a tighter rule.

### Revised rule
- `shell may import from tokens, composed, panels, and tightly-scoped global selectors`
- `shell must not absorb route-specific business logic`
- `shell must not depend on one-off screen internals unless they are promoted into reusable shell slots intentionally`

### Why
“Shell can import anything” is an invitation for the top bar and app shell to become a dumping ground.

### Apply in
- `§4 Layer Discipline`
- `§3 Folder Structure → components/shell/`

---

## Patch 11 — Tighten store inventory in folder structure

### Change
Revisit the listed stores to reflect the URL/search-param decision.

### Suggested revision
Keep only stores for genuinely local ephemeral UI state, for example:
- `ui-state-store.ts`
- maybe `draft-store.ts` if compose drafts are not URL-backed

Remove or demote these as default stores unless there is a strong reason:
- `view-scope-store.ts`
- `send-identity-store.ts`
- `environment-store.ts`

Those should default to router/search-param or session-derived state.

### Why
This makes the folder structure match the intended architecture.

### Apply in
- `§3 Folder Structure → stores/`
- `§4 Layer Discipline`

---

## Patch 12 — Add a “contracts alignment” gate to Phase 0

### Change
Add one explicit Phase 0 milestone that verifies alignment between:
- `inbox-contracts`
- endpoint helper layer
- mock handlers
- route loaders/hooks

### Suggested text
- `Freeze endpoint method/path/request-shape alignment against inbox-contracts before screen work begins.`
- `MSW handlers must import request/response types from inbox-contracts rather than re-declare them.`

### Why
This is the highest-leverage anti-drift checkpoint in the whole build.

### Apply in
- `§5 Phase 0 — Foundation`

---

## Patch 13 — Add route/search-state guidance to the screen spec template

### Change
Expand the screen template so screen authors must document which state lives in URL/search params versus local ephemeral state.

### Add fields to template
```markdown
## URL / search state
- [list of state reflected in route/search params]

## Local ephemeral state
- [list of state intentionally kept local and why]
```

### Why
This forces each screen spec to respect the URL-state decision rather than quietly backsliding into stores.

### Apply in
- `§7 Per-Screen Spec Template`

---

## Patch 14 — Add a graph-architecture note

### Change
Under graph/replay-related sections, explicitly split:
- data model
- layout engine
- rendering/interactions
- animation layer

### Suggested note
- `Graph data comes from the BFF as node/edge models.`
- `Layout is computed by d3-force or another explicit layout engine.`
- `React Flow renders and manages interaction.`
- `Motion handles replay/transition animation where needed.`

### Why
This prevents the graph implementation from turning into a tangled one-library-does-everything assumption.

### Apply in
- `§1 Stack → Visualization`
- `§5 Phase 4 / later graph-related phases`

---

## Patch 15 — Add one sentence that screens must consume contracts fixtures directly

### Change
This is already implied, but it should be stronger.

Suggested text:
- `Screen-level stories and integration fixtures must come from the inbox-contracts package fixture packs; screens must not define parallel local fixture shapes.`

### Why
The plan already enforces this for Storybook examples. Make it explicit as a screen-level rule too.

### Apply in
- `§6 Storybook + fixtures`
- `§8 Testing Approach`
- `§9 Anti-Patterns to Reject`

---

## Approval status after patching

### Green light after these patches
The implementation plan is strong overall and should be approved once the above edits are applied.

### Highest-priority patches
If you want the smallest meaningful patch pass, do these first:
1. Patch 4 — URL/search params over Zustand for navigational/query state
2. Patch 5 — screens own hooks; panels stay presentational
3. Patch 6 — reconcile endpoint methods/paths with contracts brief
4. Patch 2 — correct the React Flow / force-layout claim
5. Patch 10 — narrow shell-layer exception

### Why these matter most
These are the ones most likely to prevent rework and architectural drift during early implementation.

