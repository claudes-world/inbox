# tests/ -- Test conventions

## Running tests

```bash
bash tests/runner.sh              # all gates
bash tests/runner.sh --gate 2     # single gate
bash tests/runner.sh --verbose    # show each test name
VERBOSE=1 bash tests/runner.sh    # equivalent
```

## Test structure

Each test file:
1. Declares `TEST_GATE=N` at the top for gate filtering.
2. Defines fixture functions (e.g., `_cli_fixtures`) that insert seed data.
3. Defines test functions (`test_*`) that call fixtures, exercise code, assert.
4. Registers tests at the bottom with `run_test "name" function gate`.

## Isolation

Every test gets a fresh temp directory and empty database via
`setup_test_db` / `teardown_test_db` in `helpers.sh`. Tests must not
depend on ordering or shared state.

## Assertion functions

| Function              | Purpose                                      |
|-----------------------|----------------------------------------------|
| `assert_eq`           | String equality                              |
| `assert_neq`          | String inequality                            |
| `assert_contains`     | Substring match                              |
| `assert_exit_code`    | Run command, check exit code                 |
| `assert_json_field`   | Extract JSON field via sqlite3, compare      |
| `assert_json_ok`      | Verify `{ok: true}`                          |
| `assert_json_error`   | Verify `{ok: false, error.code: "..."}`      |

## Quality gates

| Gate | What it tests                          | Files                              |
|------|----------------------------------------|------------------------------------|
| 1    | Schema DDL, constraints, triggers      | `test_schema.sh`                   |
| 2    | Resolvers, visibility, list expansion  | `test_resolve.sh`                  |
| 3    | Send/reply transactions, mutations     | `test_write.sh`, `test_mutate.sh`  |
| 4    | CLI contracts, experimental mode       | `test_cli.sh`, `test_experimental.sh` |
| 5    | UAT end-to-end scenarios               | `test_uat.sh`                      |

## Writing a new test

1. Create `test_<name>.sh` with `TEST_GATE=<gate>`.
2. Source no files -- `runner.sh` sources `helpers.sh` which sources all libs.
3. Access the CLI as a subprocess via `"$PROJECT_DIR/bin/inbox"`.
4. Register with `run_test "label" function_name gate_number`.
