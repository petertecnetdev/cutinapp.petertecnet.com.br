#!/usr/bin/env node
/* W4 independent architecture gate — CYCLE_ID=20261007-mobile-nav-runtime-validation
 * Run from the Cutinapp frontend repository root:
 *   node scripts/qa/navlog-architecture-gate.cjs
 * Non-zero exit means P0 structural integration is NOT ready.
 * This is source-level QA, not Jest or browser/runtime validation.
 */
const fs = require("node:fs");
const path = require("node:path");
const sourcePath = path.join(process.cwd(), "src/components/NavlogComponent.js");
if (!fs.existsSync(sourcePath)) {
  console.error(`BLOCKED: cannot read ${sourcePath}`);
  process.exit(2);
}
const source = fs.readFileSync(sourcePath, "utf8");
const rules = [
  ["Portal exists with accessible dialog", /createPortal\s*\(/.test(source) && /id=["']cut-mobile-drawer["']/.test(source) && /aria-modal=["']true["']/.test(source)],
  ["Toggle targets the portal drawer", /aria-controls=["']cut-mobile-drawer["']/.test(source)],
  ["Shared lifecycle hook is imported and used", /from\s+["']\.\.\/hooks\/useMobileDrawer["']/.test(source) && /useMobileDrawer\s*\(/.test(source)],
  ["Bootstrap Navbar does not own portal open state", !/expanded=\{open\}/.test(source) && !/onToggle=\{setOpen\}/.test(source)],
  ["No duplicate manual body overflow lock", !/const\s+previousOverflow\s*=\s*document\.body\.style\.overflow/.test(source)],
  ["No competing global Escape listener", !/window\.addEventListener\(["']keydown["'],\s*onKeyDown\)/.test(source)],
];
let failures = 0;
for (const [name, ok] of rules) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures++;
}
console.log(`${rules.length - failures}/${rules.length} architecture checks passed`);
if (failures) process.exit(1);
