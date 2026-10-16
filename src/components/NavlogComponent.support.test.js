import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "./NavlogComponent";

jest.mock("../context/AuthContext", () => ({ AuthContext: require("react").createContext({ user: null }) }));
jest.mock("../services/CutinappService", () => ({ myProductions: jest.fn(() => Promise.resolve([])), notifications: jest.fn(() => Promise.resolve({ notifications: { data: [] } })) }));
jest.mock("../services/ArtistService", () => ({ invitations: jest.fn(() => Promise.resolve({ pending_count: 0 })) }));
jest.mock("../services/RealtimeNotificationService", () => ({ subscribeToUserNotifications: jest.fn(() => () => {}) }));
jest.mock("./ApplicationAdminGate", () => ({ loadApplicationAdminContext: jest.fn(() => Promise.resolve({ authorized: false })) }));
jest.mock("./NotificationPermissionControl", () => () => null);
jest.mock("./location/CityNavSelect", () => () => null);
jest.mock("../utils/peterWhatsappFallback", () => ({
  getPeterWhatsapp: jest.fn(() => Promise.resolve("https://wa.me/5562000000000")),
  buildCutinappWhatsappHref: jest.fn((destination) => destination ? `${destination}?text=Cutinapp` : ""),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;

beforeEach(() => {
  require("../utils/peterWhatsappFallback").getPeterWhatsapp.mockImplementation(() => Promise.resolve("https://wa.me/5562000000000"));
  require("../utils/peterWhatsappFallback").buildCutinappWhatsappHref.mockImplementation((destination) => destination ? `${destination}?text=Cutinapp` : "");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const renderNavigation = async (user = null) => {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={["/event"]}>
      <AuthContext.Provider value={{ user, logout: jest.fn() }}><NavlogComponent /></AuthContext.Provider>
    </MemoryRouter>);
  });
};

const openHelp = async () => {
  const control = container.querySelector("#cut-help-menu");
  expect(control).not.toBeNull();
  await act(async () => control.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

describe("acesso ao suporte no menu principal", () => {
  test("visitante abre Ajuda e encontra chamado e WhatsApp", async () => {
    await renderNavigation();
    await openHelp();
    expect(container.textContent).toContain("Central de ajuda e chamados");
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
    expect(container.querySelector('a[href^="https://wa.me/"]')).not.toBeNull();
  });

  test("usuário comum abre Ajuda sem permissão administrativa", async () => {
    await renderNavigation({ id: 8, name: "Teste", email: "teste@example.test" });
    await openHelp();
    expect(container.textContent).toContain("Central de ajuda e chamados");
    expect(container.querySelector('a[href="/help"]')).not.toBeNull();
  });

  test("menu mobile disponibiliza Central de ajuda sem login", async () => {
    await renderNavigation();
    await act(async () => container.querySelector('[aria-label="Abrir menu"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.getElementById("cut-mobile-drawer").textContent).toContain("Ajuda e suporte");
    expect(document.getElementById("cut-mobile-drawer").textContent).toContain("Falar no WhatsApp");
  });
});
