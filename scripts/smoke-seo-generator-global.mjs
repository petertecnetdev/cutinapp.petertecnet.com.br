import fs from "node:fs/promises";
import process from "node:process";

const generatorPath = new URL("./generate-seo-snapshots.mjs", import.meta.url);
const source = await fs.readFile(generatorPath, "utf8");

const forbidden = [
  ["fixed Sao Paulo timezone", /const\s+TIME_ZONE\s*=\s*["']America\/Sao_Paulo["']/],
  ["fixed Brazilian locale", /Intl\.DateTimeFormat\(["']pt-BR["']/],
  ["fixed Brazil country fallback", /addressCountry:\s*event\.country\s*\|\|\s*["']BR["']/],
];

const missing = forbidden.filter(([, pattern]) => pattern.test(source));
if (missing.length) {
  console.error("SEO generator is not global-ready:");
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

const requiredHelpers = [
  "snapshotContext",
  "discoveryContext",
  "dateKeyForContext",
  "formatDateForContext",
  "eventCountry",
  "organizerIdentity",
];
const absent = requiredHelpers.filter((helper) => !source.includes(helper));
if (absent.length) {
  console.error(`SEO generator is missing global context helpers: ${absent.join(", ")}`);
  process.exit(1);
}

console.log("SEO generator global-readiness smoke passed.");
