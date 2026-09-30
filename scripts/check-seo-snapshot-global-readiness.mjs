import fs from "node:fs/promises";

const target = new URL("./generate-seo-snapshots.mjs", import.meta.url);
const source = await fs.readFile(target, "utf8");

const violations = [];
const assertAbsent = (pattern, message) => {
  if (pattern.test(source)) violations.push(message);
};

assertAbsent(
  /const\s+TIME_ZONE\s*=\s*["']America\/Sao_Paulo["']/, 
  "crawler snapshots must not hardcode America/Sao_Paulo for a global product",
);
assertAbsent(
  /Intl\.DateTimeFormat\(["']pt-BR["']/, 
  "crawler snapshots must not hardcode pt-BR formatting for every event",
);
assertAbsent(
  /addressCountry:\s*event\.country\s*\|\|\s*["']BR["']/, 
  "structured data must not invent BR when event.country is absent",
);
assertAbsent(
  /url:\s*production\?\.slug\s*\?[^\n]+:\s*SITE_URL/, 
  "external organizers must not inherit the Cutinapp homepage URL",
);

if (violations.length) {
  console.error("SEO snapshot global-readiness guard failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("\nFix generate-seo-snapshots.mjs using event/config-derived locale, timezone, country and organizer identity.");
  process.exit(1);
}

console.log("SEO snapshot global-readiness guard passed.");
