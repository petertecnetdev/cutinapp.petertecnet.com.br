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

describe("W2 — vínculos e proveniência não podem liberar compra indevida", () => {
  const aprovado = {
    id: 91,
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
    app_id: "7",
  };

  test.each([
    ["produção com veto comercial explícito", { production: { ...aprovado, can_sell: false } }],
    ["produção com can_sell textual", { production: { ...aprovado, can_sell: "true" } }],
    ["produção com reivindicação pendente", { production: { ...aprovado, ownership_status: "pending_claim" } }],
    ["produção vinculada com payload em array", { production: [] }],
    ["evento sem comprovação temporal de titularidade", { ownership_verified_at: null }],
  ])("%s mantém o comércio bloqueado mesmo com evento can_sell=true", (_, override) => {
    const entity = { ...aprovado, production: { ...aprovado }, ...override };
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test.each([
    ["URL HTTPS com credenciais", "https://usuario:segredo@example.org/agenda"],
    ["endereço IPv6 local", "https://[::1]/agenda"],
  ])("%s não expõe link e data inválida não causa falha de renderização", (_, source_url) => {
    const html = render(curated({ source_url, last_verified_at: "data-invalida" }), "artist");
    expect(html).toContain("Referência não disponível");
    expect(html).toContain("Não informada");
    expect(html).not.toContain('href="');
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });

  test("fonte HTTPS pública conserva link externo com proteções e sem CTA comercial", () => {
    const html = render(curated({
      source_url: "https://example.org/agenda",
      last_verified_at: "2026-10-20T12:00:00Z",
    }), "event");
    expect(html).toContain('href="https://example.org/agenda"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("Não informada");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });
});


describe("W2 — metadados curatoriais incompletos não concedem venda", () => {
  test.each([
    ["origem de curadoria sem titularidade", { listing_source: "curated" }],
    ["verificação pendente sem titularidade", { verification_status: "pending_claim" }],
    ["marcador institucional sem titularidade", { is_institutional_listing: true }],
    ["reivindicação rejeitada", { ownership_status: "rejected" }],
    ["aprovação manual sem comprovação temporal", {
      ownership_status: "verified",
      verification_status: "manual_approved",
      ownership_verified_at: null,
    }],
    ["titularidade declarada sem método de verificação", {
      ownership_status: "verified",
      ownership_verified_at: "2026-10-20T00:00:00Z",
    }],
  ])("%s mantém o checkout bloqueado mesmo com can_sell=true", (_, metadata) => {
    const entity = { id: 91, can_sell: true, ...metadata };
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  const approved = {
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
    app_id: "7",
  };

  test.each([
    ["produção sem app_id", { ...approved, app_id: undefined }],
    ["produção com origem curatorial não reivindicada", {
      app_id: "7", listing_source: "curated", can_sell: true,
    }],
    ["produção sem comprovação de titularidade", {
      ...approved, ownership_verified_at: null,
    }],
  ])("%s não herda permissão comercial do evento", (_, production) => {
    expect(canShowListingCommerce({ ...approved, production })).toBe(false);
  });

  test("evento sem app_id não herda permissão comercial da produção", () => {
    expect(canShowListingCommerce({
      ...approved,
      app_id: undefined,
      production: { ...approved },
    })).toBe(false);
  });
});

describe("W2 — compatibilidade legada sem abrir comércio curatorial", () => {
  const legado = {
    id: 20,
    app_id: "7",
    ownership_status: "verified",
    verification_status: "legacy_owner_record",
    listing_source: "legacy_organizer",
    can_sell: true,
  };
  const eventoAprovado = {
    id: 91,
    app_id: "7",
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
  };

  test("registro legado legítimo conserva a apresentação comercial anterior", () => {
    expect(isUnverifiedListing(legado)).toBe(false);
    expect(canShowListingCommerce(legado)).toBe(true);
  });

  test.each([
    ["origem de curadoria", { listing_source: "curated" }],
    ["origem institucional não comprovada", { listing_source: "institutional" }],
    ["revisão pendente", { verification_status: "pending_claim" }],
    ["reivindicação pendente", { ownership_status: "pending_claim" }],
  ])("%s não pode se passar por titularidade legada verificada", (_, alteracao) => {
    const entity = { ...legado, ...alteracao };
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test("produção com marcador legado e origem curatorial bloqueia o evento aprovado", () => {
    const entity = {
      ...eventoAprovado,
      production: { ...legado, listing_source: "curated" },
    };
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test("produção legada legítima no mesmo app preserva compatibilidade", () => {
    expect(canShowListingCommerce({
      ...eventoAprovado,
      production: { ...legado },
    })).toBe(true);
  });

  test("verificação antiga sem ownership não autoriza ficha com origem curatorial", () => {
    const entity = {
      id: 91,
      verification_status: "verified",
      listing_source: "curated",
      can_sell: true,
    };
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test("verificação antiga com origem legítima preserva apresentação legada", () => {
    const entity = {
      id: 91,
      verification_status: "verified",
      listing_source: "legacy_organizer",
      can_sell: true,
    };
    expect(isUnverifiedListing(entity)).toBe(false);
    expect(canShowListingCommerce(entity)).toBe(true);
  });
});
