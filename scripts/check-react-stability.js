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

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
};
walk(ROOT);

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const rule of unstableKeyPatterns) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(source))) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${path.relative(path.resolve(__dirname, ".."), file)}:${line} — unstable React key (${rule.label})`);
    }
  }
}

if (failures.length) {
  console.error("React stability policy failed. Keys must identify domain records, not render position or random values.\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`React stability policy passed (${files.length} source files checked).`);
