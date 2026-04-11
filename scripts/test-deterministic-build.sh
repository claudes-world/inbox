#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION="$(cat VERSION)"

./scripts/build-dist.sh >/dev/null
first_sha="$(cut -d ' ' -f1 "dist/inbox-$VERSION.tar.gz.sha256")"

./scripts/build-dist.sh >/dev/null
second_sha="$(cut -d ' ' -f1 "dist/inbox-$VERSION.tar.gz.sha256")"

if [[ "$first_sha" != "$second_sha" ]]; then
  echo "error: deterministic build check failed" >&2
  echo "first:  $first_sha" >&2
  echo "second: $second_sha" >&2
  exit 1
fi

echo "Deterministic build check passed: $first_sha"
