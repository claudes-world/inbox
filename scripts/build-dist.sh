#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

VERSION="$(cat VERSION)"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$STAGE_DIR/inbox-$VERSION/bin"
mkdir -p "$STAGE_DIR/inbox-$VERSION/lib/inbox"
mkdir -p "$STAGE_DIR/inbox-$VERSION/share/inbox"

cp bin/inbox "$STAGE_DIR/inbox-$VERSION/bin/"
cp lib/*.sh "$STAGE_DIR/inbox-$VERSION/lib/inbox/"
cp -r schema "$STAGE_DIR/inbox-$VERSION/share/inbox/"
cp VERSION "$STAGE_DIR/inbox-$VERSION/"
cp README.md "$STAGE_DIR/inbox-$VERSION/" 2>/dev/null || true
cp AGENTS.md "$STAGE_DIR/inbox-$VERSION/" 2>/dev/null || true
cp LICENSE "$STAGE_DIR/inbox-$VERSION/" 2>/dev/null || true

chmod 755 "$STAGE_DIR/inbox-$VERSION/bin/inbox"
chmod 644 "$STAGE_DIR/inbox-$VERSION/lib/inbox/"*.sh

mkdir -p dist
TZ=UTC tar \
  --sort=name \
  --mtime='2026-01-01 00:00Z' \
  --owner=0 --group=0 \
  --numeric-owner \
  -C "$STAGE_DIR" \
  -cf - "inbox-$VERSION" \
| gzip -n > "dist/inbox-$VERSION.tar.gz"

(cd dist && sha256sum "inbox-$VERSION.tar.gz" > "inbox-$VERSION.tar.gz.sha256")

echo "Built: dist/inbox-$VERSION.tar.gz"
echo "SHA256: $(cat dist/inbox-$VERSION.tar.gz.sha256)"
