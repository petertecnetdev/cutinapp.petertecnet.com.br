import { syncNavbarScrollState } from "./instagramMobileShell";

describe("instagramMobileShell navbar visibility", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-cut-instagram-shell", "active");
    document.body.className = "";
    document.body.innerHTML = `
      <nav class="cut-capability-nav cut-mobile-nav--hidden">
        <button class="navbar-toggler collapsed" aria-expanded="false" />
        <div class="navbar-collapse" />
      </nav>
    `;
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 240 });
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-cut-instagram-shell");
    document.body.className = "";
    document.body.innerHTML = "";
  });

  test("removes auto-hide state while React marks the drawer open", () => {
    document.body.classList.add("cut-mobile-menu-open");
    syncNavbarScrollState();

    expect(document.querySelector(".cut-capability-nav").classList.contains("cut-mobile-nav--hidden")).toBe(false);
  });

  test("removes auto-hide state when Bootstrap collapse is visibly open", () => {
    document.querySelector(".navbar-collapse").classList.add("show");
    syncNavbarScrollState();

    expect(document.querySelector(".cut-capability-nav").classList.contains("cut-mobile-nav--hidden")).toBe(false);
  });

  test("removes auto-hide state when the toggle ARIA state is open", () => {
    document.querySelector(".navbar-toggler").setAttribute("aria-expanded", "true");
    syncNavbarScrollState();

    expect(document.querySelector(".cut-capability-nav").classList.contains("cut-mobile-nav--hidden")).toBe(false);
  });
});
