import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SITE_ORIGIN = "https://cutinapp.petertecnet.com.br";
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
const CORE_PUBLIC_PATHS = ["/", "/for-producers", "/eventos", "/productions", "/artists", "/blog"];
const PRIVATE_PREFIXES = [
  "/dashboard", "/messages", "/notifications", "/moderation/", "/profile", "/user/", "/admin",
  "/agent", "/producer/", "/production/create", "/production/mine", "/production/edit/", "/artist/manage",
  "/event/create", "/event/manage", "/event/edit/", "/checkout/", "/purchases", "/ticket/", "/passes",
  "/checkin", "/login", "/register", "/password", "/email-verify", "/logout",
];

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const fail = (message) => {
  console.error(`[seo-indexability] ${message}`);
  process.exitCode = 1;
};

const robots = read("public/robots.txt");
const sitemap = read("public/sitemap.xml");

const sitemapDirectives = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);
if (!sitemapDirectives.includes(SITEMAP_URL)) {
  fail(`robots.txt must advertise ${SITEMAP_URL}`);
}

const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)\s*$/gim)].map((match) => match[1]);
for (const prefix of PRIVATE_PREFIXES) {
  if (!disallows.includes(prefix)) fail(`robots.txt must disallow private route prefix ${prefix}`);
}

const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
if (locs.length === 0) fail("sitemap.xml contains no <loc> entries");
if (new Set(locs).size !== locs.length) fail("sitemap.xml contains duplicate URLs");

const paths = new Set();
for (const loc of locs) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    fail(`invalid sitemap URL: ${loc}`);
    continue;
  }
  if (url.origin !== SITE_ORIGIN) fail(`sitemap URL must use canonical origin ${SITE_ORIGIN}: ${loc}`);
  if (url.search || url.hash) fail(`sitemap URL must not contain query/hash: ${loc}`);
  paths.add(url.pathname.replace(/\/$/, "") || "/");
  if (PRIVATE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))) {
    fail(`private route leaked into sitemap: ${loc}`);
  }
}

for (const route of CORE_PUBLIC_PATHS) {
  const normalized = route.replace(/\/$/, "") || "/";
  if (!paths.has(normalized)) fail(`core commercial route missing from sitemap: ${route}`);
  if (disallows.some((prefix) => normalized === prefix || normalized.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))) {
    fail(`core commercial route is blocked by robots.txt: ${route}`);
  }
}

if (!process.exitCode) {
  console.log(`[seo-indexability] OK: ${locs.length} sitemap URLs, ${CORE_PUBLIC_PATHS.length} core routes protected`);
}
