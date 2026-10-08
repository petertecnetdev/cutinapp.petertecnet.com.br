const fs = require("fs");
const path = require("path");

// CSS-only contract: React Portal is the sole interactive mobile drawer.
// These tests intentionally do not claim application/runtime validation.
const css = fs.readFileSync(path.join(__dirname, "navbar-interaction-fix.css"), "utf8");

describe("Cutinapp mobile navbar legacy collapse guard", () => {
  const mobileMedia = css.match(/@media\s*\(max-width:\s*991\.98px\)\s*\{([\s\S]*)\}\s*$/);

  test("legacy collapse rules are scoped to mobile", () => {
    expect(mobileMedia).not.toBeNull();
    expect(css.slice(0, mobileMedia.index)).not.toMatch(/\.navbar-collapse\s*\{/);
  });

  test.each([
    ".cut-navbar .navbar-collapse",
    ".cut-navbar .navbar-collapse.show",
    ".cut-navbar .navbar-collapse.collapsing",
  ])("hides legacy collapse selector %s", (selector) => {
    const rule = mobileMedia[1].match(/([^{}]+)\{([^{}]*display:\s*none\s*!important;[^{}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toContain(selector);
    expect(rule[2]).toMatch(/pointer-events:\s*none\s*!important/);
    expect(rule[2]).toMatch(/visibility:\s*hidden\s*!important/);
    expect(rule[2]).not.toMatch(/position:\s*fixed/);
  });

  test("never promotes legacy collapse into a fullscreen overlay", () => {
    expect(css).not.toMatch(/inset:\s*0\s*!important/);
    expect(css).not.toMatch(/height:\s*100dvh\s*!important/);
    expect(css).not.toMatch(/z-index:\s*2147483646/);
  });

  test("mobile toggler remains interactive", () => {
    const rule = mobileMedia[1].match(/\.cut-navbar \.navbar-toggler\s*\{([^{}]+)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/pointer-events:\s*auto\s*!important/);
    expect(rule[1]).toMatch(/touch-action:\s*manipulation\s*!important/);
  });
});

describe("mobile navigation stylesheet load order", () => {
  const appCss = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const entry = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");

  test("mobile collapse safety layer follows legacy fixed-navbar styles", () => {
    const legacy = appCss.indexOf('@import "./navbar-fixed-top.css"');
    const safety = appCss.indexOf('@import "./navbar-interaction-fix.css"');
    expect(legacy).toBeGreaterThanOrEqual(0);
    expect(safety).toBeGreaterThan(legacy);
  });

  test("portal drawer stylesheet loads after global styles", () => {
    const global = entry.indexOf('import "./styles/app.css"');
    const portal = entry.indexOf('import "./styles/mobile-hamburger-recovery.css"');
    expect(global).toBeGreaterThanOrEqual(0);
    expect(portal).toBeGreaterThan(global);
  });
});
