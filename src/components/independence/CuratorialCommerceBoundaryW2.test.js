import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnverifiedListingPanel from "./UnverifiedListingPanel";
import { canShowListingCommerce, claimStatusMessage, isUnverifiedListing, safeListingSourceUrl } from "../../utils/independenceListing";

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


describe("W2 — limites de exposição pública no fluxo de reivindicação", () => {
  test.each(["event", "production", "artist"])(
    "%s não expõe formulário nem dados de contato sem autenticação",
    (entityType) => {
      const html = render(curated({
        contact_email: "privado@example.org",
        phone: "+55 62 99999-9999",
      }), entityType);
      expect(html).toContain("Reivindicar esta página — criar conta");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("type=\"email\"");
      expect(html).not.toContain("type=\"tel\"");
      expect(html).not.toContain("privado@example.org");
      expect(html).not.toContain("+55 62 99999-9999");
    }
  );

  test.each(["verified", "rejected"])(
    "status de titularidade %s não oferece reivindicação direta no painel",
    (ownership_status) => {
      const entity = curated({ ownership_status });
      expect(render(entity)).toBe("");
      if (ownership_status === "rejected") {
        expect(canShowListingCommerce(entity)).toBe(false);
      }
    }
  );

  test("usuário autenticado vê entrada para reivindicar, sem formulário antes de consentir", () => {
    const html = renderToStaticMarkup(React.createElement(UnverifiedListingPanel, {
      entity: curated(),
      entityType: "event",
      user: { id: 17, email: "usuario@example.org", name: "Pessoa Autenticada" },
      onLogin: () => {},
    }));
    expect(html).toContain("Reivindicar esta página");
    expect(html).not.toContain("Reivindicar esta página — criar conta");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("usuario@example.org");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });

  test("data de conferência inválida não inventa uma data pública", () => {
    const html = render(curated({ last_verified_at: "nao-e-uma-data" }));
    expect(html).toContain("Última conferência");
    expect(html).toContain("Não informada");
    expect(html).not.toContain("Invalid Date");
    expect(canShowListingCommerce(curated({ last_verified_at: "nao-e-uma-data" }))).toBe(false);
  });
});


describe("W2 — contratos de reivindicação nas três entidades", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;

  beforeEach(() => {
    jest.clearAllMocks();
    appApiClient.post.mockResolvedValue({ data: { status: "pending_claim" } });
  });

  test.each(["event", "production", "artist"])(
    "%s envia somente identificador canônico e campos de solicitação, nunca autoridade",
    async (entityType) => {
      await claimService.submit({
        entityType,
        entityId: "0009007199254740993",
        name: " Pessoa Responsável ",
        email: " contato@example.org ",
        phone: " +55 62 90000-0000 ",
        message: " ",
        consent: false,
        app_id: "999",
        user_id: 77,
        verification_status: "manual_approved",
        can_sell: true,
      });

      expect(appApiClient.post).toHaveBeenCalledTimes(1);
      expect(appApiClient.post).toHaveBeenCalledWith("/independence/claims", {
        entity_type: entityType,
        entity_id: "9007199254740993",
        name: "Pessoa Responsável",
        email: "contato@example.org",
        phone: "+55 62 90000-0000",
        message: null,
        consent: false,
      });
    }
  );

  test("erro 403 ao consultar reivindicações não é convertido em lista vazia ou aprovação", async () => {
    const denied = Object.assign(new Error("Acesso revogado"), {
      response: { status: 403 },
    });
    appApiClient.get.mockRejectedValueOnce(denied);

    await expect(claimService.mine()).rejects.toBe(denied);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
    expect(appApiClient.get).toHaveBeenCalledWith("/independence/claims/mine");
    expect(appApiClient.post).not.toHaveBeenCalled();
  });
});

