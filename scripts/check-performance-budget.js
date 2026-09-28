const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const limits = {
  staticImage: 700 * 1024,
  singleJsGzip: 350 * 1024,
  singleCssGzip: 120 * 1024,
  totalJsGzip: 1.25 * 1024 * 1024,
};
const failures = [];
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
}) : [];
const size = (file) => fs.statSync(file).size;
const gzipSize = (file) => zlib.gzipSync(fs.readFileSync(file), { level: zlib.constants.Z_BEST_COMPRESSION }).length;
const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;

for (const file of walk(path.join(root, "public"))) {
  if (!/\.(png|jpe?g|gif|webp|ico)$/i.test(file)) continue;
  const bytes = size(file);
  if (bytes > limits.staticImage) failures.push(`${path.relative(root, file)} ${kib(bytes)} raw > 700 KiB`);
}

const buildDir = path.resolve(process.env.CUTINAPP_PERF_BUILD_DIR || path.join(root, "build"));
const buildStatic = path.join(buildDir, "static");
const buildIndex = path.join(buildDir, "index.html");
const manifestPath = path.join(buildDir, "asset-manifest.json");

const allJs = walk(path.join(buildStatic, "js")).filter((file) => file.endsWith(".js") && !file.endsWith(".map"));
const allCss = walk(path.join(buildStatic, "css")).filter((file) => file.endsWith(".css") && !file.endsWith(".map"));
let js = allJs;
let css = allCss;

// Production directories may retain old hashed chunks during zero-downtime deploys.
// Measure only assets referenced by the current CRA manifest so stale files cannot
// create false budget failures, while still failing closed when no real build exists.
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const active = new Set(Object.values(manifest.files || {}).map((value) => path.resolve(buildDir, String(value).replace(/^\/+/, ""))));
    js = allJs.filter((file) => active.has(path.resolve(file)));
    css = allCss.filter((file) => active.has(path.resolve(file)));
  } catch (error) {
    failures.push(`asset-manifest.json unreadable: ${error.message}`);
    js = [];
    css = [];
  }
}

if (!fs.existsSync(buildIndex)) failures.push("build/index.html missing; run the production build before perf:budget");
if (!fs.existsSync(manifestPath)) failures.push("build/asset-manifest.json missing; performance budget cannot identify active assets");
if (js.length === 0) failures.push("current build manifest references no JavaScript chunks; performance budget cannot be measured");
if (css.length === 0) failures.push("current build manifest references no CSS chunks; performance budget cannot be measured");
const jsGzipSizes = js.map((file) => ({ file, bytes: gzipSize(file) }));
const cssGzipSizes = css.map((file) => ({ file, bytes: gzipSize(file) }));

for (const { file, bytes } of jsGzipSizes) {
  if (bytes > limits.singleJsGzip) failures.push(`${path.relative(root, file)} ${kib(bytes)} gzip > 350 KiB`);
}
for (const { file, bytes } of cssGzipSizes) {
  if (bytes > limits.singleCssGzip) failures.push(`${path.relative(root, file)} ${kib(bytes)} gzip > 120 KiB`);
}

const totalJsGzip = jsGzipSizes.reduce((sum, entry) => sum + entry.bytes, 0);
if (totalJsGzip > limits.totalJsGzip) {
  failures.push(`total JS ${(totalJsGzip / 1024 / 1024).toFixed(2)} MiB gzip > 1.25 MiB`);
}

if (failures.length) {
  console.error("Performance budget exceeded:\n- " + failures.join("\n- "));
  process.exit(1);
}

const orphanJs = Math.max(0, allJs.length - js.length);
const orphanCss = Math.max(0, allCss.length - css.length);
console.log(`Performance budget OK: ${js.length} active JS chunks, ${(totalJsGzip / 1024 / 1024).toFixed(2)} MiB total JS gzip.`);
if (orphanJs || orphanCss) console.log(`Ignored stale build artifacts: ${orphanJs} JS, ${orphanCss} CSS not referenced by current manifest.`);
