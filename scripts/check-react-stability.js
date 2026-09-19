const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src");
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const unstableKeyPatterns = [
  { label: "array index", pattern: /\bkey\s*=\s*\{\s*(?:index|idx|i)\s*\}/g },
  { label: "Math.random()", pattern: /\bkey\s*=\s*\{[^}]*Math\.random\s*\(/g },
  { label: "Date.now()", pattern: /\bkey\s*=\s*\{[^}]*Date\.now\s*\(/g },
  { label: "randomUUID()", pattern: /\bkey\s*=\s*\{[^}]*randomUUID\s*\(/g },
];

// Existing debt is explicit and finite. CI fails if a new unstable key appears;
// entries must be removed from this baseline as their components are corrected.
const BASELINE = new Set([
  "src/pages/FeedPage.js:237:array index",
  "src/pages/NotificationsPage.js:124:array index",
  "src/pages/blog/BlogArticlePage.js:110:array index",
  "src/pages/blog/BlogArticlePage.js:111:array index",
  "src/pages/event/EventUpdatePage.js:402:array index",
  "src/pages/moderation/ReportModerationPage.js:59:array index",
  "src/pages/production/ProductionCreatePage.js:389:array index",
  "src/pages/search/GlobalSearchPage.js:163:array index",
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

const violations = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const rule of unstableKeyPatterns) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(source))) {
      const line = source.slice(0, match.index).split("\n").length;
      const relative = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
      violations.push({ key: `${relative}:${line}:${rule.label}`, relative, line, label: rule.label });
    }
  }
}

const current = new Set(violations.map(({ key }) => key));
const newViolations = violations.filter(({ key }) => !BASELINE.has(key));
const staleBaseline = [...BASELINE].filter((key) => !current.has(key));

if (staleBaseline.length) {
  console.error("React stability baseline contains resolved entries. Remove them so debt cannot silently return:\n");
  staleBaseline.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}

if (newViolations.length) {
  console.error("React stability policy failed. New keys must identify domain records, not render position or random values.\n");
  newViolations.forEach(({ relative, line, label }) => console.error(`- ${relative}:${line} — unstable React key (${label})`));
  process.exit(1);
}

console.log(`React stability policy passed (${files.length} source files checked; ${violations.length} known violations remain in tracked baseline).`);
