#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION="$(cat VERSION)"
SMOKE_DIR="/tmp/inbox-smoketest-$$"
trap 'rm -rf "$SMOKE_DIR"' EXIT

./scripts/build-dist.sh

mkdir -p "$SMOKE_DIR"
tar -xzf "dist/inbox-$VERSION.tar.gz" -C "$SMOKE_DIR"

INSTALLED_INBOX="$SMOKE_DIR/inbox-$VERSION/bin/inbox"

actual_version="$("$INSTALLED_INBOX" --version)"
if [[ "$actual_version" != "$VERSION" ]]; then
  echo "error: expected version $VERSION, got $actual_version" >&2
  exit 1
fi

"$INSTALLED_INBOX" --help >/dev/null

echo "Installed layout smoke test passed: $INSTALLED_INBOX"
