/**
 * Database connection module for the BFF server.
 *
 * Uses better-sqlite3 for synchronous SQLite access.
 * The database path comes from the INBOX_DB environment variable.
 */
import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env["INBOX_DB"] || "./inbox.db";

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: DatabaseType = new Database(dbPath);

// Apply pragmas
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Apply schema if not already present (same sentinel check as bash lib/db.sh)
const tableCount = db
  .prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='addresses'"
  )
  .get() as { cnt: number } | undefined;

if (tableCount && tableCount.cnt === 0) {
  // Try to find the schema file relative to project root
  const schemaLocations = [
    path.resolve(process.cwd(), "schema/001-init.sql"),
    path.resolve(process.cwd(), "../../schema/001-init.sql"),
    path.resolve(__dirname, "../../../schema/001-init.sql"),
    path.resolve(__dirname, "../../../../schema/001-init.sql"),
  ];

  let schemaApplied = false;
  for (const schemaPath of schemaLocations) {
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf-8");
      db.exec(schemaSql);
      schemaApplied = true;
      break;
    }
  }

  if (!schemaApplied) {
    console.warn(
      "Warning: Could not find schema/001-init.sql. Database may not be initialized."
    );
  }
}

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