describe("W2 — URLs de proveniência não sofrem coerção implícita", () => {
  test.each([
    ["objeto URL", new URL("https://example.org/agenda")],
    ["array", ["https://example.org/agenda"]],
    ["número", 12345],
    ["booleano", true],
    ["objeto simples", { href: "https://example.org/agenda" }],
  ])("%s não vira link externo sem string explícita", (_, source_url) => {
    expect(safeListingSourceUrl(source_url)).toBe("");
  });

  test("objeto hostil não tem toString executado durante a validação da fonte", () => {
    const toString = jest.fn(() => { throw new Error("coerção inesperada"); });
    expect(safeListingSourceUrl({ toString })).toBe("");
    expect(toString).not.toHaveBeenCalled();
  });

  test("URL HTTPS com parâmetros preserva destino e escapa ampersand no HTML", () => {
    const html = render(curated({
      source_url: "https://example.org/agenda?evento=91&origem=curadoria",
    }));
    expect(html).toContain("https://example.org/agenda?evento=91&amp;origem=curadoria");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });
});


describe("W2 — requisições de reivindicação rejeitam coerção e consentimento implícito", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;
  const base = {
    entityType: "event",
    entityId: "91",
    name: "Pessoa Responsável",
    email: "contato@example.org",
    consent: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appApiClient.post.mockResolvedValue({ data: { status: "pending_claim" } });
  });

  test.each([
    ["booleano", true],
    ["BigInt", BigInt("9007199254740993")],
    ["objeto Number", new Number(91)],
    ["data", new Date("2026-10-24T00:00:00Z")],
    ["número NaN", Number.NaN],
    ["número infinito", Infinity],
    ["sinal positivo", "+91"],
    ["prefixo hexadecimal", "0x5b"],
    ["quebra de linha", "91\n"],
    ["ID nulo", null],
  ])("%s não é convertido em ID e não produz POST", async (_, entityId) => {
    await expect(claimService.submit({ ...base, entityId }))
      .rejects.toThrow("Identificador da entidade inválido.");
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("objeto hostil não tem toString executado para produzir identificador", async () => {
    const toString = jest.fn(() => { throw new Error("coerção indevida"); });
    await expect(claimService.submit({ ...base, entityId: { toString } }))
      .rejects.toThrow("Identificador da entidade inválido.");
    expect(toString).not.toHaveBeenCalled();
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test.each(["on", 1, [], {}, null, undefined, false])(
    "consentimento não booleano/negado %p nunca vira true no payload",
    async (consent) => {
      await claimService.submit({ ...base, consent });
      expect(appApiClient.post).toHaveBeenCalledTimes(1);
      expect(appApiClient.post).toHaveBeenCalledWith(
        "/independence/claims",
        expect.objectContaining({ consent: false })
      );
    }
  );

  test("erro 401 na solicitação é propagado sem aprovação implícita", async () => {
    const denied = Object.assign(new Error("Sessão expirada"), { response: { status: 401 } });
    appApiClient.post.mockRejectedValueOnce(denied);
    await expect(claimService.submit(base)).rejects.toBe(denied);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });
});

describe("W2 — falhas e concorrência HTTP não aprovam reivindicações", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;
  const request = {
    entityType: "event",
    entityId: "9007199254740993",
    name: "Produtora Responsável",
    email: "responsavel@example.org",
    consent: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([409, 422, 429, 503])(
    "POST com HTTP %i rejeita sem retry nem aprovação local",
    async (status) => {
      const failure = Object.assign(new Error("Solicitação não concluída"), {
        response: { status, data: { message: "Solicitação não concluída" } },
      });
      appApiClient.post.mockRejectedValueOnce(failure);
      await expect(claimService.submit(request)).rejects.toBe(failure);
      expect(appApiClient.post).toHaveBeenCalledTimes(1);
      expect(appApiClient.get).not.toHaveBeenCalled();
    }
  );

  test.each([401, 429])(
    "GET mine com HTTP %i não transforma falha em lista ou status aprovado",
    async (status) => {
      const failure = Object.assign(new Error("Consulta indisponível"), {
        response: { status },
      });
      appApiClient.get.mockRejectedValueOnce(failure);
      await expect(claimService.mine()).rejects.toBe(failure);
      expect(appApiClient.get).toHaveBeenCalledTimes(1);
      expect(appApiClient.post).not.toHaveBeenCalled();
    }
  );

  test("resposta duplicada preserva status pendente sem inventar transferência", async () => {
    const response = { status: "duplicate", message: "Já existe uma solicitação" };
    appApiClient.post.mockResolvedValueOnce({ data: response });
    await expect(claimService.submit(request)).resolves.toBe(response);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(claimStatusMessage(response.status)).not.toMatch(/acesso liberado|titularidade transferida/i);
  });
});

describe("W2 — concorrência de reivindicações não mistura entidades nem estados", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;
  const request = (entityType, entityId) => ({
    entityType,
    entityId,
    name: "Responsável pela ficha",
    email: "contato@example.org",
    consent: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("respostas fora de ordem preservam o status e o identificador de cada solicitação", async () => {
    let resolveEvent;
    let resolveProduction;
    appApiClient.post
      .mockImplementationOnce(() => new Promise((resolve) => { resolveEvent = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveProduction = resolve; }));

    const eventPromise = claimService.submit(request("event", "9007199254740993"));
    const productionPromise = claimService.submit(request("production", "9007199254740994"));
    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(appApiClient.post.mock.calls.map(([, payload]) => [
      payload.entity_type, payload.entity_id,
    ])).toEqual([
      ["event", "9007199254740993"],
      ["production", "9007199254740994"],
    ]);

    const productionResponse = { status: "duplicate", entity_id: "9007199254740994" };
    resolveProduction({ data: productionResponse });
    await expect(productionPromise).resolves.toBe(productionResponse);

    const eventResponse = { status: "pending_claim", entity_id: "9007199254740993" };
    resolveEvent({ data: eventResponse });
    await expect(eventPromise).resolves.toBe(eventResponse);
    expect(claimStatusMessage(productionResponse.status)).not.toMatch(/propriedade transferida|venda habilitada/i);
    expect(claimStatusMessage(eventResponse.status)).not.toMatch(/propriedade transferida|venda habilitada/i);
  });

  test("falha de uma reivindicação concorrente não aprova nem altera a outra", async () => {
    let rejectArtist;
    let resolveEvent;
    appApiClient.post
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectArtist = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveEvent = resolve; }));

    const artistPromise = claimService.submit(request("artist", "101"));
    const eventPromise = claimService.submit(request("event", "102"));
    const artistError = Object.assign(new Error("Sessão revogada"), { response: { status: 401 } });
    rejectArtist(artistError);
    await expect(artistPromise).rejects.toBe(artistError);

    const eventResponse = { status: "pending_claim", entity_id: "102" };
    resolveEvent({ data: eventResponse });
    await expect(eventPromise).resolves.toBe(eventResponse);
    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(appApiClient.post.mock.calls[0][1].entity_id).toBe("101");
    expect(appApiClient.post.mock.calls[1][1].entity_id).toBe("102");
  });

  test("consulta de reivindicações não herda resposta de envio simultâneo", async () => {
    let resolveSubmit;
    let resolveMine;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveSubmit = resolve; }));
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMine = resolve; }));

    const submitted = claimService.submit(request("event", "91"));
    const mine = claimService.mine();
    const currentClaims = [{ id: 3, status: "rejected" }];
    resolveMine({ data: { data: currentClaims } });
    await expect(mine).resolves.toBe(currentClaims);

    const submitResponse = { status: "pending_claim" };
    resolveSubmit({ data: submitResponse });
    await expect(submitted).resolves.toBe(submitResponse);
    expect(appApiClient.get).toHaveBeenCalledWith("/independence/claims/mine");
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });
});

