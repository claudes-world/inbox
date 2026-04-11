#!/usr/bin/env node
/**
 * Regenerate packages/contracts/openapi.json from the annotated Zod schemas.
 *
 * This is the disk-persisted twin of the runtime `GET /api/openapi.json`
 * endpoint. Both call the same memoized `getOpenApiDocument()` builder in
 * `packages/bff/src/lib/openapi-registry.ts`, so by construction the
 * committed file and the live endpoint cannot diverge as long as CI runs
 * this script and checks the diff (see `.github/workflows/ci.yml` job
 * `openapi-drift-check`).
 *
 * Running it
 * ----------
 * This script imports the registry from the *compiled* `packages/bff/dist/`
 * bundle so it can run under plain Node with no TS loader. Callers must
 * make sure both workspaces are built first:
 *
 *   pnpm --filter @inbox/contracts build
 *   pnpm --filter @inbox/bff build
 *   pnpm gen:openapi   # alias for: node scripts/generate-openapi.mjs
 *
 * The `openapi-drift-check` CI job in `.github/workflows/ci.yml` runs
 * those three steps in order before diffing the result.
 *
 * Why the compiled dist and not TS source?
 * ----------------------------------------
 * `@inbox/contracts` exposes itself via an ESM `exports` map that only
 * publishes the compiled `./dist/` entries — there is no `default`
 * condition, so resolvers that go through the CJS loader (including
 * `tsx`'s compat shim) trip `ERR_PACKAGE_PATH_NOT_EXPORTED` when they
 * try to load `@inbox/contracts` from an ESM context that is not
 * tagged `import`. Running the already-compiled BFF dist under plain
 * `node` sidesteps that resolver question entirely.
 *
 * Why `.mjs` and not `.ts`?
 * -------------------------
 * The body has no TypeScript-only syntax, so TS typechecking would
 * add no value. Running the file as plain ESM (`.mjs`) means we can
 * invoke it with `node` on any supported Node version — no `tsx`,
 * no `--experimental-strip-types` flag, no loader plumbing. It also
 * avoids needing to add `"type": "module"` to the root `package.json`
 * purely so one helper script can parse.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getOpenApiDocument } from "../packages/bff/dist/lib/openapi-registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const target = join(repoRoot, "packages/contracts/openapi.json");

const doc = getOpenApiDocument();
// Pretty-print with 2-space indent + trailing newline so diffs stay
// readable and the file plays nicely with POSIX tooling.
writeFileSync(target, JSON.stringify(doc, null, 2) + "\n", "utf-8");
console.log(`Wrote ${target}`);
