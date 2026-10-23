import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnverifiedListingPanel from "./UnverifiedListingPanel";
import { canShowListingCommerce, isUnverifiedListing } from "../../utils/independenceListing";

// O serviço não é chamado durante SSR; mock evita importar Axios ESM no Jest legado.
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));

const render = (entity, entityType = "event") => renderToStaticMarkup(
  React.createElement(UnverifiedListingPanel, {
    entity,
    entityType,
    user: null,
    onLogin: () => {},
  })
);

const curated = (overrides = {}) => ({
  id: 91,
  ownership_status: "unclaimed",
  listing_source: "curated",
  verification_status: "pending_claim",
  source_url: "https://example.org/agenda",
  can_sell: true,
  tickets: [
    { id: 10, name: "Inteira", price: 49.9, informational_only: true, sales_enabled: false },
  ],
  ...overrides,
});

describe("W2 — fichas curatoriais não concedem checkout pela interface", () => {
  test.each(["event", "production", "artist"])(
    "%s não mostra compra, mesmo com can_sell=true e ingressos no payload",
    (entityType) => {
      const entity = curated();
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);

      const html = render(entity, entityType);
      expect(html).toContain("responsável não verificado");
      expect(html).toContain("Consultar publicação original");
      expect(html).toContain("Reivindicar esta página — criar conta");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho|Reservar ingresso|Emitir QR/i);
      expect(html).not.toMatch(/href="[^"]*(checkout|cart|payment)[^"]*"/i);
    }
  );

  test("ficha com dados incompletos informa ausência de fonte e data, sem comércio", () => {
    const entity = curated({ source_url: null, last_verified_at: null });
    expect(canShowListingCommerce(entity)).toBe(false);

    const html = render(entity);
    expect(html).toContain("Referência não disponível");
    expect(html).toContain("Não informada");
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
  });

  test.each([
    "javascript:alert(1)",
    "http://example.org/agenda",
    "https://127.0.0.1/privado",
  ])("fonte insegura %s não gera link clicável", (source_url) => {
    const html = render(curated({ source_url }), "production");
    expect(html).toContain("Referência não disponível");
    expect(html).not.toContain('href="');
    expect(html).not.toContain("Consultar publicação original");
  });

  test("solicitação pendente e produção vinculada não habilitam venda", () => {
    const entity = curated({
      ownership_status: "pending_claim",
      production: {
        id: 20,
        app_id: 6,
        ownership_status: "verified",
        verification_status: "manual_approved",
        ownership_verified_at: "2026-10-20T00:00:00Z",
        can_sell: true,
      },
      app_id: 6,
    });
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity);
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra/i);
  });

  test("aprovação de titularidade sem liberação comercial mantém venda bloqueada", () => {
    const entity = {
      id: 91,
      ownership_status: "verified",
      verification_status: "manual_approved",
      ownership_verified_at: "2026-10-20T00:00:00Z",
      can_sell: false,
    };
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(render(entity)).toBe("");
  });
});


describe("W2 — isolamento de aplicação com identificadores decimais", () => {
  const aprovado = {
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
  };

  const eventoComProducao = (appEvento, appProducao) => ({
    ...aprovado,
    app_id: appEvento,
    production: { ...aprovado, app_id: appProducao },
  });

  test.each([
    ["IDs de 64 bits distintos por uma unidade", "9223372036854775807", "9223372036854775806"],
    ["número JavaScript acima do limite seguro", 9007199254740992, "9007199254740992"],
    ["identificador zero", 0, "0"],
    ["identificador negativo", -7, "-7"],
    ["outra aplicação mesmo com zeros à esquerda", "0007", "8"],
    ["identificador com espaço", "7 ", "7"],
    ["identificador em notação científica", "7e0", "7"],
  ])("nega comércio entre evento e produção quando %s", (_, appEvento, appProducao) => {
    const entity = eventoComProducao(appEvento, appProducao);
    expect(isUnverifiedListing(entity)).toBe(false);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test("IDs decimais positivos equivalentes preservam comércio autorizado", () => {
    const entity = eventoComProducao("0009223372036854775807", "9223372036854775807");
    expect(canShowListingCommerce(entity)).toBe(true);
  });
});
