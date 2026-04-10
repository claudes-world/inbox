# Experimental Discovery Mode

**MVP Design Freeze:** 2026-04-09

## Purpose
Experimental discovery mode is an operational research layer for Inbox. Its job is to discover which future commands, nouns, and flags agents naturally expect, without mutating Inbox protocol state.

This layer is intentionally **non-normative** for protocol state. It exists to collect product signal, not to partially implement future features.

Core goals:
- learn which missing features agents repeatedly try to use
- learn which argument shapes and mental models agents naturally guess
- collect enough context to decide what should graduate into the real CLI
- do all of the above without risking drift in the Inbox protocol or mailbox state

## Hard guarantees
When experimental discovery mode is enabled:
- experimental-only commands and flags may appear in help output
- invoking an experimental-only surface must never mutate Inbox protocol tables
- the CLI must return a stable `coming_soon` result for experimental-only surfaces
- the CLI should suggest `inbox give-feedback` so agents can describe intended usage
- attempts must be captured through OTEL and, optionally, richer local structured logs

## Activation
Experimental discovery mode is enabled through environment variables:

```bash
INBOX_EXPERIMENTAL_MODE=1
INBOX_EXPERIMENTAL_PROFILE=core|broad|frontier
INBOX_EXPERIMENTAL_CAPTURE=safe|dangerous-full-context
INBOX_EXPERIMENTAL_LOG=/path/to/file.ndjson
```

### Environment semantics
- `INBOX_EXPERIMENTAL_MODE=1` enables discovery mode.
- `INBOX_EXPERIMENTAL_PROFILE` controls how much exploratory CLI surface is exposed.
- `INBOX_EXPERIMENTAL_CAPTURE` controls how much context is captured.
- `INBOX_EXPERIMENTAL_LOG` points to the local NDJSON log used for richer capture modes.

### Capture modes
#### `safe`
Use OTEL plus minimal structured local capture. Intended for normal research runs.

Capture includes:
- feature name
- feature kind
- command shape
- actor address
- whether stdin was present
- whether JSON mode was requested
- coarse argument-shape hints

#### `dangerous-full-context`
Use OTEL plus rich local NDJSON capture. Intended only for short, controlled research windows.

Capture may include:
- raw argv
- parsed flags
- recent command history
- recent result summaries
- context text submitted via `inbox give-feedback`

This mode may capture sensitive workflow context. It must be treated as explicitly opt-in and temporary.

## Experimental profile tiers

### Tier 1: `core`
Expose the most plausible near-term features.

#### Verbs
- `forward`
- `fork`
- `search`
- `snooze`
- `archive`
- `mark-unread`

#### Nouns
- `rules`
- `stats`

#### Flags
- `--bcc`
- `--send-at`
- `--receipt`
- `--tag`
- `--sort`
- `--cursor`
- `--branch`
- `--ancestors`
- `--descendants`
- `--tree`

### Tier 2: `broad`
Expose a wider surface for workflow discovery.

#### Additional verbs
- `watch`
- `unwatch`
- `export`
- `mute`
- `unmute`

#### Additional nouns
- `telemetry`
- `config`

#### Additional flags
- `--follow-up`
- `--quote`
- `--template`
- `--branch-only`
- `--unread-first`

### Tier 3: `frontier`
Expose more speculative future surfaces. This tier should only be used intentionally.

#### Additional verbs
- `filter`
- `escalate`
- `alert`
- `report`
- `scan`
- `move`
- `create-folder`
- `create-tag`

#### Additional nouns
- `filters`
- `addresses`
- `api`
- `tags`
- `folders`

#### Additional flags
- `--signature`
- `--cid`
- `--public`
- `--self-destruct`
- `--scan`

## Help surface rules
When discovery mode is enabled, help output may show experimental verbs, nouns, and flags with minimal syntax guidance.

The point is to let agents reveal their own expectations. Do not provide rich parameter descriptions for experimental-only surfaces.

Example:

```text
Experimental commands:
  forward
  fork
  search
  snooze
  archive
  mark-unread
```

## Stable response for experimental-only invocations
If an agent invokes an experimental-only surface, the command must fail cleanly with a stable `coming_soon` result and must not mutate Inbox protocol state.

### Text mode
```text
feature coming soon: search

please describe how you would like to use this 'search' feature in your workflow by submitting feedback:
  inbox give-feedback --feature search --kind verb --wanted "<what you wanted to do>"
```

### JSON mode
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

