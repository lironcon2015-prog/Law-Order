#!/usr/bin/env bash
# Rebuild LexLedger-Offline.html — a single self-contained file for offline use.
# Bundles all CSS, JS, fonts (base64) and the PDF.js worker into index.html.
#
# Run this on every version bump so the offline file stays in sync.
#
# Usage:
#   bash build/rebuild-offline.sh   (from repo root)
set -euo pipefail
cd "$(dirname "$0")/.."
node build/build-offline.js
