const cp = require("child_process");
const fs = require("fs");

const allowed = new Set([
  "src/styles/overlay-layout-system.css",
  "src/styles/tokens.css",
  "src/styles/cart-menu-safe-layer.css",
  "src/styles/persistent-cart.css",
  "src/styles/mobile-navigation-v2.css",
  "src/styles/mobile-footer-regression-fixes.css",
  "src/pages/event/EventUpdatePageV2.css",
]);

const declarationPattern = /(?:z-index\s*:\s*(?:[1-9]\d{2,}|999)|bottom\s*:\s*(?:6[0-9]|7[0-9]|1[0-9]{2})px)(?:\s*!important)?/gi;

function changedCssFiles() {
  try {
    return cp.execSync("git diff --name-only HEAD^ HEAD -- '*.css'", { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function readPrevious(file) {
  try {
    return cp.execFileSync("git", ["show", `HEAD^:${file}`], { encoding: "utf8" });
  } catch (_) {
    return "";
  }
}

function collect(content) {
  const counts = new Map();
  for (const match of content.matchAll(declarationPattern)) {
    const normalized = match[0].replace(/\s+/g, "").toLowerCase();
    const item = {
      declaration: match[0],
      index: match.index ?? 0,
    };
    const bucket = counts.get(normalized) || [];
    bucket.push(item);
    counts.set(normalized, bucket);
  }
  return counts;
}

function lineAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

const changed = changedCssFiles();
const violations = [];

for (const file of changed) {
  if (allowed.has(file) || !fs.existsSync(file)) continue;

  const previous = readPrevious(file);
  const current = fs.readFileSync(file, "utf8");
  const oldDeclarations = collect(previous);
  const newDeclarations = collect(current);

  for (const [normalized, currentItems] of newDeclarations.entries()) {
    const previousCount = oldDeclarations.get(normalized)?.length || 0;
    if (currentItems.length <= previousCount) continue;

    for (const item of currentItems.slice(previousCount)) {
      violations.push(
        `${file}:${lineAt(current, item.index)}: newly introduced overlay declaration ${item.declaration.trim()}`
      );
    }
  }
}

if (violations.length) {
  console.error("Overlay policy violation:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(
  `Overlay policy OK (${changed.length} changed CSS files checked; existing declarations were not treated as new regressions).`
);
