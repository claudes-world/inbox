# Coverage Baseline — 2026-04-11

This document captures the starting-point coverage numbers for the Inbox
monorepo after wiring up `@vitest/coverage-v8` across `@inbox/contracts`,
`@inbox/bff`, and `@inbox/ui`. **Reporting only — no thresholds are
enforced.** Future PRs can tighten targets once we decide what "good"
looks like per package.

Regenerate locally with:

```bash
pnpm coverage                           # all packages
pnpm --filter @inbox/bff run coverage   # single package
```

Each package writes an HTML report to `packages/<pkg>/coverage/index.html`
and a machine-readable `coverage-summary.json` alongside it.

## Per-package totals

Line / statement counts from `coverage-summary.json`:

| Package          | Lines %   | Branches % | Functions % | Lines covered  |
| ---------------- | --------- | ---------- | ----------- | -------------- |
| `@inbox/contracts` | **99.8%** | 100%       | 100%        | 1006 / 1008    |
| `@inbox/bff`       | **70.9%** | 72.0%      | 86.9%       | 1306 / 1842    |
| `@inbox/ui`        | **22.1%** | 53.7%      | 33.0%       | 704 / 3191     |

Weighted monorepo line coverage (vitest-scoped code only, excluding the
static `packages/landing/` HTML and intentionally-excluded files):

```
(1006 + 1306 + 704) / (1008 + 1842 + 3191) = 3016 / 6041 ≈ 49.9%
```

## Top gaps (biggest absolute uncovered line counts)

Sorted by *uncovered* lines — a low-percentage file with 15 lines matters
less than a 50%-covered file with 300 lines.

| Uncovered | %      | File                                         |
| --------- | ------ | -------------------------------------------- |
| 165       | 5.7%   | `ui/src/screens/GraphScreen.tsx`             |
| 160       | 3.0%   | `ui/src/screens/ComposeScreen.tsx`           |
| 160       | 4.2%   | `ui/src/screens/MessageReadScreen.tsx`       |
| 157       | 4.3%   | `ui/src/screens/InboxScreen.tsx`             |
| 148       | 4.5%   | `ui/src/screens/DirectoryScreen.tsx`         |
| 123       | 8.2%   | `ui/src/screens/WorkflowDashboardScreen.tsx` |
| 117       | 47.3%  | `bff/src/routes/sent.ts`                     |
| 116       | 4.9%   | `ui/src/screens/SentReadScreen.tsx`          |
| 108       | 48.8%  | `bff/src/routes/reply.ts`                    |
| 106       | 5.4%   | `ui/src/screens/ThreadScreen.tsx`            |

### Top 3 priorities to tackle first

1. **`bff/src/routes/sent.ts` — 47% lines.** Route module with roughly
   half of its logic uncovered. This is hand-written request handling,
   not UI boilerplate, so every test here is high leverage. Follow-up
   issue candidate.
2. **`bff/src/routes/reply.ts` — 49% lines.** Same story as `sent.ts`:
   real branching logic behind a public API surface that deserves
   direct vitest coverage on top of whatever happens via app-level
   integration tests.
3. **`ui/src/screens/*` screen components.** The entire screens folder
   sits at single-digit line coverage because it is exercised almost
   entirely by Playwright e2e specs, which don't report into the
   vitest/v8 coverage report. This is a structural gap, not a quick
   fix — see the "intentionally uncovered" notes below.

## Files at 0% line coverage

```
ui/src/components/panels/ThreadPanel.tsx        (66 lines)
ui/src/components/panels/InboxPanel.tsx         (61 lines)
ui/src/components/composites/MessageRow.tsx     (55 lines)
ui/src/mocks/handlers.ts                        (35 lines)   — test helper
ui/src/main.tsx                                 (25 lines)   — bootstrap
bff/src/index.ts                                 (6 lines)   — bootstrap
ui/src/components/primitives/index.ts            (4 lines)   — barrel
ui/src/components/composites/index.ts            (3 lines)   — barrel
ui/src/mocks/browser.ts                          (3 lines)   — test helper
ui/src/mocks/server.ts                           (3 lines)   — test helper
contracts/src/index.ts                           (2 lines)   — barrel
ui/src/components/panels/index.ts                (2 lines)   — barrel
contracts/src/types.ts                           (0 lines)   — types-only
```

## Intentionally uncovered / excluded from coverage

- **`bff/src/lib/openapi-registry.ts`** — excluded in `vitest.config.ts`.
  Pure zod-to-openapi schema registration; its output is validated
  end-to-end by `src/__tests__/openapi.test.ts`, which compares the
  generated spec against the checked-in `openapi.json` fixture.
- **`*/src/**/index.ts` barrel files** — no logic, re-exports only.
  Vitest v8 reports these as 0% whenever the barrel itself isn't
  imported by a test, even if every exported symbol is fully tested.
- **`*/main.tsx`, `bff/src/index.ts`** — process / browser bootstrap
  entrypoints. Not exercised by vitest; covered implicitly by the fact
  that `pnpm build` + e2e / dev runs succeed.
- **`ui/src/mocks/*`** — MSW test fixtures. They *are* test support
  code; v8 treats the files as "production" because they live under
  `src/`. A future cleanup could move them under `src/__mocks__` or
  exclude the path explicitly.
- **`ui/src/screens/*` and `ui/src/components/panels/*`** — the UI is
  validated almost entirely via Playwright specs under `packages/ui/e2e`.
  Playwright runs a real browser against a real BFF, so the resulting
  line execution is never counted by the vitest+v8 instrumentation.
  This baseline deliberately does NOT try to "fix" the screen numbers
  by adding shallow render tests — that would be busywork that adds
  maintenance burden without catching real bugs. The right follow-up
  is either: (a) accept that screens live in the e2e pyramid and
  exclude them from the vitest report, or (b) introduce Playwright's
  own coverage collection and merge both reports. That's a decision
  for a future PR, not this one.

## Where the real testing lives

For context when reading the numbers above:

- `@inbox/contracts` sits at 99.8% because every Zod schema and enum
  has direct unit tests in `src/__tests__`.
- `@inbox/bff` hits ~71% from pure vitest. The `app.ts` + route test
  suites cover the happy paths and most error branches of the actively
  developed routes (`events`, `analytics`, `inbox`, `thread`, `send`).
  The older `sent.ts` / `reply.ts` routes have less direct coverage —
  they're the obvious next target.
- `@inbox/ui` at 22% under-counts real coverage because Playwright e2e
  is the primary validation layer. `src/lib/contract-fetch.ts` (95.6%)
  and `src/api.ts` (100% lines) show that the parts that *do* have
  vitest suites are well tested.

## CI integration

Coverage is **not** currently uploaded as a CI artifact. The script
exists (`pnpm coverage`) and can be wired into `.github/workflows/ci.yml`
later. A single-package artifact demo for `@inbox/bff` was considered
for this PR but deferred — the local `pnpm coverage` workflow is
enough for now, and keeping CI unchanged lowers the review surface for
this reporting-only change.

## Follow-ups worth filing

If any of these becomes a priority, open a GitHub issue referencing
this doc:

- Add focused unit tests for `bff/src/routes/sent.ts` (target: 80%+ lines)
- Add focused unit tests for `bff/src/routes/reply.ts` (target: 80%+ lines)
- Decide the UI story: exclude `screens/` from the vitest report, or
  merge Playwright coverage data into the report
- Move `ui/src/mocks/*` out of the `src/**` coverage include
- Once we pick targets, turn `thresholds` on in each package's
  `vitest.config.ts` so coverage regressions fail CI
