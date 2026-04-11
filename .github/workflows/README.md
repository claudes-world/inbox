# GitHub Actions Workflows

## ci.yml

Runs on pull requests targeting `dev` or `main`, and on pushes to `dev`.

Jobs (all parallel):

- **lint-and-typecheck** — `pnpm typecheck` across all workspaces (prebuilds `@inbox/contracts`).
- **test-contracts** — `@inbox/contracts` unit tests (~70).
- **test-bff** — `@inbox/bff` unit tests (~70). Sets `INBOX_DB=:memory:`.
- **test-ui** — `@inbox/ui` unit tests (~40, includes contract drift validation).
- **e2e-ui** — Playwright E2E (~29 tests), chromium only. Uploads `playwright-report` artifact on failure.
- **build-all** — `pnpm build` across all workspaces.
- **openapi-drift-check** — regenerates `packages/contracts/openapi.json` from the annotated Zod schemas (via `scripts/generate-openapi.mjs`) and fails if the committed file no longer matches. Depends on `lint-and-typecheck` so it only runs once the workspace compiles cleanly. When a schema changes, run `pnpm gen:openapi` locally and commit the regenerated file alongside the schema edit.

Concurrency: in-progress runs on the same ref are cancelled when a new commit lands.
Permissions: read-only (`contents: read`).

## Adding new workflows

1. Drop a new `.yml` in this directory.
2. Set `permissions:` to the minimum required (read-only unless you need to write).
3. Add a `concurrency:` group if the job is expensive or duplicative per branch.

## Supply-chain policy — official actions only

Only use actions maintained by GitHub or by the upstream project itself:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `actions/upload-artifact@v4`
- `pnpm/action-setup@v4` (maintained by the pnpm team)

Do NOT pull in random third-party actions (e.g. `softprops/action-gh-release`). If
something truly third-party is ever unavoidable, pin it to a full commit SHA — never
a tag or branch — and document the reason here with a link to a review.

Major-version tags (`@v4`) are acceptable for the four actions above because GitHub
and pnpm maintain them and publish SECURITY advisories.
