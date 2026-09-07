// stamp.mjs — כותב את חותמת הגרסה ל-budget/js/version.js.
// רץ אוטומטית מתוך build-offline.mjs, כך שכל בילד נושא תאריך, commit וגרסת SW.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BUDGET = join(dirname(fileURLToPath(import.meta.url)), '..');

const git = (cmd, fallback = '') => {
  try { return execSync(cmd, { cwd: BUDGET, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return fallback; }
};

/** כותב את version.js ומחזיר את החותמת */
export function stamp({ channel = 'web' } = {}) {
  const cache = (readFileSync(join(BUDGET, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/) || [])[1] || '';
  const build = {
    builtAt: new Date().toISOString(),
    commit: git('git rev-parse --short HEAD', 'unknown'),
    branch: git('git rev-parse --abbrev-ref HEAD', ''),
    cache,
    channel,
  };
  const src = `// version.js — חותמת הגרסה של הבילד. **נכתב אוטומטית** ע"י \`node budget/build-offline.mjs\`
// (דרך tools/stamp.mjs) — אין לערוך ידנית. מוצג במסך ההגדרות כדי שאפשר יהיה להשוות
// בין קובץ אופליין לאתר החי, ובין שני קבצים, בלי לנחש מי חדש יותר.
export const BUILD = ${JSON.stringify(build, null, 2).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'")};
`;
  writeFileSync(join(BUDGET, 'js/version.js'), src, 'utf8');
  return build;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = stamp({ channel: process.argv[2] === 'offline' ? 'offline' : 'web' });
  console.log(`✓ version.js — ${b.builtAt} · ${b.commit} · ${b.cache}`);
}