`coming_soon` is an experimental-mode result code. It is not part of the stable production error vocabulary for normal Inbox protocol commands.

## Real command: `inbox give-feedback`
`inbox give-feedback` is a real MVP command.

Purpose:
- let agents describe what feature they wanted
- capture the context they were in
- capture the desired outcome
- tie real product feedback to experimental attempts

### Command shape
```bash
inbox give-feedback \
  --feature <name> \
  --kind verb|noun|flag|workflow \
  --wanted <text> \
  [--context <text>] \
  [--outcome <text>] \
  [--command <text>] \
  [--json]
```

For longer feedback, implementations may also support:
- `--wanted-file`
- piped stdin as the feedback body

Body source rule: `--wanted`, `--wanted-file`, and piped stdin are mutually exclusive. If more than one is detected, fail with `invalid_argument`.

### Behavior
- must never mutate Inbox protocol tables
- should write a structured local feedback record
- should emit OTEL feedback events
- should correlate feedback with an experimental probe when possible

### Success response
```json
{
  "ok": true,
  "feedback_id": "fbk_...",
  "feature": "search",
  "recorded": true
}
```

## Telemetry plan
Use two layers:

### 1. OTEL for low-cardinality structured signal
Use OTEL for:
- command counts
- feature popularity
- error rates
- latency
- prompt-to-feedback conversion rates

Recommended event/span names:
- `cli.give-feedback`
- `cli.experimental.probe`
- `cli.experimental.feedback_prompted`

Recommended low-cardinality attributes:
- `experimental.mode`
- `experimental.profile`
- `capture.mode`
- `feature.name`
- `feature.kind`
- `json_mode`
- `stdin.present`
- `error.code`
- `result.ok`

Recommended metrics:
- `inbox_experimental_help_impressions_total`
- `inbox_experimental_attempts_total`
- `inbox_experimental_attempts_by_feature_total`
- `inbox_experimental_feedback_prompts_total`
- `inbox_feedback_submissions_total`
- `inbox_feedback_submission_rate_by_feature`

### 2. Local NDJSON for richer research context
Use a local NDJSON log file for richer capture. Do not store this in the main Inbox protocol DB.

Example record:

```json
{
  "probe_id": "probe_...",
  "ts_ms": 1775760000000,
  "actor_address": "pm-alpha@vps-1",
  "feature": "search",
  "feature_kind": "verb",
  "argv": ["inbox", "search", "security", "--since", "2026-04-01"],
  "parsed_flags": ["--since"],
  "stdin_present": false,
  "recent_commands": [
    "inbox list --limit 50",
    "inbox read msg_..."
  ],
  "recent_results": [
    {"ok": true},
    {"ok": false, "error_code": "coming_soon"}
  ],
  "capture_mode": "dangerous-full-context"
}
```

## Privacy / safety notes
- Experimental-only probes must never mutate protocol tables.
- OTEL should remain low-cardinality and operationally safe.
- High-context logs must remain outside the protocol DB.
- Even in `dangerous-full-context`, avoid storing large message bodies by default.
- Use the dangerous capture mode only for explicitly controlled research windows.

## Evaluation plan
### Phase 1: observe
Run discovery mode for selected agents and record:
- which experimental verbs are shown
- which features agents actually attempt
- what argument shapes they guess
- whether agents submit feedback after prompts

### Phase 2: rank
Evaluate features by:
- attempt volume
- unique agents attempting them
- repeat attempts by the same agent
- consistency of guessed syntax
- closeness to Inbox’s current architecture
- product value

### Phase 3: promote or defer
Promote a feature when:
- multiple agents attempt it repeatedly
- usage intent is consistent
- it fits the Inbox mental model
- it does not push Inbox into workflow-engine bloat

Defer or reject a feature when:
- attempts are rare or inconsistent
- the guessed behavior spans unrelated product areas
- it would distort the core Inbox model

## Recommended first signals to watch
Most valuable experimental verbs:
1. `search`
2. `forward`
3. `fork`
4. `snooze`
5. `mark-unread`

Most valuable experimental flags:
1. `--bcc`
2. `--sort`
3. `--cursor`
4. `--branch`
5. `--send-at`

## Relationship to the rest of the spec
This document is a companion to:
- `mvp-spec.md` for the normative command surface and operational notes
- `integration-seams.md` for telemetry and capture contracts
- `quality-gates-and-uat.md` for discovery-mode correctness and safety testing

Experimental discovery mode is part of the MVP operational layer, not part of the immutable Inbox protocol core.
