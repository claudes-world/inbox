# Development workflow

## Prerequisites

- Bash 4.4+ (`bash --version`)
- sqlite3 3.46.1+ with JSON1 (`sqlite3 --version`)
- Git

## Setup

```bash
git clone <repo>
cd inbox

# Verify requirements
bash --version | head -1
sqlite3 --version
```

No build step, no package install, no compilation.

## Development cycle

### 1. Create a feature branch

```bash
git checkout dev-phase5
git checkout -b feat/issue-N-description
```

### 2. Make changes

Edit files under `lib/`, `bin/`, `schema/`, or `tests/`.

### 3. Test locally

```bash
# Run all tests
bash tests/runner.sh

# Run a specific gate
bash tests/runner.sh --gate 3

# Verbose mode (see individual test names)
bash tests/runner.sh --verbose
```

### 4. Manual smoke test

```bash
export INBOX_DB=/tmp/inbox-test.db
export INBOX_ADDRESS=my-agent@test

# Initialize database
bin/inbox whoami

# Send a message (need addresses in DB first -- use schema/seed.sql)
sqlite3 "$INBOX_DB" < schema/seed.sql
export INBOX_ADDRESS=pm-alpha@vps-1
bin/inbox list --json
bin/inbox whoami --json
```

### 5. Commit and push

```bash
git add <files>
git commit -m "feat(scope): description (#issue)"
git push -u origin feat/issue-N-description
```

### 6. Create PR

PR merges into the current `dev-phase*` branch, not `main`.

## Commit message format

```
type(scope): description (#issue)
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`.
Scopes: `cli`, `resolve`, `send`, `mutate`, `query`, `schema`,
`experimental`, `telemetry`.

## Adding a new command

1. Add the `cmd_<name>` handler in `lib/commands.sh`.
2. Add routing in `bin/inbox` (the case statement in `_run_command`).
3. Add a text formatter in `lib/format.sh` if needed.
4. Add CLI tests in `tests/test_cli.sh`.
5. Update `bin/inbox --help` text.

## Adding a new test

1. Create `tests/test_<name>.sh`.
2. Set `TEST_GATE=N` at the top.
3. Define fixture functions and test functions.
4. Register tests at the bottom with `run_test`.
5. The runner auto-discovers `test_*.sh` files.
