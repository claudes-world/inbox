# Code review conventions

## PR requirements

- One PR per issue. Feature branches merge into the current `dev-phase*`.
- All existing tests must pass before merge.
- New behavior requires new test coverage.

## Review checklist

### Security
- [ ] SQL queries use proper escaping (`'` -> `''` for string values)
- [ ] No raw user input concatenated into SQL
- [ ] JSON output uses `json_escape` for dynamic string values
- [ ] `--ref-file` size limit enforced (1,048,576 bytes)

### Contract compliance
- [ ] JSON output matches flat envelope: `{ok: true, ...}` or `{ok: false, error: {...}}`
- [ ] Exit codes match `EXIT_*` constants (0-6)
- [ ] `--json` mode: all output to stdout, stderr silent
- [ ] Text mode: errors to stderr, data to stdout

### State management
- [ ] Mutations are idempotent (no-op returns `changed: false`, no duplicate events)
- [ ] Multi-step mutations use `db_transaction` (all-or-nothing)
- [ ] Thread visibility invariants preserved (union of deliveries + sent_items)
- [ ] Experimental surfaces never mutate protocol tables

### Code quality
- [ ] Functions follow naming conventions (`cmd_*`, `do_*`, `query_*`, `format_*`)
- [ ] Module boundaries respected (resolve logic in resolve.sh, not in commands.sh)
- [ ] `set -euo pipefail` in scripts
- [ ] ID prefix validation for user-supplied IDs (`msg_`, `cnv_`)

## Common issues

1. **Missing SQL escaping:** Always escape single quotes in values that
   could contain user text (subject, body, display names).

2. **JSON injection:** Use `json_escape` from `lib/common.sh` for any
   dynamic string embedded in JSON output.

3. **Broken idempotency:** If adding a new mutation, ensure the "already
   in target state" case returns success with `changed: false` and does
   NOT append a delivery_event.

4. **Thread visibility leak:** Never expose message existence to actors
   who have neither a delivery nor a sent_item for that message.
