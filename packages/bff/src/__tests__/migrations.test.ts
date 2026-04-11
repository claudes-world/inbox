import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../migrations.js";

/**
 * Tests for the forward-only SQL migration runner.
 *
 * Each test builds its own temporary schema directory with a controlled
 * set of migration files so we can exercise fresh-DB, partial-state,
 * error, and ordering behavior in isolation.
 */
describe("runMigrations", () => {
  let tmpDir: string;
  let db: DatabaseType;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-mig-"));
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeMigration(name: string, sql: string): void {
    fs.writeFileSync(path.join(tmpDir, name), sql, "utf-8");
  }

  function listApplied(): Array<{ version: string; name: string }> {
    return db
      .prepare(
        "SELECT version, name FROM schema_migrations ORDER BY version ASC"
      )
      .all() as Array<{ version: string; name: string }>;
  }

  it("fresh DB: applies all migrations and records them", () => {
    writeMigration(
      "001-init.sql",
      "CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;"
    );
    writeMigration("002-example-placeholder.sql", "SELECT 1;");

    runMigrations(db, tmpDir);

    const applied = listApplied();
    expect(applied).toEqual([
      { version: "001", name: "init" },
      { version: "002", name: "example-placeholder" },
    ]);

    // schema_migrations table should exist
    const tbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      )
      .get();
    expect(tbl).toBeTruthy();

    // 001 should have actually run (addresses table exists)
    const addrTbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='addresses'"
      )
      .get();
    expect(addrTbl).toBeTruthy();
  });

  it("backfill: existing DB with addresses but no schema_migrations marks 001 applied without re-running it", () => {
    // Simulate a pre-migration-era database: addresses already exists.
    db.exec("CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;");

    // 001 would blow up if re-run (table already exists). The runner must
    // skip it via backfill. 002 is still pending and should execute.
    writeMigration(
      "001-init.sql",
      "CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;"
    );
    writeMigration(
      "002-add-marker.sql",
      "CREATE TABLE marker (id TEXT PRIMARY KEY) STRICT;"
    );

    runMigrations(db, tmpDir);

    const applied = listApplied();
    expect(applied).toEqual([
      { version: "001", name: "init" },
      { version: "002", name: "add-marker" },
    ]);

    // 002 actually ran
    const markerTbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='marker'"
      )
      .get();
    expect(markerTbl).toBeTruthy();
  });

  it("idempotent: running twice is a no-op on the second call", () => {
    writeMigration(
      "001-init.sql",
      "CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;"
    );
    writeMigration("002-example-placeholder.sql", "SELECT 1;");

    runMigrations(db, tmpDir);
    const firstApplied = listApplied();
    const firstTimestamps = db
      .prepare("SELECT version, applied_at FROM schema_migrations")
      .all();

    runMigrations(db, tmpDir);
    const secondApplied = listApplied();
    const secondTimestamps = db
      .prepare("SELECT version, applied_at FROM schema_migrations")
      .all();

    expect(secondApplied).toEqual(firstApplied);
    // Timestamps must not have changed — confirms no re-insert
    expect(secondTimestamps).toEqual(firstTimestamps);
  });

  it("failing migration rolls back in a transaction and is NOT marked applied", () => {
    writeMigration(
      "001-init.sql",
      "CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;"
    );
    // 002 has a syntax error — should abort the whole tx and bubble up
    writeMigration(
      "002-broken.sql",
      "CREATE TABLE good (id TEXT PRIMARY KEY) STRICT; THIS IS NOT SQL;"
    );

    expect(() => runMigrations(db, tmpDir)).toThrow();

    // 001 succeeded before 002 failed
    const applied = listApplied();
    expect(applied).toEqual([{ version: "001", name: "init" }]);

    // The "good" table from 002 must not exist — tx rolled back
    const goodTbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='good'"
      )
      .get();
    expect(goodTbl).toBeUndefined();
  });

  it("applies migrations in lexical order regardless of readdir order", () => {
    // Write them in reversed order to make sure the sort matters
    writeMigration("003-third.sql", "CREATE TABLE t3 (id TEXT) STRICT;");
    writeMigration("001-first.sql", "CREATE TABLE t1 (id TEXT) STRICT;");
    writeMigration("002-second.sql", "CREATE TABLE t2 (id TEXT) STRICT;");

    runMigrations(db, tmpDir);

    const applied = listApplied();
    expect(applied.map((a) => a.version)).toEqual(["001", "002", "003"]);

    // applied_at should be non-decreasing in version order
    const rows = db
      .prepare(
        "SELECT version, applied_at FROM schema_migrations ORDER BY version ASC"
      )
      .all() as Array<{ version: string; applied_at: number }>;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.applied_at).toBeGreaterThanOrEqual(rows[i - 1]!.applied_at);
    }
  });

  it("ignores files that do not match the NNN- prefix pattern", () => {
    writeMigration(
      "001-init.sql",
      "CREATE TABLE addresses (id TEXT PRIMARY KEY) STRICT;"
    );
    writeMigration("seed.sql", "SELECT 'should be ignored';");
    writeMigration("notes.md", "not sql");
    writeMigration("99-bad-prefix.sql", "SELECT 'wrong prefix';");
    writeMigration("abc-letters.sql", "SELECT 'wrong prefix';");

    runMigrations(db, tmpDir);

    const applied = listApplied();
    expect(applied).toEqual([{ version: "001", name: "init" }]);
  });

  it("creates schema_migrations table on an empty DB even with zero migration files", () => {
    // No migration files at all
    runMigrations(db, tmpDir);

    const tbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      )
      .get();
    expect(tbl).toBeTruthy();
    expect(listApplied()).toEqual([]);
  });
});
