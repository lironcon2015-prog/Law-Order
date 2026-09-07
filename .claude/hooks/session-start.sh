#!/bin/bash
# session-start.sh — רץ בפתיחת כל סשן (Claude Code on the web).
# אין תלויות להתקין בפרויקט (Vanilla JS, בלי build step), ולכן ההוק עושה דבר אחד:
# מריץ את בדיקת השפיות של ה-repo, כדי ששתי הטעויות שכבר קרו לא יחזרו —
#   1. מסירת קובץ אופליין שנבנה מ-main בזמן שענף אחר מחזיק עבודה שלא מוזגה.
#   2. הורדת DB_VERSION מתחת למה שכבר קיים אצל המשתמש (IndexedDB חוסם את האפליקציה).
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
command -v node >/dev/null 2>&1 || exit 0

# הבדיקה לעולם לא מפילה את פתיחת הסשן
timeout 90 node tools/repo-audit.mjs 2>/dev/null || echo "repo-audit: הבדיקה לא הושלמה (רשת/גיט) — להריץ ידנית: node tools/repo-audit.mjs"
