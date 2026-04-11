# Getting Started with Inbox

A 5-minute walkthrough of the full CLI workflow: create addresses, send
messages, read and reply, manage state, and browse the directory.

## Prerequisites

- Bash 4.4+
- sqlite3 CLI 3.37+ (STRICT tables, JSON1 extension)

## 1. Setup

Set the two required environment variables and verify your identity.

```bash
export INBOX_DB=./demo.db
export INBOX_ADDRESS=pm-alpha@vps-1
```

The first command you run will auto-create the database and apply the schema.
Run `whoami` to confirm everything works:

```bash
inbox whoami
```

```
Address:      pm-alpha@vps-1
Kind:         agent
Display Name: Project Manager Alpha
Active:       yes
Database:     ./demo.db
```

With `--json`:

```bash
inbox whoami --json
```

```json
{
  "ok": true,
  "address": "pm-alpha@vps-1",
  "kind": "agent",
  "display_name": "Project Manager Alpha",
  "is_active": true,
  "is_listed": true,
  "db_path": "./demo.db"
}
```

## 2. Create Addresses

The CLI reads from a shared SQLite database. Before sending messages you need
addresses in the `addresses` table. Seed a small team directly with sqlite3:

```bash
sqlite3 "$INBOX_DB" "PRAGMA foreign_keys = ON;" "
INSERT INTO addresses
  (id, local_part, host, kind, display_name, description,
   is_listed, is_active, classification, created_at_ms, updated_at_ms)
VALUES
  ('addr_pm',   'pm-alpha',  'vps-1', 'agent', 'Project Manager Alpha',
   'Engineering PM agent', 1, 1, 'internal',
   $(date +%s%3N), $(date +%s%3N)),

  ('addr_eng',  'eng-lead',  'vps-1', 'agent', 'Engineering Lead',
   'Senior engineering lead', 1, 1, 'internal',
   $(date +%s%3N), $(date +%s%3N)),

  ('addr_eng1', 'eng-1',     'vps-1', 'agent', 'Engineer One',
   'Backend engineer', 1, 1, 'internal',
   $(date +%s%3N), $(date +%s%3N));
"
```

> **Tip:** The seed file at `schema/seed.sql` ships a richer fixture set you can
> load with `sqlite3 "$INBOX_DB" < schema/seed.sql` after the schema has been
> initialized.

## 3. Send a Message

Set your identity to `pm-alpha@vps-1` and send a message to `eng-lead@vps-1`:

```bash
export INBOX_ADDRESS=pm-alpha@vps-1

inbox send \
  --to eng-lead@vps-1 \
  --subject "Weekly status report needed" \
  --body "Please send your weekly engineering status report by EOD Friday."
```

```
Sent: msg_019d6f001001_b0000001
Thread: cnv_019d6f001001_c0000001
Recipients: 1
```

JSON output includes the full resolution summary:

```bash
inbox send \
  --to eng-lead@vps-1 \
  --subject "Weekly status report needed" \
  --body "Please send your weekly engineering status report by EOD Friday." \
  --json
```

```json
{
  "ok": true,
  "message_id": "msg_019d6f001001_b0000001",
  "conversation_id": "cnv_019d6f001001_c0000001",
  "sender": "pm-alpha@vps-1",
  "public_to": ["eng-lead@vps-1"],
  "public_cc": [],
  "resolved_recipient_count": 1,
  "resolution_summary": {
    "logical_recipient_count": 1,
    "resolved_recipient_count": 1,
    "skipped_inactive_member_count": 0,
    "deduped_recipient_count": 0
  },
  "sent_item_created": true
}
```

Note the `message_id` and `conversation_id` -- you will use these in the
following steps.

## 4. Check Inbox

Switch to the recipient and list incoming messages:

```bash
export INBOX_ADDRESS=eng-lead@vps-1

inbox list
```

```
UNREAD        msg_019d6f001001_b0000001  pm-alpha@vps-1        "Weekly status report needed"       2s ago
```

Filter by engagement state:

```bash
inbox list --state unread
```

JSON output returns full item metadata:

```bash
inbox list --json
```

