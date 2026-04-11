PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Inbox MVP schema
-- Notes:
-- - IDs are application-generated TEXT values with stable typed prefixes (e.g. msg_, cnv_, dly_).
-- - STRICT tables are used throughout.
-- - Canonical message immutability is primarily an application + test invariant in MVP unless additional triggers are added later.
-- - BCC storage exists as reserved schema support; MVP CLI may defer exposing --bcc.

CREATE TABLE addresses (
  id              TEXT PRIMARY KEY,
  local_part      TEXT NOT NULL,
  host            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('agent', 'human', 'service', 'list')),

  display_name    TEXT,
  description     TEXT,

  is_listed       INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  classification  TEXT,

  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL,

  UNIQUE (local_part, host)
) STRICT;

CREATE TABLE group_members (
  group_address_id  TEXT NOT NULL,
  member_address_id TEXT NOT NULL,
  ordinal           INTEGER NOT NULL,
  added_at_ms       INTEGER NOT NULL,

  PRIMARY KEY (group_address_id, member_address_id),
  FOREIGN KEY (group_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  FOREIGN KEY (member_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  CHECK (group_address_id <> member_address_id),
  UNIQUE (group_address_id, ordinal)
) STRICT;

CREATE INDEX idx_group_members_group_ordinal
  ON group_members (group_address_id, ordinal, member_address_id);

CREATE TABLE conversations (
  id             TEXT PRIMARY KEY,
  created_at_ms  INTEGER NOT NULL
) STRICT;

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL,
  parent_message_id   TEXT,
  sender_address_id   TEXT NOT NULL,

  subject             TEXT NOT NULL DEFAULT '',
  body                TEXT NOT NULL,

  sender_urgency      TEXT NOT NULL DEFAULT 'normal'
                       CHECK (sender_urgency IN ('low', 'normal', 'high', 'urgent')),

  created_at_ms       INTEGER NOT NULL,

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE RESTRICT,
  FOREIGN KEY (sender_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_message_id, conversation_id)
    REFERENCES messages(id, conversation_id) ON DELETE RESTRICT,

  UNIQUE (id, conversation_id)
) STRICT;

CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at_ms, id);

CREATE INDEX idx_messages_sender_created
  ON messages (sender_address_id, created_at_ms, id);

CREATE INDEX idx_messages_parent
  ON messages (parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- Public logical headers as stored after deterministic normalization.
-- Cross-role duplicates may remain by design; exact same-role duplicates are normalized away before insert.
CREATE TABLE message_public_recipients (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,
  recipient_role       TEXT NOT NULL CHECK (recipient_role IN ('to', 'cc')),
  ordinal              INTEGER NOT NULL,
  created_at_ms        INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, recipient_role, ordinal)
) STRICT;

CREATE INDEX idx_message_public_recipients_message_ordinal
  ON message_public_recipients (message_id, recipient_role, ordinal);

-- Reserved for future/private recipient routing metadata (e.g. basic BCC).
CREATE TABLE message_private_recipients (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,
  recipient_role       TEXT NOT NULL CHECK (recipient_role = 'bcc'),
  ordinal              INTEGER NOT NULL,
  created_at_ms        INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, recipient_role, ordinal)
) STRICT;

CREATE INDEX idx_message_private_recipients_message_ordinal
  ON message_private_recipients (message_id, recipient_role, ordinal);

-- Standalone IDs on recipient rows are intentionally retained in MVP for future event/audit addressing.

CREATE TABLE message_references (
  id             TEXT PRIMARY KEY,
  message_id     TEXT NOT NULL,
  ordinal        INTEGER NOT NULL,

  ref_kind       TEXT NOT NULL
                 CHECK (ref_kind IN ('path', 'url', 'json', 'text', 'artifact_id', 'other')),
  ref_value      TEXT NOT NULL,
  label          TEXT,
  mime_type      TEXT,
  -- TODO(future-migration): add CHECK (metadata_json IS NULL OR json_valid(metadata_json))
  -- once the minimum SQLite version is confirmed to have json_valid() (≥ 3.38.0 for reliable
  -- JSON function support). Schema is frozen for MVP; this guard belongs in a 002-*.sql migration.
  metadata_json  TEXT,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  UNIQUE (message_id, ordinal)
) STRICT;

CREATE INDEX idx_message_references_message_ordinal
  ON message_references (message_id, ordinal);

