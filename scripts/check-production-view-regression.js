const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const files = {
  publicPage: read("src/pages/production/ProductionPublicPage.js"),
  ownerPage: read("src/pages/production/ProductionViewPage.js"),
  styles: read("src/pages/production/production-view-evolution.css"),
  nextEvent: read("src/components/production/ProductionNextEventHero.js"),
};

const checks = [
  ["public view imports evolution CSS", files.publicPage.includes("production-view-evolution.css")],
  ["owner view imports evolution CSS", files.ownerPage.includes("production-view-evolution.css")],
  ["public view renders next event hero", files.publicPage.includes("<ProductionNextEventHero")],
  ["owner view renders next event hero", files.ownerPage.includes("<ProductionNextEventHero")],
  ["public view uses Processing Indicator", files.publicPage.includes("ProcessingIndicatorComponent")],
  ["production layout clips horizontal overflow", files.styles.includes("overflow-x:clip")],
  ["desktop max width is defined", files.styles.includes("--cut-production-content-max:1280px")],
  ["mobile breakpoint exists", files.styles.includes("@media(max-width:767.98px)")],
  ["small mobile breakpoint exists", files.styles.includes("@media(max-width:359.98px)")],
  ["reduced motion fallback exists", files.styles.includes("@media(prefers-reduced-motion:reduce)")],
  ["next event hero exposes event CTA", files.nextEvent.includes("Ver evento e ingressos")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("Production view regression guard failed:");
  failed.forEach(([name]) => console.error(" - " + name));
  process.exit(1);
}

console.log("Production view regression guard: " + checks.length + " checks passed.");