describe("W2 — resposta de claim não concede comércio sem atualização da ficha", () => {
  const claimService = jest.requireActual("../../services/IndependenceClaimService").default;
  const appApiClient = require("../../services/AppApiClient").default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ["event", "approved"],
    ["production", "approved"],
    ["artist", "approved"],
    ["event", "duplicate"],
    ["production", "pending_claim"],
    ["artist", "rejected"],
  ])("%s com resposta %s mantém ficha curatorial sem CTA", async (entityType, status) => {
    const entity = curated({ id: "9007199254740993", app_id: "6" });
    const original = { ...entity };
    const response = {
      status,
      entity_type: entityType,
      entity_id: entity.id,
      can_sell: true,
    };
    appApiClient.post.mockResolvedValueOnce({ data: response });

    await expect(claimService.submit({
      entityType,
      entityId: entity.id,
      name: "Responsável",
      email: "responsavel@example.org",
      consent: true,
    })).resolves.toBe(response);

    // O resultado do pedido não é uma autorização de comércio nem uma
    // atualização de ownership do registro público.
    expect(entity).toEqual(original);
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity, entityType);
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.get).not.toHaveBeenCalled();
  });

  test("listagem de reivindicações aprovadas não altera permissão de venda da ficha", async () => {
    const entity = curated({ ownership_status: "pending_claim", can_sell: true });
    const claims = [{ id: 7, entity_type: "event", entity_id: entity.id, status: "approved" }];
    appApiClient.get.mockResolvedValueOnce({ data: { data: claims } });

    await expect(claimService.mine()).resolves.toBe(claims);
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(render(entity)).toContain("responsável não verificado");
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("titularidade aprovada sem can_sell explícito permanece sem comércio", () => {
    const entity = {
      id: "9007199254740993",
      ownership_status: "verified",
      verification_status: "manual_approved",
      ownership_verified_at: "2026-10-24T00:00:00Z",
      can_sell: false,
    };
    expect(isUnverifiedListing(entity)).toBe(false);
    expect(canShowListingCommerce(entity)).toBe(false);
  });
});

