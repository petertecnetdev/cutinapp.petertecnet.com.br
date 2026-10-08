const fs = require("fs");
const path = require("path");

// CSS-only guard for the React Portal drawer. These checks do not validate
// React behavior, actual stacking contexts, or production runtime.
const css = fs.readFileSync(path.join(__dirname, "mobile-hamburger-recovery.css"), "utf8");
const mobileStart = css.indexOf("@media (max-width: 991.98px)");
const desktopStart = css.indexOf("@media (min-width: 992px)");
const mobileCss = css.slice(mobileStart, desktopStart);
const desktopCss = css.slice(desktopStart);

const mobileRule = (selector) => {
  const start = mobileCss.indexOf(`${selector} {`);
  if (start < 0) return "";
  const opening = mobileCss.indexOf("{", start);
  return mobileCss.slice(opening + 1, mobileCss.indexOf("}", opening));
};

describe("React Portal mobile drawer visual and interaction CSS contract", () => {
  test("mobile and desktop breakpoint contracts exist", () => {
    expect(mobileStart).toBeGreaterThanOrEqual(0);
    expect(desktopStart).toBeGreaterThan(mobileStart);
  });

  test("open mobile portal fills the viewport above page content", () => {
    const rule = mobileRule(".cut-mobile-drawer");
    expect(rule).toMatch(/position:\s*fixed\s*!important/);
    expect(rule).toMatch(/inset:\s*0\s*!important/);
    expect(rule).toMatch(/height:\s*100dvh\s*!important/);
    expect(rule).toMatch(/z-index:\s*2147483647\s*!important/);
    expect(rule).toMatch(/background:\s*#[0-9a-f]{6}\s*!important/i);
  });

  test("menu content scrolls independently without propagating overscroll", () => {
    const rule = mobileRule(".cut-mobile-drawer__content");
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/overscroll-behavior:\s*contain/);
    expect(rule).toMatch(/-webkit-overflow-scrolling:\s*touch/);
  });

  test("close control has a minimum 44px touch target", () => {
    const rule = mobileRule(".cut-mobile-drawer__close");
    expect(rule).toMatch(/width:\s*46px/);
    expect(rule).toMatch(/height:\s*46px/);
    expect(rule).toMatch(/pointer-events:\s*auto/);
  });

  test("safe areas are reserved for top header and bottom navigation content", () => {
    expect(mobileRule(".cut-mobile-drawer__header")).toMatch(/safe-area-inset-top/);
    expect(mobileRule(".cut-mobile-drawer__content")).toMatch(/safe-area-inset-bottom/);
  });

  test("bottom navigation and fixed purchase CTA cannot intercept drawer taps", () => {
    expect(mobileCss).toMatch(/body\.cut-mobile-menu-open \.cut-mobile-bottom-nav/);
    expect(mobileCss).toMatch(/body\.cut-mobile-menu-open \.cut-event-buy-cta-fixed/);
    expect(mobileCss).toMatch(/visibility:\s*hidden\s*!important;\s*pointer-events:\s*none\s*!important/);
  });

  test("Bootstrap collapse cannot compete while the portal is open", () => {
    expect(mobileCss).toMatch(/body\.cut-mobile-menu-open \.cut-navbar \.navbar-collapse\s*\{\s*display:\s*none\s*!important/);
  });

  test("desktop never displays the mobile portal", () => {
    expect(desktopCss).toMatch(/\.cut-mobile-drawer\s*\{\s*display:\s*none\s*!important/);
  });
});
