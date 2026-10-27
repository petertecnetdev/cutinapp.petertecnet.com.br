import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
// Isolate presentation tests from the Axios ESM implementation in this legacy Jest setup.
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));

import UnverifiedListingPanel from "./UnverifiedListingPanel";
import independenceClaimService from "../../services/IndependenceClaimService";

describe("Unverified listing public claim UI", () => {
  test("legacy producer listings remain untouched", () => {
    const html = renderToStaticMarkup(<UnverifiedListingPanel entity={{ id: 12 }} entityType="production" />);
    expect(html).toBe("");
  });

  test("a curated production displays accurate warning but never automatic grant", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 3, ownership_status: "unclaimed", source_url: "https://example.org/event" }}
        entityType="production"
        user={null}
        onLogin={() => {}}
      />
    );
    expect(html).toContain("responsável não verificado");
    expect(html).toContain("Consultar publicação original");
    expect(html).toContain("Reivindicar esta página — criar conta");
    expect(html).not.toContain("Comprar ingresso");
  });

  test("artist with no linked owner may request page ownership after creating an account", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 30, ownership_status: "unclaimed" }}
        entityType="artist"
        user={null}
        onLogin={() => {}}
      />
    );
    expect(html).toContain("Reivindicar esta página — criar conta");
    expect(html).not.toContain("Enviar solicitação de acesso");
  });

  test("signed-in artist sees claim action, without automatic ownership", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 30, ownership_status: "unclaimed" }}
        entityType="artist"
        user={{ id: 7, email: "artist@example.org" }}
      />
    );
    expect(html).toContain("Reivindicar esta página");
    expect(html).not.toContain("— criar conta");
    expect(html).not.toContain("Enviar solicitação de acesso");
  });

  test("claimed and verified listings never present a claim form", () => {
    const html = renderToStaticMarkup(
      <UnverifiedListingPanel
        entity={{ id: 9, ownership_status: "verified" }}
        entityType="event"
        user={{ id: 7, email: "test@example.org" }}
      />
    );
    expect(html).toBe("");
  });
});

// The static rendering checks above cannot exercise state retained by a mounted
// React instance. These regressions reproduce live account/listing transitions.
describe("W2 — isolamento de contexto e respostas assíncronas de reivindicação", () => {
  let container;
  let root;
  const ana = { id: 7, email: "ana@example.org", name: "Ana da Silva" };
  const bia = { id: 8, email: "bia@example.org", name: "Bia Souza" };
  const entity = (id, app_id = "10") => ({ id, app_id, ownership_status: "unclaimed" });
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const show = (props) => act(() => root.render(
    <UnverifiedListingPanel entityType="event" onLogin={() => {}} {...props} />
  ));
  const expand = () => act(() => container.querySelector(".cut-unverified__action").click());
  const allow = () => act(() => container.querySelector('input[type="checkbox"]').click());
  const submit = () => act(() => {
    container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
  afterAll(() => { delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("trocar conta durante POST descarta sucesso antigo e exige consentimento novo", async () => {
    const pending = deferred();
    independenceClaimService.submit.mockReturnValueOnce(pending.promise);
    show({ entity: entity(11), user: ana });
    expand();
    allow();
    submit();
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
    show({ entity: entity(11), user: bia });
    expect(container.textContent).not.toContain("Ana da Silva");
    expect(container.textContent).not.toContain("Enviando...");
    await act(async () => { pending.resolve({ message: "Acesso aprovado para Ana" }); await pending.promise; });
    expect(container.textContent).not.toContain("Acesso aprovado para Ana");
    expand();
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(container.querySelector('input[autocomplete="name"]').value).toBe("Bia Souza");
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
  });

  test("trocar entidade durante POST descarta erro obsoleto sem reenvio", async () => {
    const pending = deferred();
    independenceClaimService.submit.mockReturnValueOnce(pending.promise);
    show({ entity: entity(11), user: ana });
    expand();
    allow();
    submit();
    show({ entity: entity(12), user: ana });
    await act(async () => {
      pending.reject({ response: { data: { message: "Erro privado da entidade anterior" } } });
      try { await pending.promise; } catch (_) { /* expected */ }
    });
    expect(container.textContent).not.toContain("Erro privado da entidade anterior");
    expect(container.textContent).not.toContain("Enviando...");
    expand();
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
  });

  test("trocar aplicação reinicia consentimento; dois submits simultâneos geram um POST", async () => {
    const pending = deferred();
    independenceClaimService.submit.mockReturnValueOnce(pending.promise);
    show({ entity: entity(11, "10"), user: ana });
    expand();
    allow();
    act(() => {
      const form = container.querySelector("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
    show({ entity: entity(11, "20"), user: ana });
    await act(async () => { pending.resolve({ message: "Solicitação da aplicação anterior" }); await pending.promise; });
    expect(container.textContent).not.toContain("Solicitação da aplicação anterior");
    expand();
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(independenceClaimService.submit).toHaveBeenCalledTimes(1);
  });
});
