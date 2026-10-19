#!/usr/bin/env bash
# Rebuild vendor/lib/tailwind.css from the current HTML/JS sources.
# Run this whenever new Tailwind classes are added that weren't in the
# codebase at the time tailwind.css was last generated.
#
# Usage:
#   cd build && bash rebuild-tailwind.sh
set -euo pipefail
cd "$(dirname "$0")"
npx -y -p tailwindcss@3.4.19 \
       -p @tailwindcss/forms@0.5.11 \
       -p @tailwindcss/container-queries@0.1.1 \
       tailwindcss -c tailwind.config.js \
                   -i tailwind-input.css \
                   -o ../vendor/lib/tailwind.css \
                   --minify
echo "✓ vendor/lib/tailwind.css rebuilt"
