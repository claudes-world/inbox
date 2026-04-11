/**
 * Directory routes — list addresses, show address details, list group members.
 *
 * Maps to CLI commands: inbox directory list, inbox directory show, inbox directory members
 */
import { Hono } from "hono";
import db, { addressIdToString } from "../db.js";
import { errorEnvelope } from "../helpers.js";

export const directoryRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /  →  inbox directory list
// ---------------------------------------------------------------------------
directoryRoutes.get("/", (c) => {
  const kind = c.req.query("kind");
  const listedOnly =
    c.req.query("listed") !== "0" && c.req.query("listed") !== "false";

  const conditions: string[] = [];
  const params: string[] = [];

  if (listedOnly) {
    conditions.push("is_listed = 1");
  }

  if (kind) {
    if (!["agent", "human", "service", "list"].includes(kind)) {
      return c.json(
        errorEnvelope("invalid_argument", `invalid kind filter: ${kind}`),
        400
      );
    }
    conditions.push("kind = ?");
    params.push(kind);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT id, local_part, host, kind, display_name, description, is_active, is_listed, classification
       FROM addresses ${whereClause}
       ORDER BY local_part ASC, host ASC`
    )
    .all(...params) as Array<{
    id: string;
    local_part: string;
    host: string;
    kind: string;
    display_name: string | null;
    description: string | null;
    is_active: number;
    is_listed: number;
    classification: string | null;
  }>;

  const items = rows.map((row) => ({
    address: `${row.local_part}@${row.host}`,
    kind: row.kind,
    display_name: row.display_name || null,
    description: row.description || null,
    is_active: row.is_active === 1,
    is_listed: row.is_listed === 1,
    classification: row.classification || null,
  }));

  return c.json({
    ok: true,
    items,
    returned_count: items.length,
  });
});

// ---------------------------------------------------------------------------
// GET /:address  →  inbox directory show
// ---------------------------------------------------------------------------
directoryRoutes.get("/:address", (c) => {
  const address = c.req.param("address");

  // Address param is "local@host"
  const atIndex = address.indexOf("@");
  if (atIndex === -1) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        "address must be in local@host format",
        "address"
      ),
      400
    );
  }

  const localPart = address.substring(0, atIndex);
  const host = address.substring(atIndex + 1);

  const row = db
    .prepare(
      `SELECT id, local_part, host, kind, display_name, description, is_active, is_listed, classification
       FROM addresses WHERE local_part = ? AND host = ?`
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

  if (!row) {
    return c.json(
      errorEnvelope("not_found", `${address} not found`, "address"),
      404
    );
  }

  return c.json({
    ok: true,
    address: {
      address: `${row.local_part}@${row.host}`,
      kind: row.kind,
      display_name: row.display_name || null,
      description: row.description || null,
      is_active: row.is_active === 1,
      is_listed: row.is_listed === 1,
      classification: row.classification || null,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /:address/members  →  inbox directory members
// ---------------------------------------------------------------------------
directoryRoutes.get("/:address/members", (c) => {
  const address = c.req.param("address");

  const atIndex = address.indexOf("@");
  if (atIndex === -1) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        "address must be in local@host format",
        "address"
      ),
      400
    );
  }

  const localPart = address.substring(0, atIndex);
  const host = address.substring(atIndex + 1);

  const addrRow = db
    .prepare(
      "SELECT id, kind FROM addresses WHERE local_part = ? AND host = ?"
    )
    .get(localPart, host) as { id: string; kind: string } | undefined;

  if (!addrRow) {
    return c.json(
      errorEnvelope("not_found", `${address} not found`, "address"),
      404
    );
  }

  if (addrRow.kind !== "list") {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        `${address} is not a list address`,
        "address"
      ),
      400
    );
  }

  const members = db
    .prepare(
      `SELECT gm.member_address_id
       FROM group_members gm
       JOIN addresses a ON a.id = gm.member_address_id
       WHERE gm.group_address_id = ?
       ORDER BY gm.ordinal ASC, gm.member_address_id ASC`
    )
    .all(addrRow.id) as Array<{ member_address_id: string }>;

  const memberAddresses = members
    .map((m) => addressIdToString(m.member_address_id))
    .filter(Boolean) as string[];

  return c.json({
    ok: true,
    group: address,
    members: memberAddresses,
  });
});