CREATE TABLE deliveries (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,

  effective_role       TEXT NOT NULL CHECK (effective_role IN ('to', 'cc', 'bcc')),

  engagement_state     TEXT NOT NULL DEFAULT 'unread'
                       CHECK (engagement_state IN ('unread', 'read', 'acknowledged')),

  visibility_state     TEXT NOT NULL DEFAULT 'active'
                       CHECK (visibility_state IN ('active', 'hidden')),

  delivered_at_ms      INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, recipient_address_id)
) STRICT;

CREATE INDEX idx_deliveries_mailbox
  ON deliveries (recipient_address_id, visibility_state, engagement_state, delivered_at_ms DESC, id);

CREATE INDEX idx_deliveries_message
  ON deliveries (message_id);

CREATE TABLE delivery_sources (
  delivery_id        TEXT NOT NULL,
  source_address_id  TEXT NOT NULL,
  source_role        TEXT NOT NULL CHECK (source_role IN ('to', 'cc', 'bcc')),
  source_kind        TEXT NOT NULL CHECK (source_kind IN ('direct', 'list')),

  PRIMARY KEY (delivery_id, source_address_id, source_role),
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_address_id) REFERENCES addresses(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_delivery_sources_source
  ON delivery_sources (source_address_id, source_kind);

CREATE TABLE delivery_events (
  id                      TEXT PRIMARY KEY,
  delivery_id             TEXT NOT NULL,
  event_type              TEXT NOT NULL CHECK (event_type IN ('delivered', 'state_changed')),
  change_kind             TEXT NOT NULL CHECK (change_kind IN ('delivered', 'read', 'ack', 'hide', 'unhide')),

  actor_address_id        TEXT,
  event_at_ms             INTEGER NOT NULL,

  engagement_state_after  TEXT NOT NULL CHECK (engagement_state_after IN ('unread', 'read', 'acknowledged')),
  visibility_state_after  TEXT NOT NULL CHECK (visibility_state_after IN ('active', 'hidden')),

  -- TODO(future-migration): add CHECK (metadata_json IS NULL OR json_valid(metadata_json))
  -- once the minimum SQLite version is confirmed to have json_valid() (≥ 3.38.0 for reliable
  -- JSON function support). Schema is frozen for MVP; this guard belongs in a 002-*.sql migration.
  metadata_json           TEXT,

  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  CHECK (
    (event_type = 'delivered' AND change_kind = 'delivered' AND actor_address_id IS NULL)
    OR
    (event_type = 'state_changed' AND change_kind IN ('read', 'ack', 'hide', 'unhide') AND actor_address_id IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_delivery_events_delivery_time
  ON delivery_events (delivery_id, event_at_ms, id);

CREATE TABLE sent_items (
  message_id        TEXT PRIMARY KEY,
  visibility_state  TEXT NOT NULL DEFAULT 'active'
                    CHECK (visibility_state IN ('active', 'hidden')),
  hidden_at_ms      INTEGER,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,

  CHECK (
    (visibility_state = 'hidden' AND hidden_at_ms IS NOT NULL)
    OR (visibility_state = 'active' AND hidden_at_ms IS NULL)
  )
) STRICT;

CREATE INDEX idx_sent_items_visibility
  ON sent_items (visibility_state);

-- Triggers

CREATE TRIGGER trg_addresses_kind_immutable
BEFORE UPDATE OF kind ON addresses
FOR EACH ROW
WHEN OLD.kind <> NEW.kind
BEGIN
  SELECT RAISE(ABORT, 'address kind is immutable');
END;

CREATE TRIGGER trg_messages_sender_not_list_insert
BEFORE INSERT ON messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.sender_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'list address cannot send messages');
END;

CREATE TRIGGER trg_messages_sender_not_list_update
BEFORE UPDATE OF sender_address_id ON messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.sender_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'list address cannot send messages');
END;

CREATE TRIGGER trg_group_members_group_must_be_list_insert
BEFORE INSERT ON group_members
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.group_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'group_address_id must reference a list address');
END;

CREATE TRIGGER trg_group_members_member_not_list_insert
BEFORE INSERT ON group_members
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.member_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'nested lists are not allowed in MVP');
END;

CREATE TRIGGER trg_group_members_group_must_be_list_update
BEFORE UPDATE OF group_address_id ON group_members
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.group_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'group_address_id must reference a list address');
END;

CREATE TRIGGER trg_group_members_member_not_list_update
BEFORE UPDATE OF member_address_id ON group_members
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM addresses WHERE id = NEW.member_address_id AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'nested lists are not allowed in MVP');
END;
