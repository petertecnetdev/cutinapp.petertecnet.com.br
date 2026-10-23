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
