# Changelog

All notable changes to Inbox are documented in this file. Each tagged
release gets a curated entry covering what shipped, known limitations,
and what's next.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## v0.1.0 — Initial MVP (2026-04-11)

The 24-hour initial sprint: from an empty repo and a voice-note idea
into a working MVP of an agent-native messaging system. Two runtimes
(bash CLI and TypeScript platform) sharing one frozen protocol
contract.

**Tag:** `v0.1.0` — commit `9db6fb4` (merge of PR #134)
**Session:** overnight 2026-04-10 → 2026-04-11, ~15 hours of active build
**Contributors:** Liam (Chaintail) — design, direction, UAT; Claude — implementation orchestrator

### Highlights

- **Two runtimes, one protocol.** A complete bash CLI (sqlite3 + coreutils only) and a full TypeScript platform (Hono BFF + Vite UI) built against the same frozen contract.
- **@inbox/contracts as the bridge.** 14 frozen enums, 30+ Zod schemas, typed fixtures, 47 vitest tests — shared between BFF and UI, auto-validated at the fetch layer.
- **55 bash tests + 69+ TypeScript tests** (124+ total) across 5 quality gates; ~25 real bugs caught and fixed by the 3-tier local review process.
- **Seven core screens live** on `inbox.claude.do`: Inbox, MessageRead, Compose, Thread, Sent, SentRead, Directory — wired to real BFF data with TanStack Query and address-scoped cache keys.
- **SPA moved to `/app/` route** to free the apex for a marketing landing page; 4 landing page variants and 7 flagship page variants shipped in parallel.
- **Infrastructure baseline:** CI workflow, Dependabot config, PR template, vitest coverage, Playwright E2E, OpenAPI drift detection, SQL migration runner, rate limiting middleware.
- **`.world/ports.yml` adopted** (Option D schema per ADR 0003 amendment); inbox ports renumbered from `38850/58850` → `38550/58550`.

### Bash CLI (Phases 1–5)

The foundation is pure bash + sqlite3 — no runtime deps beyond coreutils and `date`.

- **Phase 1 — Foundation:** scaffold, 11 SQLite STRICT tables, 7 triggers, IDs, DB layer, initial tests
- **Phase 2 — Core engine:** actor/inbox/sent/thread-visibility resolvers, list expansion, reply-all audience construction (~521 lines of bash); atomic 17-step `send`/`reply` transactions with rollback on failure
- **Phase 3 — Full CLI:** 17 commands with JSON/text output, flag parsing, ID validation, idempotent `read`/`ack`/`hide`/`unhide` mutations with delivery-event append
- **Phase 4 — Experimental mode:** discovery surfaces, telemetry capture, `give-feedback` command
- **Phase 5 — Docs + UAT:** AGENTS.md, UAT-01..05 scripts, setup docs
- **Security hardening:** `sql_escape()` applied to 40+ interpolation points, `sqlite3 -bail` + explicit ROLLBACK, NDJSON-safe telemetry escaping, unit-separator (`\x1f`) output to avoid pipe corruption and bash `read` NULL-column collapse
- **Smoke tests:** 55 tests across 8 files, 5 quality gates

### TypeScript platform (Phases 6–9)

- **Phase 6 — `@inbox/contracts`:** 14 frozen enums, 30+ Zod schemas, typed fixtures, 47 vitest tests; schemas derived from frozen protocol invariants and validated against actual CLI output (7 mismatches caught in review and fixed) — PRs #110, (contracts-bootstrap), #117
- **Phase 7 — Platform foundation:** pnpm monorepo with shared tsconfig, Hono BFF scaffold, Vite + React 19 + Tailwind v4 + TanStack Query UI scaffold, MSW mock handlers wired to contract fixtures — PRs #44, #45, #47, #48
- **Phase 8 — BFF + UI components:** 15 API endpoints with parameterized SQL (eliminating the entire SQL-injection class that had plagued the bash CLI), 12 React components across 3 layers (primitives / composites / panels), dark "Operator's Console" theme — PRs #51–#57
- **Phase 9 — Core screens:** 7 screens wired to real BFF data with hash-based routing, identity selector, address-scoped cache keys — PRs #63–#67

### Debugging, visualization, and data screens

- **Health, config, search screens** (#71, #106)
- **Debugging screens** — thread tree, event inspector, visibility matrix (#69, #107)
- **Communication graph PoC** — matrix heatmap + force-directed + ego view (#68, #108)
- **Visualization screens** — replay, incidents, experiments, feedback, workflows (#70, #109)
- **Event inspector wired** to real `/api/events` (#111, #112)
- **Workflow dashboard wired** to `/api/analytics/overview` (#127, #128)
- **Contracts** for experiments, feedback, delivery events (#110)

### Route migration + landing pages

- **SPA moved to `/app/`** with placeholder landing at apex (#74)
- **Landing page variants (4):** Command Center (#76 → #84), Digital Mail Room (#77 → #131), Agent Network (#78 → #88), Developer Tool (#79 → #87)
- **Flagship page variants (7):** editorial magazine (#89 → #92), brutalist terminal (#90 → #93), sci-fi blueprint (#91 → #94), dark luxury art deco (#95 → #102), organic topographic (#96 → #101), retro CRT terminal (#97 → #99), broadsheet newspaper (#100)

### Infrastructure + tooling (2026-04-11 session)

- **6-layer contract drift defense:** OpenAPI 3.1 spec endpoint (#117), drift detection CI (#123), contract-validated fetch layer (#118), mutation fetcher migration to `parsedPost` (#120), BFF adapter parity tests (#73, #104)
- **CI workflow bootstrap:** test/typecheck/build/E2E pipeline (#121), Dependabot + PR template (#122), `packageManager` + `engines` + `.nvmrc` single-source Node/pnpm versions (#124), CI status badge (#125)
- **Test coverage baseline:** vitest coverage reporting (#129), coverage gap-fills for `sent.ts` + `reply.ts` (#130)
- **Playwright E2E** — routing, navigation, data loading (#72, #105)
- **BFF hardening:** token-bucket rate limiting middleware (#126), forward-only SQL migration runner with `schema_migrations` tracking (#113), split send/reply routers with body validation and safe `JSON.parse`, ESM `__dirname` compatibility via `import.meta.url`, parallel DB race-condition test fix (#85, #103)
- **CLI installer Phase 1:** lib discovery rework, `VERSION` file, `build-dist` (#114, #115)
- **`.world/ports.yml`** Option D schema per ADR 0003 amendment (#116); inbox ports renumbered `38850/58850` → `38550/58550`; Caddy reverse-proxy and Vite dev server updated to match
- **Session-continuity handoff** doc (#119)

### Bugs caught by the local review swarm

The 3-tier local review process (Gemini → Codex → Claude) found ~25 real issues before any user saw them. The highlights:

1. **`db_transaction` partial commit** — `sqlite3` without `-bail` continues past errors; COMMIT ran after failed statements. Fixed with `-bail` + explicit ROLLBACK.
2. **SQL injection across all CLI modules** — every `db_exec` interpolated user strings directly. Fixed with `sql_escape()` across 40+ sites.
3. **Reply references silently dropped** — `do_send_in_conversation()` was missing the reference-insertion block. Replies returned `ok:true` while losing all `--ref` data.
4. **IFS contamination** — `local IFS=','` in `do_send` propagated through bash dynamic scoping to corrupt `json_escape`'s `$(seq 1 31)` loop three call frames away. Fixed by replacing with `for ((i=1; i<=31; i++))`.
5. **Parent-message-ID visibility leak** — `resolve_thread_visibility` and `query_sent_read` returned raw parent IDs without re-checking visibility. Violated Privacy Invariant §4. Fixed with visibility-union subquery.
6. **Pipe-separator field corruption** — sqlite3's default `|` separator broke on message bodies containing pipes. Fixed with unit separator `\x1f` + `COALESCE` for NULL.
7. **Bash `read` collapsing NULL columns** — consecutive tabs from NULL columns collapse because tab is IFS whitespace. Also fixed by the unit-separator migration.

Each of these would have been a production incident. The process that caught them is now encoded in SOP Rule 9 (12-step review gate, push-only-when-green, local-heavy cloud-thrift).

### Known limitations

- **MVP scope only.** The platform has core screens working against real data, but advanced screens (Phase 10+) and full production polish are not in this release.
- **No auth beyond identity selector.** Address selection is client-controlled; `getUserId` was hardened in a follow-up session but there's no production auth story yet.
- **No production deploy pipeline.** The live `inbox.claude.do` runs off the dev branch behind Cloudflare Access — not a versioned production deployment.
- **Coverage baseline is incomplete.** Vitest coverage was introduced late in the sprint (#129, #130); coverage gates are not enforced in CI yet.
- **Landing pages are variants, not a choice.** 4 landing-page designs and 7 flagship-page designs shipped in parallel as experimental variants — no canonical landing page is chosen.
- **Installer is scaffolded, not released.** CLI installer Phase 1 landed (#115) but the full `curl | bash` + signed-tarball release workflow is tracked as a follow-up (#145).
- **Project is paused.** Per Liam's directive (msg 5238), Inbox rests for a day or two after this sprint. Do not resume work against `main` until Liam says otherwise.

### What's next (post-v0.1.0)

- **#143 — adopt gitflow-light branching strategy** for future inbox work
- **#145 — GitHub Actions release workflow** with `tar.gz` + cryptographic verification for `tryinbox.sh/install`
- **8 open Dependabot PRs** (#135–#142, #144) auto-opened after the release lands — triage after the project resumes
- **Advanced screens (Phase 10+)** — scoped but not built
- **Changelog-per-release discipline** — this changelog is retroactive; going forward, every tagged release should ship with a curated entry in this file

### By the numbers

| Metric | Count |
|--------|-------|
| Session duration | ~15 hours |
| Phases shipped | 9 (CLI 1–5, contracts, platform, BFF, screens) |
| Total tests | 124+ (55 bash + 69+ TypeScript) |
| Total lines of code | ~16,000 |
| Commits | 90+ |
| Merged PRs in this release | 60+ (see `git log v0.1.0 --oneline`) |
| GitHub issues created | 73 |
| Milestones created | 11 |
| Bugs caught by local review | ~25 |
| Review fix rounds | 15+ |
| Landing/flagship variants shipped | 11 (4 landing + 7 flagship) |
| Parallel background agents dispatched | 50+ |

---

*Built overnight on `claude.do` by Claude Opus 4.6 with Liam (Chaintail). From voice-note idea to live platform in 24 hours.*
