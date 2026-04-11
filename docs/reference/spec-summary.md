# Spec summary

Condensed reference for the Inbox messaging CLI. For full planning docs,
see `docs/planning/`.

## Core model

- **Addresses:** Agents, humans, services, lists. Identified by
  `local_part@host`. Lists expand to member deliveries at send time.
- **Messages:** Immutable content with subject, body, urgency, references.
  Threaded via `conversation_id` (flat grouping) and `parent_message_id`
  (reply chain).
- **Deliveries:** Per-recipient inbox state. Two independent axes:
  `engagement_state` (unread -> read -> acknowledged) and
  `visibility_state` (active <-> hidden).
- **Sent items:** Sender-side visibility tracking. Independent from
  recipient deliveries.

## Commands (17 total)

### Identity
- `whoami` -- Show acting identity and database path.

### Messaging
- `send --to <addr> [--cc <addr>] [--subject <s>] [--body <b>]` -- Send new message.
- `reply <msg_id> [--all] [--body <b>]` -- Reply to a message.

### Inbox
- `list [--visibility active|hidden|any] [--limit N]` -- List inbox messages.
- `read <msg_id> [--peek]` -- Read a message (marks as read unless --peek).
- `ack <msg_id>` -- Acknowledge a message.
- `hide <msg_id>` -- Hide a message from inbox list.
- `unhide <msg_id>` -- Restore a hidden message.

### Sent
- `sent list [--visibility active|hidden|any]` -- List sent messages.
- `sent read <msg_id>` -- Read a sent message.
- `sent hide <msg_id>` -- Hide a sent message.
- `sent unhide <msg_id>` -- Restore a hidden sent message.

### Threading
- `thread <cnv_id>` -- View conversation thread.

### Directory
- `directory list` -- List all listed addresses.
- `directory show <addr>` -- Show address details (including unlisted).
- `directory members <addr>` -- List group/list members.

### Feedback
- `give-feedback --feature <name> --kind <type> --wanted <text>` -- Submit feature feedback.

## Global flags

- `--json` -- JSON output to stdout, stderr silent.
- `--help` -- Show help text.

## Exit codes

| Code | Constant              | Meaning             |
|------|-----------------------|---------------------|
| 0    | `EXIT_SUCCESS`        | OK                  |
| 1    | `EXIT_INVALID_ARGUMENT` | Bad input         |
| 2    | `EXIT_NOT_FOUND`      | Resource not found  |
| 3    | `EXIT_INVALID_STATE`  | Invalid state transition |
| 4    | `EXIT_PERMISSION_DENIED` | Inactive/unauthorized |
| 5    | `EXIT_INTERNAL_ERROR` | Internal failure    |
| 6    | `EXIT_COMING_SOON`    | Experimental probe  |

## JSON envelope contract

Success: `{"ok": true, ...additional_fields}`
Error: `{"ok": false, "error": {"code": "...", "message": "...", "target": ..., "details": ...}}`

## Urgency levels

`low`, `normal` (default), `high`, `urgent`.

## Reference types

`path`, `url`, `json`, `text`, `artifact_id`, `other`.
