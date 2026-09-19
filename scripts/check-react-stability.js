const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const RULES = [
  { label: "array index", pattern: /\bkey\s*=\s*\{\s*(?:index|idx|i)\s*\}/g },
  { label: "Math.random()", pattern: /\bkey\s*=\s*\{[^}]*Math\.random\s*\(/g },
  { label: "Date.now()", pattern: /\bkey\s*=\s*\{[^}]*Date\.now\s*\(/g },
  { label: "randomUUID()", pattern: /\bkey\s*=\s*\{[^}]*randomUUID\s*\(/g },
];

// Temporary debt budget from the audited main branch. Counts are intentionally
// path-based rather than line-based so harmless line movement cannot break CI.
// Reduce/remove an entry whenever the corresponding component is corrected.
const BASELINE = new Map([
  ["src/pages/FeedPage.js:array index", 1],
  ["src/pages/blog/BlogArticlePage.js:array index", 2],
  ["src/pages/event/EventUpdatePage.js:array index", 1],
  ["src/pages/production/ProductionCreatePage.js:array index", 1],
  ["src/pages/search/GlobalSearchPage.js:array index", 1],
]);

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
};
walk(ROOT);

const counts = new Map();
const details = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(source))) {
      const line = source.slice(0, match.index).split("\n").length;
      const key = `${relative}:${rule.label}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      details.push({ key, relative, line, label: rule.label });
    }
  }
}

const failures = [];
for (const [key, count] of counts) {
  const allowed = BASELINE.get(key) || 0;
  if (count > allowed) failures.push(`${key} — ${count} found, ${allowed} allowed`);
}
for (const [key, allowed] of BASELINE) {
  const count = counts.get(key) || 0;
  if (count < allowed) failures.push(`${key} — debt improved (${count}/${allowed}); reduce the baseline in this PR`);
}

if (failures.length) {
  console.error("React stability policy failed. Unstable key debt may only decrease and the baseline must track that decrease.\n");
  failures.forEach((entry) => console.error(`- ${entry}`));
  if (details.length) {
    console.error("\nCurrent unstable keys:");
    details.forEach(({ relative, line, label }) => console.error(`- ${relative}:${line} — ${label}`));
  }
  process.exit(1);
}

const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
console.log(`React stability policy passed (${files.length} source files checked; ${total} tracked legacy violations remain).`);
