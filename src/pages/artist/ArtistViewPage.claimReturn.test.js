/** @jest-environment jsdom */
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import ArtistViewPage from "./ArtistViewPage";

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
  default: { publicArtist: jest.fn(), publicArtistMembers: jest.fn() },
}));
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));
jest.mock("../../components/NavlogComponent", () => () => null);
jest.mock("../../components/ProcessingIndicatorComponent", () => () => null);
jest.mock("../../components/event/EventArtwork", () => () => null);

describe("Independence: retorno ao perfil do artista e reivindicacao segura", () => {
  let container;
  let root;
  let navigate;

  const renderProfile = async (user) => {
    await act(async () => {
      root.render(
        <AuthContext.Provider value={{ user }}>
          <ArtistViewPage />
        </AuthContext.Provider>
      );
    });
  };

  const claimButton = () => Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent.includes("Reivindicar esta página"));

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    navigate = jest.fn();
    useNavigate.mockReturnValue(navigate);
    useParams.mockReturnValue({ slug: "artista-exemplo" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    cutinappService.publicArtistMembers.mockResolvedValue({ members: [], member_of: [] });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.clearAllMocks();
  });

  test("cadastro preserva URL do artista sem conceder titularidade ao voltar autenticado", async () => {
    cutinappService.publicArtist.mockResolvedValue({
      artist: { id: "9007199254740993", slug: "artista-exemplo", stage_name: "Artista Exemplo", ownership_status: "unclaimed" },
      upcoming_events: [], past_events: [], pending_events: [],
    });
    await renderProfile(null);
    expect(claimButton().textContent).toContain("criar conta");
    await act(async () => {
      claimButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(navigate).toHaveBeenCalledWith("/register", {
      state: { from: "/artist/artista-exemplo" },
    });

    await renderProfile({ id: 23, name: "Artista Exemplo", email: "artista@example.org" });
    expect(claimButton().textContent).not.toContain("criar conta");
    await act(async () => {
      claimButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("enviar esta solicitação não transfere o cadastro");
    expect(container.querySelector(".cut-unverified__submit").disabled).toBe(true);
    expect(container.textContent).not.toMatch(/comprar ingresso|pagar agora|acesso concedido/i);
  });

  test("solicitacao pendente exige verificacao humana e nao habilita compra", async () => {
    cutinappService.publicArtist.mockResolvedValue({
      artist: { id: "9007199254740993", slug: "artista-exemplo", stage_name: "Artista Exemplo", ownership_status: "pending_claim" },
      upcoming_events: [], past_events: [], pending_events: [],
    });
    await renderProfile({ id: 23, email: "artista@example.org" });
    expect(container.querySelector("aside.cut-unverified")).not.toBeNull();
    expect(container.textContent).toContain("responsável não verificado");
    await act(async () => {
      claimButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("A equipe verificará a identidade");
    expect(container.querySelector(".cut-unverified__submit").disabled).toBe(true);
    expect(container.textContent).not.toMatch(/comprar ingresso|pagar agora|acesso concedido/i);
  });

  test("perfil verificado nao apresenta CTA de reivindicacao", async () => {
    cutinappService.publicArtist.mockResolvedValue({
      artist: { id: 31, slug: "artista-exemplo", stage_name: "Artista Exemplo", ownership_status: "verified", verification_status: "verified" },
      upcoming_events: [], past_events: [], pending_events: [],
    });
    await renderProfile({ id: 23, email: "artista@example.org" });
    expect(container.querySelector("aside.cut-unverified")).toBeNull();
    expect(claimButton()).toBeUndefined();
  });
});
