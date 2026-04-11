# lib/ -- Module responsibilities

Each `.sh` file in this directory owns one concern. Files are sourced in
alphabetical order by `bin/inbox` and `tests/helpers.sh`.

## Module map

| Module            | Responsibility                                            |
|-------------------|-----------------------------------------------------------|
| `commands.sh`     | CLI command handlers (`cmd_*`). Wires parsing to library functions to formatters. |
| `common.sh`       | Exit code constants, `generate_id`, `now_ms`, `json_escape`, `error_json`, `success_json`. |
| `db.sh`           | SQLite connection, `db_init`, `db_exec`, `db_query`, `db_transaction`, `db_exists`, `db_count`. |
| `experimental.sh` | Experimental discovery mode: surface definitions, `experimental_probe`, `do_give_feedback`. |
| `format.sh`       | Output switching (`format_output`, `format_error`), text table formatters. |
| `mutate.sh`       | Idempotent state mutations: `do_read`, `do_ack`, `do_hide`, `do_unhide`, `do_sent_hide`, `do_sent_unhide`. |
| `parse.sh`        | Input parsing: `parse_body_source`, `parse_ref`, `parse_time_filter`, `validate_msg_id`, `validate_urgency`. |
| `query.sh`        | Read-path queries: `query_sent_list`, `query_sent_read`, inbox list, directory. |
| `resolve.sh`      | THE shared resolver. `resolve_actor`, `resolve_inbox`, `resolve_sent`, `resolve_thread_visibility`, `expand_list`, `construct_reply_all_audience`. |
| `send.sh`         | Write-path transactions: `do_send`, `do_reply`, `do_send_in_conversation`. |
| `telemetry.sh`    | NDJSON telemetry: `telemetry_init`, `telemetry_record`, `telemetry_finish_command`. |

## Resolver rules

All access-control decisions flow through `resolve.sh`:

- **Actor resolution**: `INBOX_ADDRESS` -> address row. Inactive -> `permission_denied`. Unknown -> `not_found` (conflated with inaccessible).
- **Inbox resolution**: delivery lookup by `(message_id, recipient_address_id)`. Missing -> `not_found`.
- **Sent resolution**: sent_item lookup joining through sender. Missing -> `not_found`.
- **Thread visibility**: union of actor's deliveries and sent_items for a conversation. Self-send included once.
- **List expansion**: `expand_list` returns active members in ordinal order, skipping inactive.
- **Reply-all**: `construct_reply_all_audience` uses original public headers (not expanded deliveries), adds sender, removes actor.

## Naming conventions

- Library functions: `verb_noun` (e.g., `resolve_actor`, `do_send`, `query_sent_list`).
- Command handlers: `cmd_<command>` (e.g., `cmd_whoami`, `cmd_send`).
- Text formatters: `format_<thing>` (e.g., `format_list_items`, `format_message`).
- Internal helpers: `_prefixed` (e.g., `_format_age`, `_cli_fixtures`).
