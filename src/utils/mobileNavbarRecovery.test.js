import { installMobileNavbarRecovery } from "./mobileNavbarRecovery";

const flushRecovery = () => {
  jest.advanceTimersByTime(120);
};

const mountNavbar = () => {
  document.body.innerHTML = `
    <nav class="cut-navbar">
      <button class="navbar-toggler collapsed" aria-controls="cut-navbar-test" aria-expanded="false">Menu</button>
      <div id="cut-navbar-test" class="navbar-collapse">
        <a href="/event">Eventos</a>
        <button class="dropdown-item" type="button">Produções</button>
      </div>
    </nav>
  `;
  return {
    toggle: document.querySelector(".navbar-toggler"),
    collapse: document.querySelector(".navbar-collapse"),
    destination: document.querySelector('a[href="/event"]'),
  };
};

describe("mobileNavbarRecovery", () => {
  let cleanup;

  beforeEach(() => {
    jest.useFakeTimers();
    delete window.__cutinappMobileNavbarRecoveryInstalled;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === "(max-width: 991.98px)",
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = "";
    delete window.__cutinappMobileNavbarRecoveryInstalled;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("opens and closes the controlled drawer while keeping ARIA state synchronized", () => {
    const { toggle, collapse } = mountNavbar();
    cleanup = installMobileNavbarRecovery();

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(true);
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("1");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.classList.contains("collapsed")).toBe(false);

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(false);
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("0");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.classList.contains("collapsed")).toBe(true);
  });

  test("does not undo a framework transition that already handled the same click", () => {
    const { toggle, collapse } = mountNavbar();
    cleanup = installMobileNavbarRecovery();

    const frameworkToggle = () => {
      const nextOpen = !collapse.classList.contains("show");
      collapse.classList.toggle("show", nextOpen);
      toggle.classList.toggle("collapsed", !nextOpen);
      toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    };
    toggle.addEventListener("click", frameworkToggle);

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.removeEventListener("click", frameworkToggle);
  });

  test("closes the drawer after a mobile destination is activated", () => {
    const { toggle, collapse, destination } = mountNavbar();
    cleanup = installMobileNavbarRecovery();

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(true);

    destination.click();
    expect(collapse.classList.contains("show")).toBe(false);
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("0");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("does not force drawer state outside the mobile breakpoint", () => {
    const { toggle, collapse } = mountNavbar();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    cleanup = installMobileNavbarRecovery();

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(false);
    expect(collapse.dataset.cutinappRecoveryOpen).toBeUndefined();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("cleanup removes recovery listeners so remounts cannot double-toggle", () => {
    const { toggle, collapse } = mountNavbar();
    cleanup = installMobileNavbarRecovery();
    cleanup();
    cleanup = undefined;

    toggle.click();
    flushRecovery();
    expect(collapse.classList.contains("show")).toBe(false);
    expect(collapse.dataset.cutinappRecoveryOpen).toBeUndefined();
  });
});
