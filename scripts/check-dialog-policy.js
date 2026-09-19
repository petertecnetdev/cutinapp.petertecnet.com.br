const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "src");
const allowed = new Set([path.join(root, "utils", "sweetAlert.js")]);
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const violations = [];

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!extensions.has(path.extname(entry.name)) || /\.test\.[jt]sx?$/.test(entry.name) || allowed.has(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/\bwindow\s*(?:\?\.|\.)\s*(?:alert|confirm|prompt)\s*\(/.test(code)
        || /\bwindow\s*\[\s*["'](?:alert|confirm|prompt)["']\s*\]\s*\(/.test(code)
        || /(^|[^A-Za-z0-9_$])alert\s*\(/.test(code)) {
        violations.push(`${path.relative(path.resolve(__dirname, ".."), fullPath)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
};

walk(root);

if (violations.length) {
  console.error("Native browser dialogs are forbidden. Use src/utils/sweetAlert.js instead:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Dialog policy OK: no native alert/confirm/prompt calls found.");