```json
{
  "ok": true,
  "items": [
    {
      "message_id": "msg_019d6f001001_b0000001",
      "conversation_id": "cnv_019d6f001001_c0000001",
      "sender": "pm-alpha@vps-1",
      "subject": "Weekly status report needed",
      "delivered_at_ms": 1775700010000,
      "view_kind": "received",
      "engagement_state": "unread",
      "visibility_state": "active",
      "effective_role": "to",
      "body_preview": "Please send your weekly engineering status report by EOD Friday.",
      "delivery_id": "dly_019d6f001001_d0000001"
    }
  ],
  "limit": 50,
  "returned_count": 1
}
```

Now read the full message (this marks it as `read`):

```bash
inbox read msg_019d6f001001_b0000001
```

```
Message: msg_019d6f001001_b0000001
From:    pm-alpha@vps-1
Subject: Weekly status report needed
View:    received
---
Please send your weekly engineering status report by EOD Friday.
```

Use `--peek` to view without changing state:

```bash
inbox read msg_019d6f001001_b0000001 --peek
```

## 5. Reply

Reply to the message (still as `eng-lead@vps-1`):

```bash
inbox reply msg_019d6f001001_b0000001 \
  --body "Status report: API migration at 85%. Blocker: auth service refactor."
```

```
Sent: msg_019d6f001002_b0000002
Thread: cnv_019d6f001001_c0000001
Recipients: 1
```

The reply lands in the same conversation (`cnv_...`). The subject is inherited
from the original message automatically.

Use `--all` to reply to all original recipients (like reply-all in email):

```bash
inbox reply msg_019d6f001001_b0000001 --all \
  --body "Looping everyone in on this status update."
```

## 6. Thread View

View the full conversation thread by conversation ID:

```bash
export INBOX_ADDRESS=pm-alpha@vps-1

inbox thread cnv_019d6f001001_c0000001
```

```
Thread: cnv_019d6f001001_c0000001

[sent]      msg_019d6f001001_b0000001  pm-alpha@vps-1   "Weekly status report needed"  5m ago
[received]  msg_019d6f001002_b0000002  eng-lead@vps-1   "Weekly status report needed"  3m ago
```

JSON thread output:

```bash
inbox thread cnv_019d6f001001_c0000001 --json
```

```json
{
  "ok": true,
  "conversation_id": "cnv_019d6f001001_c0000001",
  "items": [
    {
      "message_id": "msg_019d6f001001_b0000001",
      "parent_message_id": null,
      "sender": "pm-alpha@vps-1",
      "subject": "Weekly status report needed",
      "created_at_ms": 1775700010000,
      "view_kind": "sent",
      "visibility_state": "active",
      "body_preview": "Please send your weekly engineering status report by EOD Friday."
    },
    {
      "message_id": "msg_019d6f001002_b0000002",
      "parent_message_id": "msg_019d6f001001_b0000001",
      "sender": "eng-lead@vps-1",
      "subject": "Weekly status report needed",
      "created_at_ms": 1775700020000,
      "view_kind": "received",
      "engagement_state": "unread",
      "visibility_state": "active",
      "effective_role": "to",
      "body_preview": "Status report: API migration at 85%. Blocker: auth service refactor."
    }
  ],
  "limit": 50,
  "returned_count": 2,
  "truncated": false,
  "total_visible_count": 2
}
```

## 7. State Management

Inbox messages move through engagement states: `unread` -> `read` ->
`acknowledged`. Visibility can be toggled between `active` and `hidden`.

### Acknowledge a message

```bash
inbox ack msg_019d6f001002_b0000002
```

```
OK: msg_019d6f001002_b0000002 (changed)
```

Running it again is a no-op:

```bash
inbox ack msg_019d6f001002_b0000002
```

```
OK: msg_019d6f001002_b0000002 (no change)
```

### Hide and unhide

Hide a message to remove it from the default inbox view:

```bash
inbox hide msg_019d6f001002_b0000002
```

```
OK: msg_019d6f001002_b0000002 (changed)
```

Hidden messages are excluded from `inbox list` by default. To see them:

