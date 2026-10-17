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
global.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;

beforeEach(() => {
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

describe("acesso ao suporte no menu principal", () => {
  test("visitante encontra link direto Ajuda sem menu flutuante", async () => {
    await renderNavigation();
    const link = container.querySelector('a.cut-navbar__help-link[href="/help"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Ajuda");
    expect(document.querySelector(".cut-ecosystem-whatsapp")).toBeNull();
    expect(container.querySelector("#cut-help-menu")).toBeNull();
  });

  test("usuário autenticado encontra o mesmo link para /help", async () => {
    await renderNavigation({ id: 8, name: "Teste", email: "teste@example.test" });
    expect(container.querySelector('a.cut-navbar__help-link[href="/help"]')).not.toBeNull();
  });

  test("usuário logado vê links secundários apenas no menu Mais", async () => {
    await renderNavigation({ id: 8, name: "Teste", email: "teste@example.test" });
    const primary = container.querySelector(".cut-capability-nav .cut-navbar__links");
    expect([...primary.querySelectorAll(":scope > a")].map((link) => link.textContent)).toEqual(["Início", "Buscar", "Eventos", "Feed", "Ajuda"]);
    await act(async () => primary.querySelector(".cut-navbar__more-menu .dropdown-toggle").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const more = container.querySelector(".cut-navbar__more-menu .dropdown-menu");
    expect(more).not.toBeNull();
    expect([...more.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Cidades", "Mensagens", "Produções", "Artistas", "Blog"]);
    expect(more.querySelector('a[href="/messages"]')).not.toBeNull();
  });

  test("menu mobile mostra Ajuda para visitante", async () => {
    await renderNavigation();
    await act(async () => container.querySelector('[aria-label="Abrir menu"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const drawer = document.getElementById("cut-mobile-drawer");
    expect(drawer.querySelector('a[href="/help"]')).not.toBeNull();
    expect(drawer.textContent).toContain("Ajuda e suporte");
  });
});
