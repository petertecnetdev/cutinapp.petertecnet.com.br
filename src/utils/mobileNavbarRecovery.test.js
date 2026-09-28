import { installMobileNavbarRecovery } from "./mobileNavbarRecovery";

const flushRecovery = () => {
  jest.advanceTimersByTime(70);
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
    expect(collapse).toHaveClass("show");
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("1");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).not.toHaveClass("collapsed");

    toggle.click();
    flushRecovery();
    expect(collapse).not.toHaveClass("show");
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("0");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("collapsed");
  });

  test("closes the drawer after a mobile destination is activated", () => {
    const { toggle, collapse, destination } = mountNavbar();
    cleanup = installMobileNavbarRecovery();

    toggle.click();
    flushRecovery();
    expect(collapse).toHaveClass("show");

    destination.click();
    expect(collapse).not.toHaveClass("show");
    expect(collapse.dataset.cutinappRecoveryOpen).toBe("0");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("does not force drawer state outside the mobile breakpoint", () => {
    const { toggle, collapse } = mountNavbar();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    cleanup = installMobileNavbarRecovery();

    toggle.click();
    flushRecovery();
    expect(collapse).not.toHaveClass("show");
    expect(collapse.dataset.cutinappRecoveryOpen).toBeUndefined();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("cleanup removes recovery listeners so remounts cannot double-toggle", () => {
    const { toggle, collapse } = mountNavbar();
    cleanup = installMobileNavbarRecovery();
    cleanup();
    cleanup = undefined;

    toggle.click();
    flushRecovery();
    expect(collapse).not.toHaveClass("show");
    expect(collapse.dataset.cutinappRecoveryOpen).toBeUndefined();
  });
});
