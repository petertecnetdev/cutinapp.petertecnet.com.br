const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checks = [
  { label: 'hard reload', pattern: /(?:window\.)?location\.reload\s*\(/g, reason: 'Use state/cache invalidation or router navigation instead of a full reload.' },
  { label: 'native alert', pattern: /\b(?:window\.)?alert\s*\(/g, reason: 'Use the Cutinapp dialog/toast primitives.' },
  { label: 'native confirm', pattern: /\b(?:window\.)?confirm\s*\(/g, reason: 'Use an accessible Cutinapp confirmation dialog instead of the blocking browser modal.' },
  { label: 'native prompt', pattern: /\b(?:window\.)?prompt\s*\(/g, reason: 'Use a Cutinapp form/dialog primitive instead of the blocking browser prompt.' },
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

function readGlobalCss() {
  return fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf8');
}

function checkReducedMotionContract(css) {
  const failures = [];
  const mediaStart = css.indexOf('@media (prefers-reduced-motion: reduce)');

  if (mediaStart === -1) {
    failures.push('src/styles/global.css: missing global prefers-reduced-motion: reduce media query.');
    return failures;
  }

  const reducedMotionBlock = css.slice(mediaStart);
  const requiredContracts = [
    ['smooth scrolling disabled', /html\s*\{[^}]*scroll-behavior\s*:\s*auto\s*;[^}]*\}/s],
    ['animations effectively disabled', /animation-duration\s*:\s*\.01ms\s*!important\s*;/],
    ['animation loops capped', /animation-iteration-count\s*:\s*1\s*!important\s*;/],
    ['transitions effectively disabled', /transition-duration\s*:\s*\.01ms\s*!important\s*;/],
  ];

  for (const [label, pattern] of requiredContracts) {
    if (!pattern.test(reducedMotionBlock)) failures.push(`src/styles/global.css: reduced-motion contract weakened: ${label}.`);
  }
  return failures;
}

function checkFocusVisibleContract(css) {
  const failures = [];
  const match = css.match(/:focus-visible\s*\{([^}]*)\}/s);
  if (!match) {
    failures.push('src/styles/global.css: missing global :focus-visible keyboard focus treatment.');
    return failures;
  }

  const declarations = match[1];
  const outline = declarations.match(/outline\s*:\s*([^;]+)\s*;/i)?.[1]?.trim() || '';
  const offset = declarations.match(/outline-offset\s*:\s*([^;]+)\s*;/i)?.[1]?.trim() || '';

  if (!outline || /\b(?:none|0(?:px|rem|em)?)\b/i.test(outline) || /transparent/i.test(outline)) {
    failures.push('src/styles/global.css: :focus-visible must keep a visible non-zero outline.');
  }
  if (!offset || /^0(?:px|rem|em)?$/i.test(offset)) {
    failures.push('src/styles/global.css: :focus-visible must keep non-zero outline-offset so focus is visually distinct.');
  }
  return failures;
}

function checkAddedAccessibility(lines) {
  const failures = [];
  for (const { file, line, text } of lines) {
    if (/<img\b/i.test(text) && !/\balt\s*=/.test(text)) {
      failures.push(`${file}:${line} image accessibility: new <img> must declare alt text (use alt="" for decorative images).`);
    }
  }
  return failures;
}

const globalCss = readGlobalCss();
const addedSourceLines = getAddedSourceLines();
const failures = [
  ...checkReducedMotionContract(globalCss),
  ...checkFocusVisibleContract(globalCss),
  ...checkAddedAccessibility(addedSourceLines),
];
for (const { file, line, text } of addedSourceLines) {
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(text)) failures.push(`${file}:${line} ${check.label}: ${check.reason}`);
  }
}

if (failures.length) {
  console.error('UX/performance architecture regression detected:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('UX/performance architecture guard OK: forbidden production patterns absent; reduced-motion, keyboard focus and new-image alt contracts preserved.');
