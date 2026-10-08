/* CYCLE_ID=20261007-mobile-nav-runtime-validation
 * W3 public mobile drawer brand contract. Static CSS-only tests;
 * not a substitute for React runtime or device QA.
 */
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "../pages/LandingPageV2.css"), "utf8");
const theme = fs.readFileSync(path.join(__dirname, "logo-theme.css"), "utf8");
const start = css.indexOf("/* Canonical public mobile navigation.");
const end = css.indexOf("@media(min-width:992px)", start);
const mobile = css.slice(start, end);
const rule = (selector) => {
  const index = mobile.indexOf(selector + "{");
  if (index < 0) return "";
  const open = mobile.indexOf("{", index);
  return mobile.slice(open + 1, mobile.indexOf("}", open));
};
const hex = (name) => {
  const match = theme.match(new RegExp(name + ":\\s*(#[0-9a-f]{6})", "i"));
  return match && match[1];
};
const luminance = (color) => {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe("public mobile drawer official Cutinapp brand CSS", () => {
  test("uses the canonical mobile-only drawer section", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(end)).toMatch(/\.cut-landing-mobile-drawer\{display:none!important\}/);
  });
  test("official palette tokens exist in logo-theme.css", () => {
    expect(hex("--cut-logo-red")).toBe("#D80000");
    expect(hex("--cut-logo-red-dark")).toBe("#980000");
    expect(hex("--cut-logo-red-hot")).toBe("#FF2020");
  });
  test("public drawer icons use official logo red rather than legacy purple", () => {
    const icons = rule(".cut-landing-mobile-drawer__content>a>i");
    expect(icons).toMatch(/color:var\(--cut-logo-red-hot,#FF2020\)/i);
    expect(icons).not.toMatch(/#c56aff|#7658ff|#318fff/i);
  });
  test("drawer CTA uses official dark-to-red gradient with readable white text", () => {
    const cta = rule(".cut-landing-mobile-drawer__cta");
    expect(cta).toMatch(/var\(--cut-logo-red-dark,#980000\)/i);
    expect(cta).toMatch(/var\(--cut-logo-red,#D80000\)/i);
    expect(cta).toMatch(/color:#fff!important/i);
    expect(cta).not.toMatch(/#db5eff|#7658ff|#318fff/i);
    expect(contrast(hex("--cut-logo-red-dark"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("--cut-logo-red"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  test("public mobile menu toggle has a visible neutral keyboard focus", () => {
    expect(rule(".cut-landing__menuToggle:focus-visible")).toMatch(/outline:2px solid #fff/i);
  });
});
