import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import supportService from "../../services/SupportService";
import SupportCenterPage from "./SupportCenterPage";

jest.mock("../../components/NavlogComponent", () => () => <nav>Ajuda</nav>);
jest.mock("../../components/ProcessingIndicatorComponent", () => () => null);
jest.mock("../../context/AuthContext", () => ({ AuthContext: require("react").createContext({ user: null }) }));
jest.mock("../../services/SupportService", () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => Promise.resolve({ ticket: { public_id: "abc123456", subject: "Teste", status: "open" } })),
    mine: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));
jest.mock("../../utils/peterWhatsappFallback", () => ({
  getPeterWhatsapp: jest.fn(() => Promise.resolve("https://wa.me/5562000000000")),
  buildCutinappWhatsappHref: jest.fn((destination) => destination ? `${destination}?text=Cutinapp` : ""),
}));
jest.mock("../../utils/peterSupportEmail", () => ({
  DEFAULT_SUPPORT_EMAIL: "contato@petertecnet.com.br",
  getPeterSupportEmail: jest.fn(() => Promise.resolve("contato@petertecnet.com.br")),
  buildSupportMailto: jest.fn((email) => `mailto:${email}?subject=Suporte`),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  require("../../utils/peterWhatsappFallback").getPeterWhatsapp.mockResolvedValue("https://wa.me/5562000000000");
  require("../../utils/peterWhatsappFallback").buildCutinappWhatsappHref.mockImplementation((destination) => destination ? `${destination}?text=Cutinapp` : "");
  require("../../utils/peterSupportEmail").getPeterSupportEmail.mockResolvedValue("contato@petertecnet.com.br");
  require("../../utils/peterSupportEmail").buildSupportMailto.mockImplementation((email) => `mailto:${email}?subject=Suporte`);
  supportService.mine.mockResolvedValue({ data: [] });
  supportService.create.mockResolvedValue({ ticket: { public_id: "abc123456", subject: "Teste", status: "open" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const renderPage = async (user = null, route = "/help") => {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={{ user }}><SupportCenterPage /></AuthContext.Provider>
    </MemoryRouter>
  ));
};

const inputText = async (selector, value) => {
  const control = container.querySelector(selector);
  expect(control).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set;
  await act(async () => { setter.call(control, value); control.dispatchEvent(new Event("input", { bubbles: true })); });
};

test("visitante vê FAQ, WhatsApp, e-mail e abertura de chamados na mesma página", async () => {
  await renderPage();
  expect(container.querySelector('h1').textContent).toBe("Como podemos ajudar?");
  expect(container.querySelectorAll(".cut-support-faq").length).toBeGreaterThan(5);
  expect(container.querySelector('a[href^="https://wa.me/"]')).not.toBeNull();
  expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
  expect(container.querySelector('form')).not.toBeNull();
  expect(container.querySelector('input#support-name')).not.toBeNull();
});

test("busca de FAQ filtra respostas sem ocultar opções de contato", async () => {
  await renderPage();
  await inputText('#cut-support-search', "reembolso");
  expect(container.querySelectorAll(".cut-support-faq").length).toBeGreaterThan(0);
  expect(container.querySelectorAll(".cut-support-faq").length).toBeLessThan(9);
  expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
});

test("sem WhatsApp configurado, mantém e-mail e formulário acessíveis", async () => {
  require("../../utils/peterWhatsappFallback").getPeterWhatsapp.mockResolvedValue("");
  await renderPage();
  expect(container.textContent).toContain("Contato ainda não configurado");
  expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
  expect(container.querySelector('form')).not.toBeNull();
});

test("abertura de chamado preserva o contexto de reembolso", async () => {
  await renderPage(null, "/help?topic=refund&order=ABC123");
  expect(container.querySelector("#support-category").value).toBe("billing");
  expect(container.querySelector("#support-subject").value).toContain("reembolso");
  expect(container.textContent).toContain("Pedido relacionado");
});

test("formulário envia chamado pelo serviço existente", async () => {
  await renderPage();
  await inputText("#support-name", "Maria");
  await inputText("#support-email", "maria@example.com");
  await inputText("#support-subject", "Ingresso ausente");
  await inputText("#support-message", "Comprei o ingresso, mas ele não aparece.");
  await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(supportService.create).toHaveBeenCalledWith(expect.objectContaining({
    name: "Maria", email: "maria@example.com", subject: "Ingresso ausente",
    metadata: expect.objectContaining({ screen: "support_center" }),
  }));
  expect(container.textContent).toContain("Chamado enviado com sucesso");
});
