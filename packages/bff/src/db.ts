/**
 * Database connection module for the BFF server.
 *
 * Uses better-sqlite3 for synchronous SQLite access.
 * The database path comes from the INBOX_DB environment variable.
 */
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { getTracer } from "./lib/otel.js";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import path from "node:path";
import fs from "node:fs";
import { runMigrations, resolveSchemaDir } from "./migrations.js";

const dbPath = process.env["INBOX_DB"] || "./inbox.db";

// Ensure parent directory exists (skip for :memory: and file::memory:)
if (dbPath !== ":memory:" && !dbPath.startsWith("file::memory:")) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

const rawDb: DatabaseType = new Database(dbPath);

// Apply pragmas
rawDb.pragma("foreign_keys = ON");
rawDb.pragma("journal_mode = WAL");

const schemaDir = resolveSchemaDir();
if (schemaDir) {
  runMigrations(rawDb, schemaDir);
} else {
  console.warn(
    "Warning: Could not find schema/ directory. Database may not be initialized."
  );
}

const dbTracer = getTracer('inbox-bff-db');

/**
 * Wrap a synchronous SQLite operation with an OTEL span.
 * Also called automatically by the db Proxy for every .prepare().get/.all/.run.
 *
 * @param operation  SQL verb: 'select', 'insert', 'update', 'delete'
 * @param table      Primary table being accessed
 * @param fn         The DB call to execute
 */
export function tracedQuery<T>(operation: string, table: string, fn: () => T): T {
  const span = dbTracer.startSpan(`db.${operation}`, {
    attributes: {
      'db.system': 'sqlite',
      'db.operation': operation,
      'db.sql.table': table,
    },
  });
  try {
    // Execute fn in a context where this span is active, so any nested
    // instrumentation is properly linked as a child span.
    return context.with(trace.setSpan(context.active(), span), fn);
  } catch (err) {
    span.recordException(err instanceof Error ? err : String(err));
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

// ── DB instrumentation proxy ──────────────────────────────────────────────────
// Intercepts every .prepare() call and auto-wraps the returned statement's
// .get/.all/.run methods with tracedQuery so every query emits an OTEL span
// without manual wrapping at each call site.

function extractSqlOperation(sql: string): string {
  const match = /^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE)/i.exec(sql);
  return match ? (match[1] ?? 'query').toLowerCase() : 'query';
}

function extractSqlTable(sql: string): string {
  // Handles FROM <table>, INTO <table>, UPDATE <table>
  const match = /\b(?:FROM|INTO|UPDATE)\s+(\w+)/i.exec(sql);
  return match ? (match[1] ?? 'unknown') : 'unknown';
}

const db: DatabaseType = new Proxy(rawDb, {
  get(target, prop) {
    if (prop === 'prepare') {
      return (sql: string) => {
        const stmt = target.prepare(sql);
        const operation = extractSqlOperation(sql);
        const table = extractSqlTable(sql);
        return new Proxy(stmt, {
          get(s, method) {
            if (method === 'get' || method === 'all' || method === 'run') {
              return (...args: unknown[]) =>
                tracedQuery(operation, table, () =>
                  // Use Reflect.apply to preserve `this` (the statement object) so
                  // better-sqlite3 native methods receive the correct receiver.
                  Reflect.apply(s[method as 'get' | 'all' | 'run'], s, args) as unknown
                );
            }
            return s[method as keyof typeof s];
          },
        });
      };
    }
    return target[prop as keyof typeof target];
  },
});

export default db;

/**
 * Resolve an address ID to its "local_part@host" string.
 */
export function addressIdToString(
  addrId: string
): string | null {
  const row = db
    .prepare("SELECT local_part, host FROM addresses WHERE id = ?")
    .get(addrId) as { local_part: string; host: string } | undefined;
  if (!row) return null;
  return `${row.local_part}@${row.host}`;
}

/**
 * Look up an address by "local_part@host" string. Returns address row or null.
 */
export function lookupAddress(address: string) {
  const atIndex = address.indexOf("@");
  if (atIndex === -1) return null;
  const localPart = address.substring(0, atIndex);
  const host = address.substring(atIndex + 1);
  if (!localPart || !host) return null;

  return db
    .prepare(
      "SELECT id, local_part, host, kind, display_name, description, is_active, is_listed, classification FROM addresses WHERE local_part = ? AND host = ?"
    )
    .get(localPart, host) as
    | {
        id: string;
        local_part: string;
        host: string;
        kind: string;
        display_name: string | null;
        description: string | null;
        is_active: number;
        is_listed: number;
        classification: string | null;
      }
    | undefined;
}

/**
 * Resolve the acting address. Returns the address row or null.
 * Validates format, existence, and active status.
 */
export function resolveActor(address: string):
  | {
      id: string;
      local_part: string;
      host: string;
      kind: string;
      display_name: string | null;
      is_active: number;
      is_listed: number;
      classification: string | null;
    }
  | { error: { code: string; message: string; target: string | null }; status: number } {
  if (!address) {
    return {
      error: {
        code: "invalid_argument",
        message: "X-Inbox-Address header is required",
        target: "address",
      },
      status: 400,
    };
  }

  if (!address.includes("@")) {
    return {
      error: {
        code: "invalid_argument",
        message: "invalid address format: missing @",
        target: "address",
      },
      status: 400,
    };
  }

  const localPart = address.substring(0, address.indexOf("@"));
  const host = address.substring(address.indexOf("@") + 1);

  if (!localPart || !host) {
    return {
      error: {
        code: "invalid_argument",
        message: "invalid address format: empty local_part or host",
        target: "address",
      },
      status: 400,
    };
  }

  const row = db
    .prepare(
      "SELECT id, local_part, host, kind, display_name, is_active, is_listed, classification FROM addresses WHERE local_part = ? AND host = ?"
    )
    .get(localPart, host) as
    | {
        id: string;
        local_part: string;
        host: string;
        kind: string;
        display_name: string | null;
        is_active: number;
        is_listed: number;
        classification: string | null;
      }
    | undefined;

  if (!row) {
    return {
      error: {
        code: "not_found",
        message: "address not found",
        target: "address",
      },
      status: 404,
    };
  }

  if (row.is_active !== 1) {
    return {
      error: {
        code: "permission_denied",
        message: "acting address is inactive",
        target: "address",
      },
      status: 403,
    };
  }

  return row;
}

/**
 * Generate a sortable prefixed ID matching the bash format.
 * Format: ${prefix}${timestamp_hex}_${random_hex}
 */
export function generateId(prefix: string): string {
  const tsMs = Date.now();
  const tsHex = tsMs.toString(16).padStart(12, "0");
  const randBytes = new Uint8Array(4);
  crypto.getRandomValues(randBytes);
  const randHex = Array.from(randBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}${tsHex}_${randHex}`;
}

/**
 * Get current time in milliseconds.
 */
export function nowMs(): number {
  return Date.now();
}


