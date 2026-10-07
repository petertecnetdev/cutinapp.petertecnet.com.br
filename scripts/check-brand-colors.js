const fs = require("fs");
const path = require("path");

const SOURCE_ROOT = path.resolve(__dirname, "../src");
const EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const IGNORED_PATHS = [
  /(?:^|\/)(?:__tests__|tests?)(?:\/|$)/,
  /\.(?:test|spec)\.[jt]sx?$/,
  /src\/components\/EventFlyerAssistant\.js$/,
];

const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
const rgbPattern = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([\d.]+))?\s*\)/gi;
const legacyTokenPattern = /--(?:purple|violet|blue|cyan|pink)\s*:|var\(--(?:purple|violet|blue|cyan|pink)\)/gi;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

function rgbToHsv(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) hue = 60 * (((bb - rr) / delta) + 2);
    else hue = 60 * (((rr - gg) / delta) + 4);
  }

  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
  };
}

function parseHex(raw) {
  let value = raw.slice(1);
  if (![3, 4, 6, 8].includes(value.length)) return null;
  if (value.length <= 4) value = value.split("").map((char) => char + char).join("");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function isForbiddenLegacyHue(r, g, b) {
  const { hue, saturation } = rgbToHsv(r, g, b);
  return saturation >= 0.16 && hue > 165 && hue < 345;
}

function isAllowedException(relativePath, line) {
  if (line.includes("brand-color-allow")) return true;

  // Provider-specific controls may retain the provider's official identity.
  if (
    relativePath === "src/components/auth/LoginFormComponent.css"
    && line.toLowerCase().includes("instagram")
  ) return true;

  return false;
}

const violations = [];

for (const file of walk(SOURCE_ROOT)) {
  const relativePath = path.relative(path.resolve(__dirname, ".."), file).replaceAll(path.sep, "/");
  if (IGNORED_PATHS.some((pattern) => pattern.test(relativePath))) continue;

  const lines = fs.readFileSync(file, "utf8").split("\n");

  lines.forEach((line, index) => {
    if (isAllowedException(relativePath, line)) return;

    legacyTokenPattern.lastIndex = 0;
    for (const match of line.matchAll(legacyTokenPattern)) {
      violations.push({ file: relativePath, line: index + 1, color: match[0] });
    }

    hexPattern.lastIndex = 0;
    for (const match of line.matchAll(hexPattern)) {
      if (match.index > 0 && line[match.index - 1] === "&") continue;
      const rgb = parseHex(match[0]);
      if (rgb && isForbiddenLegacyHue(...rgb)) {
        violations.push({ file: relativePath, line: index + 1, color: match[0] });
      }
    }

    rgbPattern.lastIndex = 0;
    for (const match of line.matchAll(rgbPattern)) {
      const rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
      if (isForbiddenLegacyHue(...rgb)) {
        violations.push({ file: relativePath, line: index + 1, color: match[0] });
      }
    }
  });
}

if (violations.length) {
  console.error("Cutinapp brand palette regression detected.");
  console.error("Blue/cyan/purple/magenta UI colors are outside the official Cutinapp identity.");
  console.error("Use tokens from src/styles/tokens.css. Semantic green/yellow states and documented provider branding remain allowed.\n");
  for (const item of violations.slice(0, 100)) {
    console.error(`- ${item.file}:${item.line} unauthorized color ${item.color}`);
  }
  if (violations.length > 100) console.error(`... and ${violations.length - 100} more.`);
  process.exit(1);
}

console.log("Brand palette guard OK: no legacy blue/cyan/purple/magenta UI colors detected.");
