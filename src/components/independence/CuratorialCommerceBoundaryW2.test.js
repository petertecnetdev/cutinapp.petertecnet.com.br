import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnverifiedListingPanel from "./UnverifiedListingPanel";
import { canShowListingCommerce, claimStatusMessage, isUnverifiedListing } from "../../utils/independenceListing";

// O serviço não é chamado durante SSR; mock evita importar Axios ESM no Jest legado.
jest.mock("../../services/IndependenceClaimService", () => ({
  __esModule: true,
  default: { submit: jest.fn(), mine: jest.fn() },
}));

// Testa o contrato HTTP real do serviço, sem carregar Axios ESM no Jest legado.
jest.mock("../../services/AppApiClient", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
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


describe("W2 — regressões de tipos de escopo e autorização comercial", () => {
  const aprovado = {
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
    app_id: "7",
  };

  test.each([
    ["booleano", true],
    ["array", [7]],
    ["objeto", { id: 7 }],
    ["dígitos Unicode", "７"],
    ["espaço à esquerda", " 7"],
    ["número fracionário textual", "7.0"],
    ["zero", "0"],
    ["inteiro JavaScript impreciso", Number.MAX_SAFE_INTEGER + 1],
    ["notação exponencial", "7e0"],
    ["identificador ausente", undefined],
  ])("nega comércio quando app_id da produção tem formato %s", (_, appId) => {
    const entity = {
      ...aprovado,
      production: { ...aprovado, app_id: appId },
    };
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test.each([1, "true", "1", {}, [], false, 0])(
    "nega comércio quando a API devolve can_sell não booleano estrito (%j)",
    (flag) => {
      expect(canShowListingCommerce({ ...aprovado, can_sell: flag })).toBe(false);
      expect(canShowListingCommerce({
        ...aprovado,
        production: { ...aprovado, can_sell: flag },
      })).toBe(false);
    }
  );

  test("preserva a venda legítima com app_id canônico e flags booleanas verdadeiras", () => {
    expect(canShowListingCommerce({
      ...aprovado,
      production: { ...aprovado, app_id: "0007", can_sell: true },
    })).toBe(true);
  });
});


describe("W2 — links externos curatoriais não permitem destinos internos ou injeção", () => {
  test.each([
    ["IPv4 abreviado de loopback", "https://127.1/agenda"],
    ["IPv4 decimal inteiro de loopback", "https://2130706433/agenda"],
    ["IPv4 hexadecimal de loopback", "https://0x7f000001/agenda"],
    ["IPv6 com IPv4 mapeado", "https://[::ffff:127.0.0.1]/agenda"],
    ["subdomínio local com ponto final", "https://agenda.localhost./evento"],
    ["credenciais disfarçando o host", "https://example.org@localhost/agenda"],
    ["URL protocol-relative", "//example.org/agenda"],
    ["esquema data", "data:text/html,<script>alert(1)</script>"],
  ])("%s nunca vira link clicável na ficha pública", (_, source_url) => {
    const html = render(curated({ source_url }), "event");
    expect(html).toContain("Referência não disponível");
    expect(html).not.toContain('href="');
    expect(html).not.toMatch(/<script|<svg|onerror=|onload=/i);
    expect(canShowListingCommerce(curated({ source_url }))).toBe(false);
  });

  test("URL HTTPS pública com tentativa de injeção no atributo é escapada", () => {
    const html = render(curated({
      source_url: 'https://example.org/agenda?q="><script>alert(1)</script>',
    }), "production");
    expect(html).toContain("Consultar publicação original");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="https://example.org/agenda?q=">');
    expect(html).not.toMatch(/onerror=|onload=/i);
    expect(canShowListingCommerce(curated())).toBe(false);
  });

  test("fonte HTTPS legítima mantém consulta sem habilitar pagamento", () => {
    const html = render(curated({
      source_url: "HTTPS://Example.org/agenda",
      last_verified_at: "2026-10-20T12:00:00Z",
    }), "artist");
    expect(html).toContain('href="https://example.org/agenda"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });
});


describe("W2 — payloads mistos de ingressos não concedem checkout", () => {
  const ingressoComercial = {
    id: 501,
    name: "Inteira",
    price: 75,
    informational_only: false,
    curatorial_information_only: false,
    sales_enabled: true,
    can_sell: true,
    checkout_url: "https://example.org/checkout",
  };

  test.each([
    ["marcador informativo antigo", { informational_only: true, sales_enabled: false }],
    ["marcador informativo novo", { curatorial_information_only: true, sales_enabled: false }],
    ["ingresso sem marcadores curatoriais", { informational_only: undefined, curatorial_information_only: undefined }],
    ["flag textual de venda", { can_sell: "true" }],
    ["ingresso explicitamente comercial", { informational_only: false, curatorial_information_only: false }],
    ["catálogo misto", { informational_only: true, curatorial_information_only: false }],
  ])("%s não transforma ficha não reivindicada em checkout", (_, override) => {
    const entity = curated({
      tickets: [{ ...ingressoComercial, ...override }, { ...ingressoComercial, id: 502 }],
    });
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity);
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho|Emitir QR/i);
    expect(html).not.toContain("https://example.org/checkout");
  });

  test("aprovação de evento não herda venda de produção com reivindicação pendente e catálogo misto", () => {
    const aprovado = {
      id: 91,
      app_id: "7",
      ownership_status: "verified",
      verification_status: "manual_approved",
      ownership_verified_at: "2026-10-20T00:00:00Z",
      can_sell: true,
    };
    const entity = {
      ...aprovado,
      production: { ...aprovado, ownership_status: "pending_claim" },
      tickets: [{ ...ingressoComercial }, { ...ingressoComercial, informational_only: true }],
    };
    expect(canShowListingCommerce(entity)).toBe(false);
  });
});


describe("W2 — fontes locais e estados de reivindicação não transferem titularidade", () => {
  test.each([
    ["host de rede interna", "https://agenda.internal/evento"],
    ["domínio .local", "https://eventos.local/agenda"],
    ["IPv4 privado", "https://192.168.1.10/agenda"],
    ["IP de metadados cloud", "https://169.254.169.254/latest/meta-data/"],
    ["IPv6 link-local", "https://[fe80::1]/agenda"],
    ["protocolo file", "file:///etc/passwd"],
    ["protocolo blob", "blob:https://example.org/agenda"],
  ])("%s não vira link público nem libera CTA comercial", (_, source_url) => {
    const entity = curated({ source_url, can_sell: true });
    const html = render(entity, "event");
    expect(html).toContain("Referência não disponível");
    expect(html).not.toContain('href="');
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test.each(["pending", "pending_claim", "duplicate", "rejected", "unexpected"])(
    "estado %s não afirma transferência ou acesso automático",
    (status) => {
      const message = claimStatusMessage(status);
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/acesso liberado|propriedade transferida|venda habilitada/i);
    }
  );

  test("aprovação é diferenciada de solicitação pendente, sem afirmar venda automática", () => {
    const approved = claimStatusMessage("approved");
    const pending = claimStatusMessage("pending_claim");
    expect(approved).toContain("aprovada após verificação");
    expect(pending).toContain("não transfere acesso ou propriedade");
    expect(approved).not.toMatch(/venda habilitada|checkout liberado/i);
  });
});


describe("W2 — reivindicação não forja identidade, tenant ou autorização", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;
  const validClaim = {
    entityType: "event",
    entityId: "0009223372036854775807",
    name: "  Produtora Exemplo  ",
    email: "  contato@example.org  ",
    phone: "  ",
    message: "  Documento disponível  ",
    consent: true,
    app_id: "999",
    user_id: 1001,
    ownership_status: "verified",
    can_sell: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appApiClient.post.mockResolvedValue({ data: { status: "pending_claim" } });
  });

  test.each([
    ["ID zero", "000"],
    ["ID negativo", -1],
    ["ID fracionário", "1.0"],
    ["notação científica", "1e3"],
    ["espaço em ID", " 7"],
    ["número acima do limite seguro", Number.MAX_SAFE_INTEGER + 1],
    ["array", [7]],
    ["objeto", { id: 7 }],
    ["ID ausente", undefined],
  ])("%s impede POST de reivindicação", async (_, entityId) => {
    await expect(claimService.submit({ ...validClaim, entityId }))
      .rejects.toThrow("Identificador da entidade inválido.");
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("preserva ID decimal de 64 bits sem perda e omite campos de autoridade forjados", async () => {
    await expect(claimService.submit(validClaim)).resolves.toEqual({ status: "pending_claim" });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).toHaveBeenCalledWith("/independence/claims", {
      entity_type: "event",
      entity_id: "9223372036854775807",
      name: "Produtora Exemplo",
      email: "contato@example.org",
      phone: null,
      message: "Documento disponível",
      consent: true,
    });
    const [, payload] = appApiClient.post.mock.calls[0];
    expect(payload).not.toHaveProperty("app_id");
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("ownership_status");
    expect(payload).not.toHaveProperty("can_sell");
  });

  test("não transforma consentimento textual em autorização booleana", async () => {
    await claimService.submit({ ...validClaim, entityId: 7, consent: "true" });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/independence/claims",
      expect.objectContaining({ entity_id: "7", consent: false })
    );
  });

  test("erro HTTP é propagado sem simular aprovação de titularidade", async () => {
    const failure = new Error("API indisponível");
    appApiClient.post.mockRejectedValueOnce(failure);
    await expect(claimService.submit(validClaim)).rejects.toBe(failure);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });

  test("consulta de solicitações usa endpoint da conta sem aceitar tenant arbitrário", async () => {
    appApiClient.get.mockResolvedValueOnce({ data: { data: [{ id: 8, status: "pending" }] } });
    await expect(claimService.mine()).resolves.toEqual([{ id: 8, status: "pending" }]);
    expect(appApiClient.get).toHaveBeenCalledWith("/independence/claims/mine");
    expect(appApiClient.post).not.toHaveBeenCalled();
  });
});
