const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const limits = {
  staticImage: 700 * 1024,
  singleJs: 650 * 1024,
  singleCss: 220 * 1024,
  totalJs: 2.6 * 1024 * 1024,
};
const failures = [];
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
}) : [];
const size = (file) => fs.statSync(file).size;

for (const file of walk(path.join(root, "public"))) {
  if (!/\.(png|jpe?g|gif|webp|ico)$/i.test(file)) continue;
  const bytes = size(file);
  if (bytes > limits.staticImage) failures.push(`${path.relative(root,file)} ${(bytes/1024).toFixed(0)} KiB > 700 KiB`);
}
const buildStatic = path.join(root, "build", "static");
const js = walk(path.join(buildStatic, "js")).filter((f) => f.endsWith(".js") && !f.endsWith(".map"));
const css = walk(path.join(buildStatic, "css")).filter((f) => f.endsWith(".css") && !f.endsWith(".map"));
for (const file of js) if (size(file) > limits.singleJs) failures.push(`${path.relative(root,file)} ${(size(file)/1024).toFixed(0)} KiB > 650 KiB`);
for (const file of css) if (size(file) > limits.singleCss) failures.push(`${path.relative(root,file)} ${(size(file)/1024).toFixed(0)} KiB > 220 KiB`);
const totalJs = js.reduce((sum, file) => sum + size(file), 0);
if (totalJs > limits.totalJs) failures.push(`total JS ${(totalJs/1024/1024).toFixed(2)} MiB > 2.60 MiB`);
if (failures.length) {
  console.error("Performance budget exceeded:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Performance budget OK: ${js.length} JS chunks, ${(totalJs/1024/1024).toFixed(2)} MiB total JS.`);
