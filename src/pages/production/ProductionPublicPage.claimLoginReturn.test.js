/** @jest-environment jsdom */
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import independenceClaimService from "../../services/IndependenceClaimService";
import ProductionPublicPage from "./ProductionPublicPage";

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));
jest.mock("../../context/AuthContext", () => {
  const React = require("react");
  return { AuthContext: React.createContext({ user: null }) };
});
jest.mock("../../services/CutinappService", () => ({
  __esModule: true,
  default: {
    publicProduction: jest.fn(),
    publicEvents: jest.fn(),
    productionExperience: jest.fn(),
  },
}));
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));
jest.mock("../../utils/gallerySync", () => ({
  subscribeGalleryUpdates: () => () => {},
}));
jest.mock("../../components/NavlogComponent", () => () => null);
jest.mock("../../components/ProcessingIndicatorComponent", () => () => null);
jest.mock("../../components/event/ProductionTicketCartModal", () => () => null);
jest.mock("../../components/event/EventDiscoveryRail", () => () => null);
jest.mock("../../components/WhatsAppFloatingButton", () => () => null);
jest.mock("../../components/production/ProductionNextEventHero", () => () => null);
jest.mock("../../components/production/ProductionCommunitySection", () => () => null);
jest.mock("../../components/production/ProductionGallery", () => () => null);
jest.mock("../../components/editor/FormattedText", () => {
  const React = require("react");
  return { FormattedText: ({ value, emptyText }) => React.createElement("span", null, value || emptyText) };
});

