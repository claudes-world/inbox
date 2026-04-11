# NEXT-SESSION.md — tryinbox-sh

**Last updated:** April 11, 2026, ~02:00 ET
**Active branch:** `feat/issue-74-app-route` (integration branch tracking the v0.10.0+ UI Advanced work)
**Main branch:** `dev` (next-next is `main`)
**Domain:** https://inbox.claude.do (app at /app/ behind CF Access, landing page public at /)

## 🚀 What you're walking into

The April 10-11 session shipped the v0.10.0 UI Advanced milestone PLUS a contract-first codegen foundation. Integration branch is at `71d50f3` (or later — check `git log origin/feat/issue-74-app-route -1`). Not yet merged to `dev`.

**Test count:** 165 total (contracts 70 + BFF 70 + UI 25).
**Screen count:** 18 (7 core + 3 polish + 3 debugging + 5 visualization + graph PoC).
**Open PRs:** check `gh pr list --state open`.

## 🎯 Immediate priorities

1. **Band discrepancy decision on ports.yml PRs** (awaiting Liam's call)
   - PRs: CPC #135, inbox #116, toolbox #17
   - Issue: current canonical ports (3883x / 5883x) fall in ADR 0003's `test-*` sub-band, not `dev-*`
   - Agent's pragmatic call was to keep live ports + document the mismatch
   - Three options in the PR discussions. Pick one, merge, move on.

2. **Mutation fetcher migration** (follow-up to PR #118)
   - Migrates `postSend`, `postReply`, mark-read mutations, and `fetchDirectoryMembers` to `parsedPost` / `parsedGet`
   - May already be in flight when you read this — check `gh pr list` for `feat(ui): migrate mutation fetchers`
   - Closes the UI contract test migration

3. **Contract codegen Phase 2** (after mutation follow-up merges)
   - Plan: `~/claudes-world/tmp/20260411-inbox-contract-codegen-plan.md`
   - DA: `~/claudes-world/tmp/20260411-inbox-contract-codegen-plan-DA.md`
   - DA says split Phase 2 (don't bundle first-ever CI bootstrap with drift job)
   - Phase 2a: bootstrap `.github/workflows/ci.yml` with basic test+typecheck (no drift check yet)
   - Phase 2b: add the openapi.json drift check as a separate PR

## 🧪 Test infrastructure

### Unit tests
- Contracts: 70 tests (vitest, `packages/contracts/src/__tests__/`)
- BFF: 70 tests (vitest, `packages/bff/src/__tests__/`)
- UI: 25 tests (vitest, `packages/ui/src/__tests__/`)

Run all: `pnpm test` from repo root.

### E2E tests
- Playwright: 29 tests (`packages/ui/e2e/`)
- Uses `page.route()` to mock API responses, MSW handlers self-validate fixtures at import time
- Run: `pnpm --filter @inbox/ui exec playwright test`

### Adapter parity
- `packages/bff/src/__tests__/adapter-parity.test.ts` (20 tests)
- Runs BFF route handlers and validates responses against contract schemas
- Catches BFF → contracts drift at the test level (UI catches it at runtime via `parsedGet`)

## 🏗️ Architecture landmarks

### Contract-first pipeline (all 4 layers working as of 2026-04-11)

1. **Contracts package** (`packages/contracts/src/schemas.ts`) — Zod schemas are the source of truth. All schemas have `.openapi()` metadata annotations.
2. **BFF runtime validation** — routes validate responses via `schema.parse()` at the edge (landed in PR #111 for `/api/events`, extended in PR #117 for OpenAPI endpoint).
3. **OpenAPI spec** — `GET /api/openapi.json` returns a live OpenAPI 3.1 document generated at BFF boot time from the annotated schemas (PR #117).
4. **UI runtime validation** — `packages/ui/src/lib/contract-fetch.ts` provides `parsedGet<T>` / `parsedPost<T>` that validate responses at the UI boundary (PR #118). ContractDriftError has stable `.name` for React Query retry predicate compatibility across bundlers.

Drift is caught at 4 independent levels: adapter-parity test, BFF runtime, OpenAPI spec generation, UI runtime.

### Database
- Single SQLite DB at `$INBOX_DB` (defaults to `./inbox.db` in cwd — this will change to `$XDG_DATA_HOME/inbox-data/inbox.db` in Phase 2 of the CLI installer)
- `packages/bff/src/db.ts` manages connection
- `packages/bff/src/migrations.ts` runs forward-only migrations from `schema/NNN-*.sql` files (landed in PR #113)
- Tracking table: `schema_migrations (version, name, applied_at)`
- Vitest uses `INBOX_DB=:memory:` per worker for test isolation (landed in PR #103)

### Port allocation (ADR 0003, accepted 2026-04-11)
- `~/bin/port-for` allocates worktree-bound ports
- `.world/ports.yml` declares the purposes per repo (merged in PR #116 for inbox)
- `.world/ports.lock` is per-worktree allocation state (gitignored)
- PostToolUse hook on `git worktree add` auto-allocates; PreToolUse on `git worktree remove` frees
- Current canonical ports: BFF 38850, UI 58850

## 🗂️ Repo layout

```
packages/
  contracts/       Zod schemas (70 tests, source of truth)
  bff/             Hono backend (70 tests, SQLite + routes)
  ui/              React frontend (25 unit + 29 E2E tests)
  landing/         Public landing page variants (12 open PRs)
schema/
  001-init.sql     Initial DB schema
  002-*.sql        Future migrations (migration runner handles forward-only)
  seed.sql         Seed data
docs/
  conventions/     House style (gitflow, naming, etc.)
  guides/          How-to docs
  planning/        Plan + design docs (inbox_docs_v5, inbox_docs_addons)
  reference/       Architecture decisions, API contracts
```

## 📋 Open tracks (not blockers, but queue)

### Contract codegen (partial)
- Phase 1 ✅ SHIPPED (annotations landed in PR #117)
- Phase 2a: first GH Actions workflow (ci.yml with test+typecheck)
- Phase 2b: openapi.json drift check CI job
- Phase 3: generate `@inbox/api-client` workspace package + migrate fetchers
- Phase 4 (optional): BFF request validator

### CLI installer (GH issue #114)
- Phase 1 ✅ SHIPPED as PR #115 (lib discovery + VERSION + build-dist + canary markers + deterministic builds)
- Phase 2: install.sh + landing page integration
- Phase 3: GH Actions release.yml with SHA256 + SLSA attestation
- Refined plan: `~/claudes-world/tmp/20260411-inbox-installer-refined-recommendation.md`

### Landing page variants
- 12 open PRs (#84-88, #92-94, #99-102, etc.) — need Liam's taste pick, not agent work

## 🚧 Known gaps / follow-ups

- **`cpc-prod-web` purpose:** the prod CPC service is a monolith (backend serves built web from same port 38830). No separate prod-web purpose in CPC's `.world/ports.yml`. If CPC ever splits prod into separate services, add it.
- **Mutation fetchers contract validation:** follow-up to PR #118 (in flight if not already merged)
- **Request body runtime validation:** currently only client-side (`schema.parse(body)` before send). BFF still parses request bodies inline. Could centralize via a request middleware but out of scope for now.
- **XDG-compliant DB path:** `INBOX_DB` still defaults to cwd. CLI installer Phase 2 will change this.

## 🔗 Key references

- ADR 0003 (port allocation): `~/claudes-world/knowledge/adr/0003-port-allocation-v2-port-for.md`
- Refined installer plan: `~/claudes-world/tmp/20260411-inbox-installer-refined-recommendation.md`
- Contract codegen plan: `~/claudes-world/tmp/20260411-inbox-contract-codegen-plan.md`
- Adapter parity test: `packages/bff/src/__tests__/adapter-parity.test.ts`
- `worktree-feature` skill: `~/claudes-world/.claude/skills/worktree-feature/SKILL.md`
- `port-for-usage` skill: `~/.claude/skills/port-for-usage/SKILL.md` (also at `~/.codex/skills/port-for-usage/`)

## 🧭 How to pick up

1. `cd ~/code/tryinbox-sh && git fetch origin && git checkout feat/issue-74-app-route && git pull`
2. `pnpm install`
3. `pnpm test` — verify you have 165 tests passing
4. `gh pr list --state open` — see the current queue
5. Read the "Immediate priorities" section above
6. If you're picking up contract codegen, read the plan + DA docs first
7. If you're picking up installer Phase 2, read the refined recommendation
