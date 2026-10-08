import { installNavigationRecovery } from "./navigationRecovery";

// Cycle 20261007-mobile-nav-runtime-validation.
// Regression coverage for the two React portals and the stale Bootstrap
// collapse. These are jsdom unit tests, NOT browser/runtime acceptance.
describe("navigation recovery with portaled mobile drawers", () => {
  let dispose;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.body.className = "";
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const installAndFlush = () => {
    dispose = installNavigationRecovery();
    window.dispatchEvent(new Event("pageshow"));
    jest.runOnlyPendingTimers();
  };

  test.each(["cut-mobile-drawer", "cut-landing-mobile-drawer"])(
    "preserves body lock while %s portal is mounted",
    (drawerClass) => {
      const drawer = document.createElement("div");
      drawer.className = drawerClass;
      drawer.setAttribute("role", "dialog");
      document.body.appendChild(drawer);
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
      installAndFlush();
      expect(document.body.style.overflow).toBe("hidden");
      expect(document.body.style.overscrollBehavior).toBe("none");
    }
  );

  test("clears an orphaned lock after the drawer has unmounted", () => {
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    installAndFlush();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.overscrollBehavior).toBe("");
  });

  test("does not collapse Bootstrap while a portal drawer is active", () => {
    document.body.innerHTML = `<nav class="cut-navbar">
      <button class="navbar-toggler" aria-expanded="true"></button>
      <div class="navbar-collapse show"></div>
    </nav><div class="cut-mobile-drawer" role="dialog"></div>`;
    installAndFlush();
    expect(document.querySelector(".navbar-collapse").classList.contains("show")).toBe(true);
    expect(document.querySelector(".navbar-toggler").getAttribute("aria-expanded")).toBe("true");
  });

  test("removes stale Bootstrap backdrops when no blocking UI remains", () => {
    document.body.innerHTML = '<div class="modal-backdrop"></div>';
    document.body.style.overflow = "hidden";
    installAndFlush();
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  test("preserves body lock when a real modal is active", () => {
    document.body.innerHTML = '<div class="modal show"></div>';
    document.body.style.overflow = "hidden";
    installAndFlush();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
