/**
 * Forward-only SQL migration runner for the BFF SQLite database.
 *
 * Migration files live in `schema/` as `NNN-description.sql` and are applied
 * in lexical order. Applied versions are tracked in `schema_migrations`.
 * There is no rollback — migrations are forward-only in v1.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Database as DatabaseType } from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the directory containing versioned migration SQL files.
 * Walks a list of candidate locations relative to cwd and this module.
 * Returns null if none match.
 */
export function resolveSchemaDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "schema"),
    path.resolve(process.cwd(), "../../schema"),
    path.resolve(__dirname, "../../../schema"),
    path.resolve(__dirname, "../../../../schema"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  return null;
}

/**
 * Forward-only SQL migration runner.
 *
 * Creates a `schema_migrations` tracking table, then applies any
 * `NNN-*.sql` files in `schemaDir` that have not yet been recorded there.
 * Each migration runs inside a transaction so a failure rolls back cleanly.
 *
 * Backward-compat: if `addresses` already exists but the tracking table is
 * empty (pre-migration dev/prod DBs), version `001` is marked applied first
 * so the initial schema isn't re-executed.
 */
export function runMigrations(db: DatabaseType, schemaDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const addressTable = db
    .prepare(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='addresses'"
    )
    .get() as { cnt: number };
  const migrationCount = db
    .prepare("SELECT count(*) as cnt FROM schema_migrations")
    .get() as { cnt: number };
  if (addressTable.cnt > 0 && migrationCount.cnt === 0) {
    db.prepare(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
    ).run("001", "init", Date.now());
    console.log("[db] Backfilled schema_migrations with pre-existing 001");
  }

  const files = fs
    .readdirSync(schemaDir)
    .filter((f) => /^\d{3}-.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = file.slice(0, 3);
    const name = file.slice(4, -4);

    const applied = db
      .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
      .get(version);
    if (applied) {
      console.log(
        `[db] Skipping migration ${version}: ${name} (already applied)`
      );
      continue;
    }

    console.log(`[db] Applying migration ${version}: ${name}`);
    const sql = fs.readFileSync(path.join(schemaDir, file), "utf-8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(version, name, Date.now());
    });
    tx();
  }
}
