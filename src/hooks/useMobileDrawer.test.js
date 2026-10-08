import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import useMobileDrawer from "./useMobileDrawer";

function Fixture({ open, onClose, drawerId = "test-drawer", bodyClass = "test-menu-open" }) {
  useMobileDrawer({ open, onClose, drawerId, bodyClass });
  return open ? <div id={drawerId} role="dialog"><button type="button">Close</button></div> : null;
}

describe("shared mobile drawer lifecycle", () => {
  let container;
  let root;
  const previousActFlag = global.IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    document.body.style.overflow = "";
    document.body.style.overscrollBehavior = "";
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
    document.body.style.overscrollBehavior = "";
    document.body.className = "";
    global.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
  });

  test("locks and restores pre-existing body styles", () => {
    document.body.style.overflow = "auto";
    document.body.style.overscrollBehavior = "contain";
    act(() => root.render(<Fixture open onClose={() => {}} />));
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.classList.contains("test-menu-open")).toBe(true);
    act(() => root.render(<Fixture open={false} onClose={() => {}} />));
    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.overscrollBehavior).toBe("contain");
    expect(document.body.classList.contains("test-menu-open")).toBe(false);
  });

  test("Escape closes an open portal", () => {
    const close = jest.fn();
    act(() => root.render(<Fixture open onClose={close} />));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("switching to desktop requests closure", () => {
    const close = jest.fn();
    const oldWidth = window.innerWidth;
    act(() => root.render(<Fixture open onClose={close} />));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(close).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: oldWidth });
  });
});
