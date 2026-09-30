const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const fail = (message) => {
  console.error(`[pwa-installability] ${message}`);
  process.exitCode = 1;
};
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

let manifest;
try {
  manifest = JSON.parse(read('public/manifest.json'));
} catch (error) {
  fail(`manifest.json must be valid JSON: ${error.message}`);
  process.exit(1);
}

for (const field of ['name', 'short_name', 'start_url', 'scope', 'display']) {
  if (!manifest[field]) fail(`manifest is missing required field: ${field}`);
}
if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
  fail(`manifest display must be installable; received ${JSON.stringify(manifest.display)}`);
}
if (!String(manifest.start_url || '').startsWith('/')) fail('start_url must remain same-origin');
if (!String(manifest.scope || '').startsWith('/')) fail('scope must remain same-origin');

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const hasSize = (size) => icons.some((icon) => String(icon.sizes || '').split(/\s+/).includes(size));
if (!hasSize('192x192')) fail('manifest must declare a 192x192 icon');
if (!hasSize('512x512')) fail('manifest must declare a 512x512 icon');
if (!icons.some((icon) => /(^|\s)maskable(\s|$)/.test(String(icon.purpose || '')))) {
  fail('manifest must declare at least one maskable icon');
}

for (const icon of icons) {
  if (!icon.src || /^https?:\/\//i.test(icon.src)) continue;
  const relative = icon.src.replace(/^\//, '');
  if (!fs.existsSync(path.join(root, 'public', relative))) fail(`manifest icon does not exist: ${icon.src}`);
}

const html = read('public/index.html');
if (!/<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.json["']/i.test(html)) {
  fail('index.html must link /manifest.json');
}
if (!/serviceWorker\.register\(["']\/sw\.js(?:\?[^"']*)?["']/i.test(html)) {
  fail('index.html must register the root /sw.js service worker');
}
if (!fs.existsSync(path.join(root, 'public', 'sw.js'))) fail('public/sw.js is missing');
if (!/install-app\.js/i.test(html) || !/data-manifest=["']\/manifest\.json["']/i.test(html)) {
  fail('shared install-app integration must target /manifest.json');
}

if (!process.exitCode) {
  console.log(`[pwa-installability] OK: ${icons.length} manifest icons, display=${manifest.display}, start_url=${manifest.start_url}, scope=${manifest.scope}`);
}
