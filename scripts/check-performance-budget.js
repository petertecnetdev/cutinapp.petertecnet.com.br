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

const buildStatic = path.join(root, "build", "static");
const js = walk(path.join(buildStatic, "js")).filter((file) => file.endsWith(".js") && !file.endsWith(".map"));
const css = walk(path.join(buildStatic, "css")).filter((file) => file.endsWith(".css") && !file.endsWith(".map"));
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

console.log(`Performance budget OK: ${js.length} JS chunks, ${(totalJsGzip / 1024 / 1024).toFixed(2)} MiB total JS gzip.`);