describe("Independence: retorno e reivindicação de produção pública", () => {
  let container;
  let root;
  let navigate;
  const path = "/production/produtora-exemplo/public";
  const user = { id: 23, name: "Responsável", email: "responsavel@example.org" };
  const production = (ownership_status) => ({
    id: 51,
    slug: "produtora-exemplo",
    name: "Produtora Exemplo",
    ownership_status,
    can_sell: true,
    city: "Brasília",
    uf: "DF",
    is_following: false,
  });

  const renderProduction = async (currentUser) => {
    await act(async () => {
      root.render(
        <AuthContext.Provider value={{ user: currentUser }}>
          <ProductionPublicPage />
        </AuthContext.Provider>
      );
    });
  };
  const claimButton = () => Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent.includes("Reivindicar esta página"));
  const primaryAction = () => container.querySelector(".cut-production-public-profile__action--primary");

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    navigate = jest.fn();
    useNavigate.mockReturnValue(navigate);
    useParams.mockReturnValue({ slug: "produtora-exemplo" });
    Object.defineProperty(window, "scrollTo", { configurable: true, value: jest.fn() });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    cutinappService.publicEvents.mockResolvedValue({
      events: { data: [{ id: 77, title: "Evento", can_sell: true, ownership_status: "verified", price: 120 }] },
    });
    cutinappService.productionExperience.mockResolvedValue({
      analytics: { total_views: 0, unique_viewers: 0, viewers: [] },
      media: [],
      gallery: { albums: [] },
    });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.clearAllMocks();
  });

  test("cadastro preserva rota da produção pendente e não concede titularidade", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("pending_claim"), upcoming: [], past: [], artists: [],
    });
    await renderProduction(null);
    expect(claimButton().textContent).toContain("criar conta");
    await act(async () => { claimButton().click(); });
    expect(navigate).toHaveBeenCalledWith("/register", { state: { from: path } });

    await renderProduction(user);
    expect(claimButton().textContent).not.toContain("criar conta");
    await act(async () => { claimButton().click(); });
    expect(container.textContent).toContain("enviar esta solicitação não transfere o cadastro");
    expect(container.querySelector(".cut-unverified__submit").disabled).toBe(true);
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
    expect(independenceClaimService.submit).not.toHaveBeenCalled();
  });

  test("login preserva rota unclaimed, mesmo com preços curatoriais e can_sell", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("unclaimed"), upcoming: [], past: [], artists: [],
    });
    await renderProduction(null);
    const follow = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent.trim() === "Seguir");
    expect(follow).toBeDefined();
    await act(async () => { follow.click(); });
    expect(navigate).toHaveBeenCalledWith("/login", { state: { from: path } });

    await renderProduction(user);
    expect(container.querySelector("aside.cut-unverified")).not.toBeNull();
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
    expect(container.textContent).not.toMatch(/comprar ingresso|acesso concedido|editar produção/i);
    expect(cutinappService.publicEvents).toHaveBeenCalledWith(expect.objectContaining({ production_id: 51 }));
  });

  test("API 403 não concede acesso e mantém bloqueio de ingressos", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("unclaimed"), upcoming: [], past: [], artists: [],
    });
    independenceClaimService.submit.mockRejectedValue({
      response: { status: 403, data: { message: "Solicitação não autorizada" } },
    });
    await renderProduction(user);
    await act(async () => { claimButton().click(); });
    await act(async () => { container.querySelector(".cut-unverified__consent input").click(); });
    await act(async () => {
      container.querySelector(".cut-unverified__form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(independenceClaimService.submit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "production", entityId: 51, email: user.email, consent: true,
    }));
    expect(container.querySelector('[role="alert"]').textContent).toContain("Solicitação não autorizada");
    expect(container.querySelector(".cut-unverified__result")).toBeNull();
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
  });

  test("API 401 de sessão expirada não concede titularidade nem libera ingressos", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("unclaimed"), upcoming: [], past: [], artists: [],
    });
    independenceClaimService.submit.mockRejectedValue({
      response: { status: 401, data: { message: "Sua sessão expirou. Entre novamente." } },
    });
    await renderProduction(user);
    await act(async () => { claimButton().click(); });
    await act(async () => { container.querySelector(".cut-unverified__consent input").click(); });
    await act(async () => {
      container.querySelector(".cut-unverified__form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]').textContent)
      .toContain("Sua sessão expirou. Entre novamente.");
    expect(container.querySelector(".cut-unverified__result")).toBeNull();
    expect(container.querySelector(".cut-unverified__form")).not.toBeNull();
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
    expect(container.textContent).not.toMatch(/acesso concedido|editar produção|comprar ingresso/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("API 409 preserva a reivindicação pendente sem acesso ou reenvio automático", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("pending_claim"), upcoming: [], past: [], artists: [],
    });
    independenceClaimService.submit.mockRejectedValue({
      response: { status: 409, data: { message: "Já existe uma solicitação em análise." } },
    });
    await renderProduction(user);
    await act(async () => { claimButton().click(); });
    await act(async () => { container.querySelector(".cut-unverified__consent input").click(); });
    await act(async () => {
      container.querySelector(".cut-unverified__form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]').textContent)
      .toContain("Já existe uma solicitação em análise.");
    expect(container.querySelector(".cut-unverified__form")).not.toBeNull();
    expect(container.querySelector(".cut-unverified__submit").disabled).toBe(false);
    expect(container.querySelector(".cut-unverified__result")).toBeNull();
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
    expect(container.textContent).not.toMatch(/acesso concedido|editar produção/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("solicitação recebida permanece pendente sem ativar checkout", async () => {
    cutinappService.publicProduction.mockResolvedValue({
      production: production("pending_claim"), upcoming: [], past: [], artists: [],
    });
    independenceClaimService.submit.mockResolvedValue({ message: "Solicitação registrada para revisão." });
    await renderProduction(user);
    await act(async () => { claimButton().click(); });
    await act(async () => { container.querySelector(".cut-unverified__consent input").click(); });
    await act(async () => {
      container.querySelector(".cut-unverified__form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]').textContent)
      .toContain("Solicitação registrada para revisão.");
    expect(container.querySelector("aside.cut-unverified")).not.toBeNull();
    expect(primaryAction().textContent).toContain("Ver agenda");
    expect(primaryAction().textContent).not.toContain("Ingressos");
    expect(navigate).not.toHaveBeenCalled();
  });
});
