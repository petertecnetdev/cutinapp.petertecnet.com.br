const { execFileSync } = require('child_process');

const checks = [
  { label: 'hard reload', pattern: /(?:window\.)?location\.reload\s*\(/g, reason: 'Use state/cache invalidation or router navigation instead of a full reload.' },
  { label: 'native alert', pattern: /\b(?:window\.)?alert\s*\(/g, reason: 'Use the Cutinapp dialog/toast primitives.' },
  { label: 'random React key', pattern: /key\s*=\s*\{[^}]*?(?:Math\.random|Date\.now|randomUUID)\s*\(/g, reason: 'Use a stable domain identifier for React keys.' },
];

function getAddedSourceLines() {
  let diff;
  try {
    diff = execFileSync('git', ['diff', '--unified=0', 'HEAD^', 'HEAD', '--', 'src'], { encoding: 'utf8' });
  } catch {
    console.log('UX/performance architecture guard skipped: no parent diff available.');
    return [];
  }

  const added = [];
  let file = null;
  let line = 0;
  let skipFile = false;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      skipFile = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[jt]sx?$/.test(file);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || raw.startsWith('---')) continue;
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (!skipFile) added.push({ file, line, text: raw.slice(1) });
      line += 1;
    } else if (!raw.startsWith('-')) {
      line += 1;
    }
  }
  return added;
}

const failures = [];
for (const { file, line, text } of getAddedSourceLines()) {
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(text)) failures.push(`${file}:${line} ${check.label}: ${check.reason}`);
  }
}

if (failures.length) {
  console.error('UX/performance architecture regression detected:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('UX/performance architecture guard OK: no forbidden production patterns added.');
