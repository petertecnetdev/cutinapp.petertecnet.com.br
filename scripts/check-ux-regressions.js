const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const failures = [];
const checks = [
  { label: 'hard reload', pattern: /(?:window\.)?location\.reload\s*\(/g, reason: 'Use state/cache invalidation or router navigation instead of a full reload.' },
  { label: 'native alert', pattern: /\b(?:window\.)?alert\s*\(/g, reason: 'Use the Cutinapp dialog/toast primitives.' },
  { label: 'random React key', pattern: /key\s*=\s*\{[^}]*?(?:Math\.random|Date\.now|randomUUID)\s*\(/g, reason: 'Use a stable domain identifier for React keys.' },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(sourceRoot)) {
  const relative = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of text.matchAll(check.pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      failures.push(`${relative}:${line} ${check.label}: ${check.reason}`);
    }
  }
}

if (failures.length) {
  console.error('UX/performance architecture regression detected:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('UX/performance architecture guard OK.');
