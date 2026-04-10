# Inbox JSON Contracts (MVP)

This document freezes the agent-facing JSON response shapes for the Inbox CLI.

## Global conventions

- JSON mode always writes valid JSON to stdout and keeps stderr silent.
- Success envelope is flat:

```json
{ "ok": true, ... }
```

- Error envelope is flat:

```json
{
  "ok": false,
  "error": {
    "code": "not_found",
    "message": "human-readable message",
    "details": {}
  }
}
```

- Timestamps are Unix milliseconds.
- Public IDs use typed prefixes (e.g. `msg_`, `cnv_`, `dly_`, `fbk_`).
- Internal IDs like `delivery_id` may appear in JSON for debugging/telemetry but are not primary public handles.

## Error codes

- `not_found`
- `invalid_argument`
- `invalid_state`
- `permission_denied`
- `internal_error`
- `coming_soon` (experimental mode only)

## Shared fragments

### Address summary

```json
{
  "address": "pm-alpha@vps-1",
  "kind": "agent",
  "display_name": "Project Manager Alpha",
  "description": "Engineering PM agent",
  "is_active": true,
  "is_listed": true,
  "classification": "internal"
}
```

### Delivery-local state

```json
{
  "view_kind": "received",
  "engagement_state": "read",
  "visibility_state": "active",
  "effective_role": "to"
}
```

### Sent-item-local state

```json
{
  "view_kind": "sent",
  "visibility_state": "active"
}
```

### Reference object

```json
{
  "kind": "path",
  "value": "/shared/spec.md",
  "label": null,
  "mime_type": null,
  "metadata": null
}
```

### Resolution summary

```json
{
  "logical_recipient_count": 3,
  "resolved_recipient_count": 7,
  "skipped_inactive_member_count": 2,
  "deduped_recipient_count": 1
}
```

### Experimental coming-soon error

```json
{
  "ok": false,
  "experimental": true,
  "error": {
    "code": "coming_soon",
    "message": "feature coming soon",
    "details": {
      "feature": "search",
      "feedback_command": "inbox give-feedback --feature search --kind verb --wanted \"<what you wanted to do>\""
    }
  }
}
```

## Command contracts

### `inbox whoami`

```json
{
  "ok": true,
  "address": "pm-alpha@vps-1",
  "kind": "agent",
  "display_name": "Project Manager Alpha",
  "is_active": true,
  "db_path": "/var/lib/inbox/inbox.db"
}
```

### `inbox send`

```json
{
  "ok": true,
  "message_id": "msg_...",
  "conversation_id": "cnv_...",
  "sender": "pm-alpha@vps-1",
  "public_to": ["eng-leads@lists"],
  "public_cc": ["ceo@org"],
  "resolved_recipient_count": 4,
  "resolution_summary": {
    "logical_recipient_count": 2,
    "resolved_recipient_count": 4,
    "skipped_inactive_member_count": 1,
    "deduped_recipient_count": 0
  },
  "sent_item_created": true
}
```

### `inbox list`

```json
{
  "ok": true,
  "items": [
    {
      "message_id": "msg_...",
      "conversation_id": "cnv_...",
      "sender": "pm-alpha@vps-1",
      "subject": "Need engineering status",
      "delivered_at_ms": 1775754070000,
      "view_kind": "received",
      "engagement_state": "unread",
      "visibility_state": "active",
      "effective_role": "to",
      "body_preview": "Please send your weekly report...",
      "delivery_id": "dly_..."
    }
  ],
  "limit": 50,
  "returned_count": 1
}
```

### `inbox read`

```json
{
  "ok": true,
  "message": {
    "message_id": "msg_...",
    "conversation_id": "cnv_...",
    "parent_message_id": null,
    "sender": "pm-alpha@vps-1",
    "subject": "Need engineering status",
    "body": "Please send your weekly report by 5pm.",
    "public_to": ["eng-manager@vps-1"],
    "public_cc": ["ceo@org"],
    "references": []
  },
  "state": {
    "view_kind": "received",
    "engagement_state": "read",
    "visibility_state": "active",
    "effective_role": "to",
    "delivery_id": "dly_..."
  },
  "history": []
}
```

### `inbox reply`

```json
{
  "ok": true,
  "message_id": "msg_...",
  "conversation_id": "cnv_...",
  "parent_message_id": "msg_...",
  "sender": "eng-manager@vps-1",
  "resolved_recipient_count": 2,
  "sent_item_created": true
}
```

### `inbox ack` / `hide` / `unhide`

```json
{
  "ok": true,
  "message_id": "msg_...",
  "changed": true,
  "view_kind": "received",
  "engagement_state": "acknowledged",
  "visibility_state": "active"
}
```

### `inbox sent list`

```json
{
  "ok": true,
  "items": [
    {
      "message_id": "msg_...",
      "conversation_id": "cnv_...",
      "subject": "Need engineering status",
      "created_at_ms": 1775754070000,
      "view_kind": "sent",
      "visibility_state": "active"
    }
  ],
  "limit": 50,
  "returned_count": 1
}
```

### `inbox sent read`

```json
{
  "ok": true,
  "message": {
    "message_id": "msg_...",
    "conversation_id": "cnv_...",
    "parent_message_id": null,
    "sender": "pm-alpha@vps-1",
    "subject": "Need engineering status",
    "body": "Please send your weekly report by 5pm.",
    "public_to": ["eng-manager@vps-1"],
    "public_cc": [],
    "references": []
  },
  "state": {
    "view_kind": "sent",
    "visibility_state": "active"
  }
}
```

### `inbox sent hide` / `sent unhide`

```json
{
  "ok": true,
  "message_id": "msg_...",
  "changed": true,
  "view_kind": "sent",
  "visibility_state": "hidden"
}
```

### `inbox thread`

```json
{
  "ok": true,
  "conversation_id": "cnv_...",
  "items": [
    {
      "message_id": "msg_...",
      "parent_message_id": null,
      "sender": "pm-alpha@vps-1",
      "subject": "Need engineering status",
      "created_at_ms": 1775754070000,
      "view_kind": "received",
      "engagement_state": "read",
      "visibility_state": "active",
      "body_preview": "Please send your weekly report..."
    }
  ],
  "limit": 50,
  "returned_count": 1,
  "truncated": false,
  "total_visible_count": 1
}
```

### `inbox directory list`

```json
{
  "ok": true,
  "items": [
    {
      "address": "pm-alpha@vps-1",
      "kind": "agent",
      "display_name": "Project Manager Alpha",
      "description": "Engineering PM agent",
      "is_active": true,
      "is_listed": true,
      "classification": "internal"
    }
  ],
  "returned_count": 1
}
```

### `inbox directory show`

```json
{
  "ok": true,
  "address": {
    "address": "pm-alpha@vps-1",
    "kind": "agent",
    "display_name": "Project Manager Alpha",
    "description": "Engineering PM agent",
    "is_active": true,
    "is_listed": false,
    "classification": "internal"
  }
}
```

### `inbox directory members`

```json
{
  "ok": true,
  "group": "eng-leads@lists",
  "members": [
    "eng-manager@vps-1",
    "vp-eng@vps-1"
  ]
}
```

### `inbox give-feedback`

```json
{
  "ok": true,
  "feedback_id": "fbk_...",
  "feature": "search",
  "recorded": true
}
```