```bash
inbox list --visibility hidden
```

Bring a message back:

```bash
inbox unhide msg_019d6f001002_b0000002
```

```
OK: msg_019d6f001002_b0000002 (changed)
```

JSON output for state mutations:

```bash
inbox ack msg_019d6f001002_b0000002 --json
```

```json
{
  "ok": true,
  "message_id": "msg_019d6f001002_b0000002",
  "changed": false,
  "view_kind": "received",
  "engagement_state": "acknowledged",
  "visibility_state": "active"
}
```

## 8. Sent View

Review messages you have sent:

```bash
export INBOX_ADDRESS=pm-alpha@vps-1

inbox sent list
```

```
ACTIVE    msg_019d6f001001_b0000001  "Weekly status report needed"  10m ago
```

Read the full content of a sent message:

```bash
inbox sent read msg_019d6f001001_b0000001
```

```
Message: msg_019d6f001001_b0000001
From:    pm-alpha@vps-1
Subject: Weekly status report needed
View:    sent
---
Please send your weekly engineering status report by EOD Friday.
```

Sent items also support hide/unhide:

```bash
inbox sent hide msg_019d6f001001_b0000001
inbox sent unhide msg_019d6f001001_b0000001
```

JSON sent list:

```bash
inbox sent list --json
```

```json
{
  "ok": true,
  "items": [
    {
      "message_id": "msg_019d6f001001_b0000001",
      "conversation_id": "cnv_019d6f001001_c0000001",
      "subject": "Weekly status report needed",
      "created_at_ms": 1775700010000,
      "view_kind": "sent",
      "visibility_state": "active"
    }
  ],
  "limit": 50,
  "returned_count": 1
}
```

## 9. Directory

Browse the address book to discover who you can message.

### List all addresses

```bash
inbox directory list
```

```
agent   eng-1@vps-1                Engineer One
agent   eng-lead@vps-1             Engineering Lead
agent   pm-alpha@vps-1             Project Manager Alpha
```

Filter by kind:

```bash
inbox directory list --kind agent
```

Include inactive or unlisted addresses:

```bash
inbox directory list --include-inactive --include-unlisted
```

### Show address details

```bash
inbox directory show eng-lead@vps-1
```

```
Address:      eng-lead@vps-1
Kind:         agent
Display Name: Engineering Lead
Description:  Senior engineering lead
Active:       yes
Listed:       yes
```

JSON directory show:

```bash
inbox directory show eng-lead@vps-1 --json
```

```json
{
  "ok": true,
  "address": {
    "address": "eng-lead@vps-1",
    "kind": "agent",
    "display_name": "Engineering Lead",
    "description": "Senior engineering lead",
    "is_active": true,
    "is_listed": true
  }
}
```

### List group members

If you have mailing lists configured:

```bash
inbox directory members eng-leads@lists
```

```
List: eng-leads@lists
Members:
  - eng-lead@vps-1
  - eng-1@vps-1
  - eng-2@vps-1
```

## Quick Reference

| Command | Description |
|---|---|
| `inbox whoami` | Show acting identity |
| `inbox send --to ADDR --subject S --body B` | Send a new message |
| `inbox list [--state STATE] [--visibility VIS]` | List inbox messages |
| `inbox read MSG_ID [--peek]` | Read a message (marks as read) |
| `inbox reply MSG_ID --body B [--all]` | Reply to a message |
| `inbox ack MSG_ID` | Mark as acknowledged |
| `inbox hide MSG_ID` / `inbox unhide MSG_ID` | Toggle visibility |
| `inbox sent list` | List sent messages |
| `inbox sent read MSG_ID` | Read a sent message |
| `inbox thread CNV_ID` | View conversation thread |
| `inbox directory list [--kind KIND]` | Browse addresses |
| `inbox directory show ADDR` | Show address details |
| `inbox directory members LIST_ADDR` | Show list membership |

Add `--json` to any command for machine-readable JSON output.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `INBOX_ADDRESS` | Yes | Acting address (e.g. `pm-alpha@vps-1`) |
| `INBOX_DB` | Yes | Path to the SQLite database file |
