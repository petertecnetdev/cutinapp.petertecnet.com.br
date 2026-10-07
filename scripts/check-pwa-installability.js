const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const fail = (message) => {
  console.error(`[pwa-installability] ${message}`);
  process.exitCode = 1;
};
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const readPngMetadata = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  const idat = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) return null;
    if (type === 'IDAT') idat.push(buffer.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  let topLeftRgba = null;
  if (bitDepth === 8 && colorType === 6 && interlace === 0 && idat.length) {
    try {
      const raw = zlib.inflateSync(Buffer.concat(idat));
      // The first pixel has no left/upper neighbours, so every PNG filter
      // reconstructs its RGBA bytes directly from the first scanline bytes.
      if (raw.length >= 5) topLeftRgba = [raw[1], raw[2], raw[3], raw[4]];
    } catch (_) {
      topLeftRgba = null;
    }
  }

  return { width, height, bitDepth, colorType, interlace, topLeftRgba };
};

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
try {
  const origin = 'https://cutinapp.petertecnet.com.br';
  const startUrl = new URL(manifest.start_url, origin);
  const scopeUrl = new URL(manifest.scope, origin);
  if (startUrl.origin !== origin || scopeUrl.origin !== origin) fail('start_url and scope must resolve on the Cutinapp origin');
  if (!startUrl.pathname.startsWith(scopeUrl.pathname)) fail(`start_url ${startUrl.pathname} must remain inside scope ${scopeUrl.pathname}`);
} catch (error) {
  fail(`start_url/scope must be valid URLs: ${error.message}`);
}

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const hasSize = (size) => icons.some((icon) => String(icon.sizes || '').split(/\s+/).includes(size));
if (!hasSize('192x192')) fail('manifest must declare a 192x192 icon');
if (!hasSize('512x512')) fail('manifest must declare a 512x512 icon');
if (!icons.some((icon) => /(^|\s)maskable(\s|$)/.test(String(icon.purpose || '')))) {
  fail('manifest must declare at least one maskable icon');
}

const normalizedTheme = String(manifest.theme_color || '').toLowerCase();
const normalizedBackground = String(manifest.background_color || '').toLowerCase();
if (normalizedTheme !== '#000000') fail(`theme_color must use the Cutinapp launch background #000000; received ${JSON.stringify(manifest.theme_color)}`);
if (normalizedBackground !== '#000000') fail(`background_color must use the Cutinapp launch background #000000; received ${JSON.stringify(manifest.background_color)}`);

const manifestIconPath = (icon) => path.join(root, 'public', String(icon.src || '').replace(/^\//, ''));
const iconFor = (size, purpose) => icons.find((icon) =>
  String(icon.sizes || '').split(/\s+/).includes(size)
  && new RegExp(`(^|\\s)${purpose}(\\s|$)`).test(String(icon.purpose || ''))
);

for (const size of ['192x192', '512x512']) {
  const icon = iconFor(size, 'any');
  if (!icon || !icon.src || /^https?:\/\//i.test(icon.src)) continue;
  const metadata = readPngMetadata(manifestIconPath(icon));
  if (!metadata?.topLeftRgba) {
    fail(`purpose:any icon ${icon.src} must be an 8-bit non-interlaced RGBA PNG so splash transparency can be validated`);
    continue;
  }
  if (metadata.topLeftRgba[3] !== 0) {
    fail(`purpose:any icon ${icon.src} must have a transparent outer corner; received alpha=${metadata.topLeftRgba[3]}`);
  }
}

const maskableIcon = icons.find((icon) => /(^|\s)maskable(\s|$)/.test(String(icon.purpose || '')));
if (maskableIcon?.src && !/^https?:\/\//i.test(maskableIcon.src)) {
  const metadata = readPngMetadata(manifestIconPath(maskableIcon));
  if (!metadata?.topLeftRgba) {
    fail(`maskable icon ${maskableIcon.src} must be an 8-bit non-interlaced RGBA PNG so its matte can be validated`);
  } else if (metadata.topLeftRgba.join(',') !== '0,0,0,255') {
    fail(`maskable icon ${maskableIcon.src} must use an opaque #000000 outer matte; received rgba(${metadata.topLeftRgba.join(',')})`);
  }
}

for (const icon of icons) {
  if (!icon.src || /^https?:\/\//i.test(icon.src)) continue;
  const relative = icon.src.replace(/^\//, '');
  const iconPath = path.join(root, 'public', relative);
  if (!fs.existsSync(iconPath)) {
    fail(`manifest icon does not exist: ${icon.src}`);
    continue;
  }

  const declaredSizes = String(icon.sizes || '').split(/\s+/).filter(Boolean);
  if (icon.type === 'image/png' && declaredSizes.some((size) => /^\d+x\d+$/.test(size))) {
    const actual = readPngMetadata(iconPath);
    if (!actual) {
      fail(`manifest icon declares image/png but is not a valid PNG: ${icon.src}`);
      continue;
    }
    for (const size of declaredSizes.filter((value) => /^\d+x\d+$/.test(value))) {
      const [width, height] = size.split('x').map(Number);
      if (actual.width !== width || actual.height !== height) {
        fail(`manifest icon ${icon.src} declares ${size} but file is ${actual.width}x${actual.height}`);
      }
    }
  }
}

const html = read('public/index.html');
if (!/<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.json["']/i.test(html)) {
  fail('index.html must link /manifest.json');
}
if (!/serviceWorker\.register\(["']\/sw\.js(?:\?[^"']*)?["']/i.test(html)) {
  fail('index.html must register the root /sw.js service worker');
}
if (!fs.existsSync(path.join(root, 'public', 'sw.js'))) fail('public/sw.js is missing');

const installScript = html.match(/<script\b[^>]*\bsrc=["'](https:\/\/[^"']*\/install-app\.js(?:\?[^"']*)?)["'][^>]*>/i);
if (!installScript) {
  fail('shared install-app integration must load from an explicit HTTPS script URL');
} else {
  const tag = installScript[0];
  if (!/\bdata-manifest=["']\/manifest\.json(?:\?[^"']*)?["']/i.test(tag)) fail('install-app integration must target /manifest.json');
  if (!/\bdata-sw=["']\/sw\.js(?:\?[^"']*)?["']/i.test(tag)) fail('install-app integration must target the root /sw.js service worker');
  if (!/\bdata-app-slug=["']cutinapp["']/i.test(tag)) fail('install-app integration must identify the cutinapp app slug');
}

if (!process.exitCode) {
  console.log(`[pwa-installability] OK: ${icons.length} manifest icons, display=${manifest.display}, start_url=${manifest.start_url}, scope=${manifest.scope}`);
}