describe("W2 — payloads hostis não atravessam a fronteira entre aplicações", () => {
  const aprovado = {
    id: "91",
    app_id: "7",
    ownership_status: "verified",
    verification_status: "manual_approved",
    ownership_verified_at: "2026-10-20T00:00:00Z",
    can_sell: true,
  };

  test.each([
    ["BigInt", 7n],
    ["Symbol", Symbol("7")],
    ["algarismo árabe-indic", "٧"],
    ["separador numérico", "7_0"],
    ["quebra de linha", "7\n"],
    ["sinal positivo", "+7"],
  ])("nega CTA quando app_id da produção é %s", (_, appId) => {
    const entity = { ...aprovado, production: { ...aprovado, app_id: appId } };
    expect(canShowListingCommerce(entity)).toBe(false);
  });

  test.each(["event", "production"])(
    "não executa coerção de objeto hostil no app_id de %s",
    (target) => {
      const toString = jest.fn(() => { throw new Error("coerção proibida"); });
      const hostile = { toString, valueOf: toString };
      const entity = {
        ...aprovado,
        app_id: target === "event" ? hostile : "7",
        production: { ...aprovado, app_id: target === "production" ? hostile : "7" },
      };
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(toString).not.toHaveBeenCalled();
    }
  );

  test("ficha curatorial e ingressos congelados continuam informativos, sem mutação", () => {
    const ticket = Object.freeze({
      id: "10", informational_only: true, curatorial_information_only: true,
      sales_enabled: false, price: 49.9,
    });
    const entity = Object.freeze({
      ...curated({ app_id: "7", tickets: Object.freeze([ticket]) }),
      production: Object.freeze({ ...aprovado }),
    });
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(render(entity)).toContain("responsável não verificado");
    expect(render(entity)).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
    expect(entity.tickets[0]).toBe(ticket);
    expect(entity.production.app_id).toBe("7");
  });

  test("ficha verificada e produção congeladas preservam o controle positivo", () => {
    const entity = Object.freeze({
      ...aprovado,
      production: Object.freeze({ ...aprovado, app_id: "0007" }),
    });
    expect(isUnverifiedListing(entity)).toBe(false);
    expect(canShowListingCommerce(entity)).toBe(true);
    expect(entity.production.app_id).toBe("0007");
  });
});
