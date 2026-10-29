import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import UnverifiedListingPanel from "./UnverifiedListingPanel";
import { canShowListingCommerce, claimStatusMessage, isUnverifiedListing, safeListingSourceUrl } from "../../utils/independenceListing";
import { reconcileStoredSelection } from "../../utils/checkoutSelectionRecovery";
import { checkoutQuantityLimit, rankCheckoutAddOns, resolveCheckoutQuantity, summarizeCheckoutAddOnOffer } from "../../utils/checkoutAddOns";

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

jest.mock("../../utils/authTokenStorage", () => ({
  getAuthToken: jest.fn(() => "token-A"),
}));
// Os cenários legados de payload usam contexto autenticado explícito; os
// cenários de rejeição do preflight ficam no teste novo do serviço.
const actualClaimService = jest.requireActual("../../services/IndependenceClaimService").default;
const claimHttpClient = require("../../services/AppApiClient").default;
const claimServiceForFixtures = {
  ...actualClaimService,
  submit: (input) => {
    require("../../utils/authTokenStorage").getAuthToken.mockReturnValue("token-A");
    const expectedEmail = typeof input?.email === "string" ? input.email.trim() : "";
    claimHttpClient.get.mockImplementation((url) => {
      if (url === "/me") {
        return Promise.resolve({ data: { data: {
          application: { id: 10, slug: "cutinapp" },
          user: { id: 7, email: expectedEmail },
        } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    return actualClaimService.submit({ applicationId: "10", userId: "7", ...input });
  },
};


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
  const claimService = claimServiceForFixtures;
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
    await expect(claimService.submit(validClaim)).resolves.toMatchObject({ status: "pending_claim" });
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
    await expect(claimService.submit({ ...validClaim, entityId: 7, consent: "true" }))
      .rejects.toMatchObject({ status: 403 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("erro HTTP é propagado sem simular aprovação de titularidade", async () => {
    const failure = new Error("API indisponível");
    appApiClient.post.mockRejectedValueOnce(failure);
    await expect(claimService.submit(validClaim)).rejects.toThrow("Não foi possível enviar");
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
      const html = render(entity);
      expect(html).toContain("Informações públicas — responsável não verificado");
      expect(html).not.toContain("Reivindicar esta página");
      expect(html).not.toContain("Enviar solicitação de acesso");
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
  const claimService = claimServiceForFixtures;
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
        consent: true,
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
        consent: true,
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
  const claimService = claimServiceForFixtures;
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
      await expect(claimService.submit({ ...base, consent }))
        .rejects.toMatchObject({ status: 403 });
      expect(appApiClient.post).not.toHaveBeenCalled();
    }
  );

  test("erro 401 na solicitação é propagado sem aprovação implícita", async () => {
    const denied = Object.assign(new Error("Sessão expirada"), { response: { status: 401 } });
    appApiClient.post.mockRejectedValueOnce(denied);
    await expect(claimService.submit(base)).rejects.toMatchObject({ status: 401 });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });
});

describe("W2 — falhas e concorrência HTTP não aprovam reivindicações", () => {
  const claimService = claimServiceForFixtures;
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
      await expect(claimService.submit(request)).rejects.toMatchObject({ status: expect.any(Number) });
      expect(appApiClient.post).toHaveBeenCalledTimes(1);
      expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
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
    await expect(claimService.submit(request)).resolves.toMatchObject({ status: response.status });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(claimStatusMessage(response.status)).not.toMatch(/acesso liberado|titularidade transferida/i);
  });
});

describe("W2 — concorrência de reivindicações não mistura entidades nem estados", () => {
  const claimService = claimServiceForFixtures;
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(appApiClient.post.mock.calls.map(([, payload]) => [
      payload.entity_type, payload.entity_id,
    ])).toEqual([
      ["event", "9007199254740993"],
      ["production", "9007199254740994"],
    ]);

    const productionResponse = { status: "duplicate", entity_id: "9007199254740994" };
    resolveProduction({ data: productionResponse });
    await expect(productionPromise).resolves.toMatchObject({ status: productionResponse.status });

    const eventResponse = { status: "pending_claim", entity_id: "9007199254740993" };
    resolveEvent({ data: eventResponse });
    await expect(eventPromise).resolves.toMatchObject({ status: eventResponse.status });
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    const artistError = Object.assign(new Error("Sessão revogada"), { response: { status: 401 } });
    rejectArtist(artistError);
    await expect(artistPromise).rejects.toMatchObject({ status: 401 });

    const eventResponse = { status: "pending_claim", entity_id: "102" };
    resolveEvent({ data: eventResponse });
    await expect(eventPromise).resolves.toMatchObject({ status: eventResponse.status });
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentClaims = [{ id: 3, status: "rejected" }];
    resolveMine({ data: { data: currentClaims } });
    await expect(mine).resolves.toBe(currentClaims);

    const submitResponse = { status: "pending_claim" };
    resolveSubmit({ data: submitResponse });
    await expect(submitted).resolves.toMatchObject({ status: submitResponse.status });
    expect(appApiClient.get).toHaveBeenCalledWith("/independence/claims/mine");
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });
});

describe("W2 — resposta de claim não concede comércio sem atualização da ficha", () => {
  const claimService = claimServiceForFixtures;
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

    const submitResult = claimService.submit({
      entityType,
      entityId: entity.id,
      name: "Responsável",
      email: "responsavel@example.org",
      consent: true,
    });
    if (["pending_claim", "duplicate"].includes(status)) {
      await expect(submitResult).resolves.toMatchObject({ status });
    } else {
      await expect(submitResult).rejects.toMatchObject({ status: 502 });
    }

    // O resultado do pedido não é uma autorização de comércio nem uma
    // atualização de ownership do registro público.
    expect(entity).toEqual(original);
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity, entityType);
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
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


describe("W2 — falhas de transporte e estados legados não liberam comércio", () => {
  const claimService = claimServiceForFixtures;
  const appApiClient = require("../../services/AppApiClient").default;
  const request = {
    entityType: "event",
    entityId: "91",
    name: "Responsável",
    email: "contato@example.org",
    consent: true,
  };

  beforeEach(() => { jest.clearAllMocks(); });

  test.each(["ECONNABORTED", "ERR_NETWORK", "ERR_CANCELED", "ETIMEDOUT"])(
    "falha de transporte %s no POST não é repetida nem convertida em aprovação",
    async (code) => {
      const failure = Object.assign(new Error("Conexão interrompida"), { code });
      appApiClient.post.mockRejectedValueOnce(failure);
      await expect(claimService.submit(request)).rejects.toMatchObject({ status: expect.any(Number) });
      expect(appApiClient.post).toHaveBeenCalledTimes(1);
      expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
      expect(canShowListingCommerce(curated())).toBe(false);
    }
  );

  test("falha de rede ao consultar pedidos não cria status de titularidade", async () => {
    const failure = Object.assign(new Error("Sem conexão"), { code: "ERR_NETWORK" });
    appApiClient.get.mockRejectedValueOnce(failure);
    await expect(claimService.mine()).rejects.toBe(failure);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).not.toHaveBeenCalled();
    expect(canShowListingCommerce(curated({ ownership_status: "pending_claim" }))).toBe(false);
  });

  test("consulta com envelope vazio não é interpretada como reivindicação aprovada", async () => {
    appApiClient.get.mockResolvedValueOnce({ data: {} });
    await expect(claimService.mine()).resolves.toBeUndefined();
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).not.toHaveBeenCalled();
    expect(canShowListingCommerce(curated())).toBe(false);
  });

  test.each(["UNCLAIMED", "PENDING_CLAIM"])(
    "ownership_status %s em caixa alta continua exibindo aviso e bloqueando venda",
    (ownership_status) => {
      const entity = curated({ ownership_status, can_sell: true });
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);
      const html = render(entity);
      expect(html).toContain("responsável não verificado");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
    }
  );
});


describe("W2 — contrato de privacidade e seleção persistida de curadoria", () => {
  const claimService = claimServiceForFixtures;
  const appApiClient = require("../../services/AppApiClient").default;

  beforeEach(() => { jest.clearAllMocks(); });

  test("normaliza dados de contato sem encaminhar identidade, tenant ou privilégios forjados", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { status: "pending_claim" } });
    const response = await claimService.submit({
      entityType: "production", entityId: "00091",
      name: "  Produtora Exemplo  ", email: "  contato@example.org  ",
      phone: "  +55 62 99999-9999  ", message: "  Sou responsável  ",
      consent: true, app_id: "999", user_id: "1", ownership_status: "verified",
      can_sell: true, is_root: true,
    });
    expect(response).toEqual({ status: "pending_claim" });
    expect(appApiClient.post).toHaveBeenCalledWith("/independence/claims", {
      entity_type: "production", entity_id: "91", name: "Produtora Exemplo",
      email: "contato@example.org", phone: "+55 62 99999-9999",
      message: "Sou responsável", consent: true,
    });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });

  test("campos opcionais vazios não carregam dados residuais de outra reivindicação", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { status: "pending" } });
    await claimService.submit({
      entityType: "artist", entityId: 15, name: "Artista", email: "artista@example.org",
      phone: "   ", message: "   ", consent: true,
    });
    expect(appApiClient.post).toHaveBeenCalledWith("/independence/claims", {
      entity_type: "artist", entity_id: "15", name: "Artista",
      email: "artista@example.org", phone: null, message: null, consent: true,
    });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });

  test("erro de validação do servidor conserva detalhes sem repetir solicitação", async () => {
    const failure = Object.assign(new Error("Dados inválidos"), {
      response: { status: 422, data: { errors: { email: ["E-mail inválido"] } } },
    });
    appApiClient.post.mockRejectedValueOnce(failure);
    await expect(claimService.submit({
      entityType: "event", entityId: 91, name: "Pessoa", email: "inválido", consent: true,
    })).rejects.toMatchObject({ status: 422 });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
  });

  test.each(["event", "production", "artist"])(
    "%s permanece sem CTA com seleção de ingresso restaurada de armazenamento local",
    (entityType) => {
      const entity = curated({
        can_sell: true, checkout_url: "/checkout/91", cart_id: "carrinho-antigo",
        selected_tickets: [{ ticket_id: 77, quantity: 2, checkout_url: "/checkout/91" }],
        tickets: [{ id: 77, price: 70, informational_only: true,
          curatorial_information_only: true, sales_enabled: false }],
      });
      expect(canShowListingCommerce(entity)).toBe(false);
      const html = render(entity, entityType);
      expect(html).toContain("responsável não verificado");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
      expect(html).not.toContain("/checkout/91");
      expect(html).not.toContain("carrinho-antigo");
    }
  );

  test.each(["unknown", "ticket"])(
    "tipo de entidade %s não cria formulário público de reivindicação",
    (entityType) => {
      expect(render(curated(), entityType)).toBe("");
    }
  );
});


describe("W2 — isolamento de dados e payloads de reivindicação adversariais", () => {
  const claimService = claimServiceForFixtures;
  const appApiClient = require("../../services/AppApiClient").default;

  beforeEach(() => {
    jest.clearAllMocks();
    appApiClient.post.mockResolvedValue({ data: { status: "pending_claim" } });
  });

  test("campos injetados via JSON não contaminam protótipos nem o POST", async () => {
    const injection = JSON.parse('{"__proto__":{"is_root":true,"can_sell":true},"constructor":{"prototype":{"admin":true}},"permissions":["*"],"app_id":"999"}');
    const request = {
      ...injection,
      entityType: "event",
      entityId: "00091",
      name: "Responsável",
      email: "contato@example.org",
      consent: true,
    };
    await expect(claimService.submit(request)).resolves.toMatchObject({ status: "pending_claim" });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    const [, payload] = appApiClient.post.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      "consent", "email", "entity_id", "entity_type", "message", "name", "phone",
    ]);
    expect(payload.entity_id).toBe("91");
    expect(payload).not.toHaveProperty("__proto__.is_root");
    expect(payload).not.toHaveProperty("constructor.prototype.admin");
    expect(payload).not.toHaveProperty("permissions");
    expect(payload).not.toHaveProperty("app_id");
    expect({}.is_root).toBeUndefined();
    expect({}.admin).toBeUndefined();
  });

  test("requisições sequenciais de contas diferentes não reaproveitam dados privados", async () => {
    const base = { entityType: "production", entityId: "41", consent: true };
    await claimService.submit({
      ...base, name: "Primeira Pessoa", email: "primeira@example.org",
      phone: "62999999999", message: "Documento particular",
    });
    await claimService.submit({
      ...base, entityType: "artist", entityId: "42",
      name: "Segunda Pessoa", email: "segunda@example.org",
      phone: "", message: "", consent: true,
    });

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    const [first, second] = appApiClient.post.mock.calls.map(([, payload]) => payload);
    expect(first).toEqual({
      entity_type: "production", entity_id: "41", name: "Primeira Pessoa",
      email: "primeira@example.org", phone: "62999999999",
      message: "Documento particular", consent: true,
    });
    expect(second).toEqual({
      entity_type: "artist", entity_id: "42", name: "Segunda Pessoa",
      email: "segunda@example.org", phone: null, message: null, consent: true,
    });
    expect(JSON.stringify(second)).not.toMatch(/primeira@example.org|Documento particular|62999999999/);
  });

  test.each(["event", "production", "artist"])(
    "%s não expõe metadados internos nem dados financeiros de ficha não reivindicada",
    (entityType) => {
      const entity = curated({
        internal_notes: "ANOTACAO_INTERNA_SIGILOSA",
        access_token: "TOKEN_INTERNO_SIGILOSO",
        payment_intent: "PAGAMENTO_INTERNO_SIGILOSO",
        bank_account: "CONTA_INTERNA_SIGILOSA",
        tickets: [{
          id: 77, price: 90, sales_enabled: true, can_sell: true,
          checkout_url: "/checkout/interno/77",
          curatorial_information_only: true,
        }],
      });
      const html = render(entity, entityType);
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(html).toContain("responsável não verificado");
      expect(html).not.toMatch(/ANOTACAO_INTERNA_SIGILOSA|TOKEN_INTERNO_SIGILOSO|PAGAMENTO_INTERNO_SIGILOSO|CONTA_INTERNA_SIGILOSA/);
      expect(html).not.toContain("/checkout/interno/77");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho/i);
    }
  );
});

describe("W2 — aliases de hosts locais não viram fonte pública", () => {
  test.each([
    ["IPv4 abreviado de três partes", "https://127.0.1/agenda"],
    ["IPv4 octal", "https://0177.0.0.1/agenda"],
    ["IPv4 hexadecimal misto", "https://0x7f.1/agenda"],
    ["localhost com porta HTTPS padrão", "https://localhost:443/agenda"],
    ["subdomínio internal com ponto final", "https://sub.agenda.internal./evento"],
    ["IPv6 mapeado com IPv4 hexadecimal", "https://[::ffff:7f00:1]/agenda"],
    ["IPv4 octal com zeros à esquerda", "https://0000177.000.000.001/agenda"],
  ])("%s não expõe link nem libera CTA", (_, source_url) => {
    const entity = curated({ source_url, can_sell: true });
    expect(safeListingSourceUrl(source_url)).toBe("");
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity);
    expect(html).toContain("Referência não disponível");
    expect(html).not.toContain('href="');
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
  });

  test.each([
    ["porta HTTPS padrão", "https://agenda.example.org:443/agenda", "https://agenda.example.org/agenda"],
    ["porta HTTPS alternativa", "https://agenda.example.org:8443/agenda", "https://agenda.example.org:8443/agenda"],
    ["subdomínio público", "https://eventos.example.org/agenda", "https://eventos.example.org/agenda"],
  ])("%s mantém link externo seguro sem habilitar venda", (_, source_url, normalized) => {
    const entity = curated({ source_url });
    expect(safeListingSourceUrl(source_url)).toBe(normalized);
    const html = render(entity, "production");
    expect(html).toContain('href="' + normalized + '"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });
});

// Cobertura do percurso real de restauração, não apenas do HTML da ficha.
// P0 pendente: o helper ainda não veta sozinho tickets curatoriais informativos.
describe("W2 — recuperação de seleção persistida no catálogo comercial", () => {
  const catalog = {
    event: { id: 91 },
    tickets: [
      { id: 201, available: true, remaining: 2, remaining_per_user: 2 },
      { id: 202, available: false, remaining: 10 },
      { id: 203, expired: true, remaining: 10 },
      { id: 204, remaining: 0 },
    ],
    items: [{ id: 301, remaining: 1 }],
  };

  test("restaura apenas IDs atuais e disponíveis, limitando estoque e quantidade por pessoa", () => {
    const restored = reconcileStoredSelection(catalog, {
      eventId: 91,
      tickets: [
        { id: 201, quantity: 1000 },
        { id: 202, quantity: 1 },
        { id: 203, quantity: 1 },
        { id: 204, quantity: 1 },
        { id: 999, quantity: 1 },
      ],
      items: [{ id: 301, quantity: 50 }, { id: 999, quantity: 1 }],
    });
    expect(restored).toEqual({ "ticket:201": 2, "item:301": 1 });
    expect(resolveCheckoutQuantity(catalog.tickets[0], 1000, checkoutQuantityLimit("ticket"))).toBe(2);
  });

  test("não restaura carrinho de outro evento mesmo com os mesmos IDs de ingresso", () => {
    expect(reconcileStoredSelection(catalog, {
      eventId: 92,
      tickets: [{ id: 201, quantity: 2 }],
      items: [{ id: 301, quantity: 1 }],
    })).toEqual({});
  });

  test.each([
    ["sem catálogo comercial", { event: { id: 91 }, tickets: [], items: [] }],
    ["catálogo sem ingressos", { event: { id: 91 }, tickets: [], items: [{ id: 301, available: false }] }],
    ["ingressos indisponíveis", { event: { id: 91 }, tickets: [{ id: 201, available: false }], items: [] }],
  ])("%s descarta a seleção persistida em vez de recriar uma venda", (_, currentCatalog) => {
    expect(reconcileStoredSelection(currentCatalog, {
      eventId: 91, tickets: [{ id: 201, quantity: 3 }], items: [],
    })).toEqual({});
  });

  test("o veto da ficha curatorial permanece independente da recuperação do carrinho", () => {
    const listing = curated({ tickets: [{ id: 201, curatorial_information_only: true, price: 49.9 }] });
    expect(isUnverifiedListing(listing)).toBe(true);
    expect(canShowListingCommerce(listing)).toBe(false);
    expect(render(listing)).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });

  test.todo("P0: reconcileStoredSelection deve rejeitar ticket curatorial informativo mesmo presente no catálogo, sem depender só da UI ou API");
});

// Regressões da fronteira de recuperação: metadados persistidos são entrada não confiável.
// O catálogo atual determina disponibilidade e limites; o veto curatorial P0 permanece TODO.
describe("W2 — seleção persistida não substitui disponibilidade do catálogo atual", () => {
  const saved = (quantity = 8) => ({
    eventId: 91,
    tickets: [{
      id: 201,
      quantity,
      available: true,
      expired: false,
      remaining: 999,
      remaining_per_user: 999,
      can_sell: true,
      sales_enabled: true,
      price: 0,
    }],
    items: [],
  });

  test.each([
    ["indisponível", { available: false }],
    ["expirado", { expired: true }],
    ["estoque esgotado", { remaining: 0 }],
    ["limite por participante esgotado", { remaining_per_user: 0 }],
  ])("não reativa ingresso %s por flags comerciais forjadas no armazenamento", (_, restriction) => {
    const current = { event: { id: 91 }, tickets: [{ id: 201, ...restriction }], items: [] };
    expect(reconcileStoredSelection(current, saved())).toEqual({});
  });

  test("preço e estoque forjados no storage não ampliam limite vigente por participante", () => {
    const current = {
      event: { id: 91 },
      tickets: [{ id: 201, available: true, remaining: 3, remaining_per_user: 1, price: 49.9 }],
      items: [],
    };
    expect(reconcileStoredSelection(current, saved(999))).toEqual({ "ticket:201": 1 });
  });

  test.each([
    ["negativa", -3],
    ["zero", 0],
    ["não numérica", "quantidade livre"],
    ["nula", null],
    ["NaN", NaN],
  ])("descarta quantidade persistida %s sem criar item comercial", (_, quantity) => {
    const current = { event: { id: 91 }, tickets: [{ id: 201, available: true, remaining: 5 }], items: [] };
    expect(reconcileStoredSelection(current, saved(quantity))).toEqual({});
  });

  test("não altera catálogo nem armazenamento durante a reconciliação", () => {
    const ticket = Object.freeze({ id: 201, available: true, remaining: 2 });
    const current = Object.freeze({
      event: Object.freeze({ id: 91 }),
      tickets: Object.freeze([ticket]),
      items: Object.freeze([]),
    });
    const storedTicket = Object.freeze({ id: 201, quantity: 1 });
    const stored = Object.freeze({
      eventId: 91,
      tickets: Object.freeze([storedTicket]),
      items: Object.freeze([]),
    });
    expect(reconcileStoredSelection(current, stored)).toEqual({ "ticket:201": 1 });
    expect(ticket.remaining).toBe(2);
    expect(storedTicket.quantity).toBe(1);
  });
});


describe("W2 — recuperação comercial respeita evento atual e tipo de seleção", () => {
  const ticket = { id: 201, available: true, remaining: 150000 };
  const item = { id: 201, available: true, remaining: 80 };

  test("usa ID de evento explícito antes de fallback obsoleto", () => {
    const catalog = { event: { id: 91 }, tickets: [ticket], items: [] };
    expect(reconcileStoredSelection(catalog, {
      eventId: 92, tickets: [{ id: 201, quantity: 2 }],
    }, 92)).toEqual({});
    expect(reconcileStoredSelection(catalog, {
      eventId: 91, tickets: [{ id: 201, quantity: 2 }],
    }, 92)).toEqual({ "ticket:201": 2 });
  });

  test("fallback conhecido não restaura carrinho de outro evento quando catálogo omite evento", () => {
    const catalog = { tickets: [ticket], items: [] };
    expect(reconcileStoredSelection(catalog, {
      eventId: 92, tickets: [{ id: 201, quantity: 2 }],
    }, 91)).toEqual({});
    expect(reconcileStoredSelection(catalog, {
      eventId: "91", tickets: [{ id: 201, quantity: 2 }],
    }, 91)).toEqual({ "ticket:201": 2 });
  });

  test.each([
    ["item indisponível", false, true, { "ticket:201": 2 }],
    ["ingresso indisponível", true, false, { "item:201": 2 }],
  ])("%s não contamina outro tipo com o mesmo identificador", (_, itemAvailable, ticketAvailable, expected) => {
    const catalog = {
      event: { id: 91 },
      tickets: [{ ...ticket, available: ticketAvailable }],
      items: [{ ...item, available: itemAvailable }],
    };
    const stored = {
      eventId: 91,
      tickets: [{ id: 201, quantity: 2 }],
      items: [{ id: 201, quantity: 2 }],
    };
    expect(reconcileStoredSelection(catalog, stored)).toEqual(expected);
  });

  test("limites de quantidade de ingresso e item são aplicados independentemente", () => {
    const catalog = { event: { id: 91 }, tickets: [ticket], items: [item] };
    const restored = reconcileStoredSelection(catalog, {
      eventId: 91,
      tickets: [{ id: 201, quantity: 200000 }],
      items: [{ id: 201, quantity: 200000 }],
    });
    expect(restored).toEqual({ "ticket:201": 100000, "item:201": 50 });
    expect(checkoutQuantityLimit("ticket")).toBe(100000);
    expect(checkoutQuantityLimit("item")).toBe(50);
  });

  test("atualização de catálogo reduz ingresso e descarta item expirado sem reaproveitar estoque salvo", () => {
    const catalog = {
      event: { id: 91 },
      tickets: [{ id: 201, available: true, remaining: 3, remaining_per_user: 1 }],
      items: [{ id: 301, available: true, remaining: 40, expired: true }],
    };
    const stored = {
      eventId: 91,
      tickets: [{ id: 201, quantity: 3, remaining: 999 }],
      items: [{ id: 301, quantity: 4, expired: false }],
    };
    expect(reconcileStoredSelection(catalog, stored)).toEqual({ "ticket:201": 1 });
  });
});

// O catálogo vigente é a única fonte dos limites; valores malformados não
// podem ressuscitar uma seleção comercial salva antes da atualização.
describe("W2 — limites de catálogo bloqueiam restauração obsoleta", () => {
  const stored = {
    eventId: 91,
    tickets: [{ id: 201, quantity: 4, remaining: 999, remaining_per_user: 999 }],
    items: [],
  };

  test.each([
    ["estoque textual zerado", { remaining: "0" }],
    ["limite pessoal textual zerado", { remaining_per_user: "0" }],
    ["estoque fracionário abaixo de uma unidade", { remaining: 0.8 }],
    ["limite pessoal fracionário abaixo de uma unidade", { remaining_per_user: 0.5 }],
    ["estoque inválido", { remaining: "quantidade desconhecida" }],
    ["limite pessoal inválido", { remaining_per_user: "sem limite?" }],
    ["ingresso expirado apesar de estoque positivo", { expired: true, remaining: 9 }],
    ["ingresso explicitamente indisponível", { available: false, remaining: 9 }],
  ])("descarta ingresso com %s mesmo quando o storage declara disponibilidade", (_, restriction) => {
    const catalog = {
      event: { id: 91 },
      tickets: [{ id: 201, available: true, remaining: 9, ...restriction }],
      items: [],
    };
    expect(reconcileStoredSelection(catalog, stored)).toEqual({});
  });

  test("preserva quantidade comercial válida respeitando limites textuais atuais", () => {
    const catalog = {
      event: { id: 91 },
      tickets: [{ id: 201, available: true, remaining: "8", remaining_per_user: "2" }],
      items: [],
    };
    expect(reconcileStoredSelection(catalog, stored)).toEqual({ "ticket:201": 2 });
  });

  test("mantém apenas o ingresso válido quando o mesmo storage contém outro esgotado", () => {
    const catalog = {
      event: { id: 91 },
      tickets: [
        { id: 201, available: true, remaining: 3 },
        { id: 202, available: true, remaining: 0 },
      ],
      items: [],
    };
    expect(reconcileStoredSelection(catalog, {
      eventId: 91,
      tickets: [{ id: 201, quantity: 2 }, { id: 202, quantity: 2 }],
      items: [],
    })).toEqual({ "ticket:201": 2 });
  });
});


// IDs de eventos são dados de escopo: o carrinho persistido nunca pode
// atravessar um evento diferente. O bug de precisão entre IDs adjacentes
// acima de MAX_SAFE_INTEGER permanece explicitamente pendente no helper.
describe("W2 — restauração de carrinho com IDs decimais grandes e armazenamento legado", () => {
  const ticket = { id: "201", available: true, remaining: 2, remaining_per_user: 2 };
  const catalog = (eventId) => ({ event: { id: eventId }, tickets: [ticket], items: [] });
  const saved = (eventId, tickets = [{ id: "201", quantity: 2 }]) => ({
    eventId, tickets, items: [],
  });

  test("restaura a seleção legítima quando o ID decimal de 64 bits é idêntico", () => {
    const id = "9223372036854775807";
    expect(reconcileStoredSelection(catalog(id), saved(id))).toEqual({ "ticket:201": 2 });
  });

  test.each([
    ["9007199254740992", "9007199254740994"],
    ["9007199254740994", "9007199254740996"],
  ])("não restaura evento %s a partir do carrinho de %s", (currentId, storedId) => {
    expect(reconcileStoredSelection(catalog(currentId), saved(storedId))).toEqual({});
  });

  test.each([null, undefined, "", "Infinity", "NaN", "evento-inexistente"])(
    "ID de evento salvo inválido %p não ressuscita compra do evento 91",
    (storedId) => {
      expect(reconcileStoredSelection(catalog(91), saved(storedId))).toEqual({});
    }
  );

  test("linhas nulas ou sem ID no storage não impedem recuperar ingresso atual válido", () => {
    const restored = reconcileStoredSelection(catalog(91), saved(91, [
      null, {}, { id: "999", quantity: 3 }, { id: "201", quantity: 1 },
    ]));
    expect(restored).toEqual({ "ticket:201": 1 });
  });

  test("linhas duplicadas não somam quantidades para superar estoque atual", () => {
    const restored = reconcileStoredSelection(catalog(91), saved(91, [
      { id: "201", quantity: 2 }, { id: "201", quantity: 999 },
    ]));
    expect(restored).toEqual({ "ticket:201": 2 });
  });

  test.todo("P0: IDs de evento adjacentes acima de MAX_SAFE_INTEGER não podem colidir por conversão Number na recuperação do carrinho");
});


// IDs de tickets e itens podem ser decimais de 64 bits. A recuperacao usa
// correspondencia textual exata por tipo; nao deve arredondar identificadores.
describe("W2 — restauracao de ingressos e itens com IDs decimais de 64 bits", () => {
  const bigId = "9223372036854775807";
  const adjacentId = "9223372036854775806";
  const catalog = (tickets = [], items = []) => ({
    event: { id: 91 },
    tickets,
    items,
  });
  const saved = (tickets = [], items = []) => ({
    eventId: 91,
    tickets,
    items,
  });

  test("restaura somente o ingresso de ID exato, sem colidir com o adjacente", () => {
    const current = catalog([{ id: bigId, available: true, remaining: 3 }]);
    expect(reconcileStoredSelection(current, saved([
      { id: adjacentId, quantity: 2 },
      { id: bigId, quantity: 2 },
    ]))).toEqual({ [`ticket:${bigId}`]: 2 });
  });

  test("nao restaura ingresso adjacente ausente do catalogo", () => {
    const current = catalog([{ id: bigId, available: true, remaining: 3 }]);
    expect(reconcileStoredSelection(current, saved([
      { id: adjacentId, quantity: 2 },
    ]))).toEqual({});
  });

  test("restaura item com ID decimal grande sem confundir com ingresso homonimo", () => {
    const current = catalog(
      [{ id: bigId, available: true, remaining: 2 }],
      [{ id: bigId, available: true, remaining: 4 }],
    );
    expect(reconcileStoredSelection(current, saved([], [
      { id: bigId, quantity: 3 },
    ]))).toEqual({ [`item:${bigId}`]: 3 });
  });

  test("mantem selecoes de ticket e item separadas quando ambos usam o mesmo ID", () => {
    const current = catalog(
      [{ id: bigId, available: true, remaining: 2 }],
      [{ id: bigId, available: true, remaining: 4 }],
    );
    expect(reconcileStoredSelection(current, saved(
      [{ id: bigId, quantity: 1 }],
      [{ id: bigId, quantity: 3 }],
    ))).toEqual({ [`ticket:${bigId}`]: 1, [`item:${bigId}`]: 3 });
  });

  test("ID numerico legado seguro continua compativel com string no storage", () => {
    const current = catalog([{ id: 201, available: true, remaining: 2 }]);
    expect(reconcileStoredSelection(current, saved([
      { id: "201", quantity: 1 },
    ]))).toEqual({ "ticket:201": 1 });
  });

  test("nao aceita numero impreciso como substituto de ID decimal de 64 bits", () => {
    const current = catalog([{ id: bigId, available: true, remaining: 2 }]);
    expect(reconcileStoredSelection(current, saved([
      { id: Number(bigId), quantity: 1 },
    ]))).toEqual({});
  });
});

// Contratos P0 prontos para ativação após o handoff do checkout.
// Os cenários vulneráveis ficam SKIP (nunca PASS) até a correção de runtime.
// Controles legítimos permanecem ativos para evitar regressão de vendas.
describe("W2 — contratos pendentes e controles de recuperação comercial", () => {
  const catalog = (eventId, tickets) => ({
    event: { id: eventId },
    tickets,
    items: [],
  });
  const stored = (eventId, ids) => ({
    eventId,
    tickets: ids.map((id) => ({ id, quantity: 1 })),
    items: [],
  });

  test.skip.each([
    ["curatorial_information_only", { curatorial_information_only: true }],
    ["informational_only", { informational_only: true }],
    ["sales_enabled false", { sales_enabled: false }],
  ])("P0 pendente: %s não deve restaurar ingresso informativo", (_, flags) => {
    const current = catalog(91, [
      { id: 201, available: true, remaining: 2, ...flags },
      { id: 202, available: true, remaining: 2, sales_enabled: true },
    ]);
    const observed = reconcileStoredSelection(current, stored(91, [201, 202]));
    expect(observed).toEqual({ "ticket:202": 1 });
    expect(canShowListingCommerce(curated({ tickets: current.tickets }))).toBe(false);
  });

  test.skip.each([
    ["9007199254740992", "9007199254740993"],
    ["9223372036854775806", "9223372036854775807"],
  ])("P0 pendente: evento %s não pode restaurar storage de %s", (currentId, savedId) => {
    const current = catalog(currentId, [{ id: 201, available: true, remaining: 2 }]);
    const observed = reconcileStoredSelection(current, stored(savedId, [201]));
    expect(currentId).not.toBe(savedId);
    expect(observed).toEqual({});
  });

  test("controle: ingresso comercial válido do mesmo evento continua recuperável", () => {
    const current = catalog("9007199254740992", [
      { id: 202, available: true, remaining: 2, sales_enabled: true },
    ]);
    expect(reconcileStoredSelection(current, stored("9007199254740992", [202])))
      .toEqual({ "ticket:202": 1 });
  });

  test("controle: IDs decimais distintos sem colisão numérica não cruzam evento", () => {
    const current = catalog("9007199254740992", [
      { id: 202, available: true, remaining: 2, sales_enabled: true },
    ]);
    expect(reconcileStoredSelection(current, stored("9007199254740994", [202])))
      .toEqual({});
  });
});


// Regressões do funil de ofertas adicionais: o catálogo vigente determina
// disponibilidade, limite e ordenação. A oferta informativa curatorial ainda
// depende de correção do helper e da autorização definitiva na API.
describe("W2 — ofertas adicionais respeitam catálogo e exclusões comerciais", () => {
  const addOn = (id, price, extra = {}) => ({ id, price, available: true, remaining: 5, ...extra });

  test.each([
    ["indisponível", { available: false }],
    ["expirado", { expired: true }],
    ["sem estoque", { remaining: 0 }],
    ["limite individual esgotado", { remaining_per_user: 0 }],
  ])("%s não aparece na recomendação de itens", (_, restriction) => {
    const blocked = addOn(301, 40, restriction);
    const allowed = addOn(302, 20);
    expect(rankCheckoutAddOns([blocked, allowed], new Set(), 3).map((item) => item.id))
      .toEqual([302]);
  });

  test("item já selecionado não é recomendado novamente", () => {
    expect(rankCheckoutAddOns([addOn(301, 20), addOn(302, 30)], new Set([301]), 3)
      .map((item) => item.id)).toEqual([302]);
  });

  test("prioridades explícitas precedem a escada de preços", () => {
    const items = [
      addOn(301, 30, { checkout_priority: 2 }),
      addOn(302, 10),
      addOn(303, 40, { checkout_priority: 1 }),
    ];
    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id))
      .toEqual([303, 301, 302]);
  });

  test("escada de preços apresenta extremos sem duplicar oferta", () => {
    const items = [addOn(301, 30), addOn(302, 10), addOn(303, 40), addOn(304, 20)];
    expect(rankCheckoutAddOns(items, new Set(), 2).map((item) => item.id))
      .toEqual([302, 303]);
  });

  test("limite zero, preço não positivo e ID ausente não geram oferta", () => {
    const items = [addOn(301, 20), addOn(302, 0), addOn(303, -10), addOn(null, 30)];
    expect(rankCheckoutAddOns(items, new Set(), 0)).toEqual([]);
    expect(rankCheckoutAddOns(items.slice(1), new Set(), 3)).toEqual([]);
  });

  test("recomendar itens não modifica catálogo imutável", () => {
    const items = Object.freeze([
      Object.freeze(addOn(301, 30)),
      Object.freeze(addOn(302, 10)),
    ]);
    expect(rankCheckoutAddOns(items, new Set(), 1).map((item) => item.id)).toEqual([302]);
    expect(items.map((item) => item.id)).toEqual([301, 302]);
  });

  test.skip("P0 pendente: item curatorial informativo não pode ser recomendado como compra", () => {
    const items = [
      addOn(301, 50, { curatorial_information_only: true, sales_enabled: false }),
      addOn(302, 20, { sales_enabled: true }),
    ];
    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id))
      .toEqual([302]);
  });
});


// Telemetria de ofertas adicionais: valores legítimos devem permanecer
// consistentes para análise de conversão, sem alterar os itens do catálogo.
// A autorização de compra e o veto curatorial continuam exclusivos da API.
describe("W2 — métricas de ofertas comerciais preservam precisão e catálogo", () => {
  test("catálogo vazio produz métricas zeradas sem IDs residuais", () => {
    expect(summarizeCheckoutAddOnOffer([])).toEqual({
      offered_items: 0,
      offered_item_ids: "",
      offered_item_prices: "",
      offered_value: 0,
      min_addon_price: 0,
    });
  });

  test("somente ofertas com ID e preço positivo entram na métrica", () => {
    const items = [
      { id: 301, price: "10.25" },
      { id: 302, price: 20.75 },
      { id: 303, price: 0 },
      { id: 304, price: -9 },
      { id: null, price: 90 },
    ];
    expect(summarizeCheckoutAddOnOffer(items)).toEqual({
      offered_items: 2,
      offered_item_ids: "301,302",
      offered_item_prices: "10.25,20.75",
      offered_value: 31,
      min_addon_price: 10.25,
    });
  });

  test("centavos em preços legítimos não geram resíduo binário na soma", () => {
    const metrics = summarizeCheckoutAddOnOffer([
      { id: 301, price: 0.1 },
      { id: 302, price: 0.2 },
    ]);
    expect(metrics.offered_item_prices).toBe("0.10,0.20");
    expect(metrics.offered_value).toBe(0.3);
    expect(metrics.min_addon_price).toBe(0.1);
  });

  test("cálculo de métricas não modifica o catálogo congelado", () => {
    const items = Object.freeze([
      Object.freeze({ id: 301, price: 12.5 }),
      Object.freeze({ id: 302, price: 17.5 }),
    ]);
    expect(summarizeCheckoutAddOnOffer(items).offered_value).toBe(30);
    expect(items.map((item) => item.price)).toEqual([12.5, 17.5]);
  });

  test("empate de prioridade mantém a ordem estável do catálogo", () => {
    const items = [
      { id: 301, price: 50, available: true, checkout_priority: 1 },
      { id: 302, price: 10, available: true, checkout_priority: 1 },
      { id: 303, price: 20, available: true, checkout_priority: 2 },
    ];
    expect(rankCheckoutAddOns(items, new Set(), 2).map((item) => item.id))
      .toEqual([301, 302]);
  });

  test("limite menor que as prioridades nunca amplia a quantidade recomendada", () => {
    const items = [
      { id: 301, price: 10, available: true, checkout_priority: 1 },
      { id: 302, price: 20, available: true, checkout_priority: 2 },
      { id: 303, price: 30, available: true, checkout_priority: 3 },
    ];
    expect(rankCheckoutAddOns(items, new Set(), 1).map((item) => item.id))
      .toEqual([301]);
  });
});

// Regressões do catálogo de adicionais: o ranqueamento usa limites atuais,
// respeita exclusões e preserva a ordem determinística de ofertas legítimas.
// O veto curatorial P0 continua pendente e NÃO é coberto por estes controles.
describe("W2 — catálogo de adicionais preserva limites e prioridade determinística", () => {
  const item = (id, price, extra = {}) => ({
    id, price, available: true, remaining: 5, ...extra,
  });

  test("prioridade zero explícita prevalece sobre priority e sort_order", () => {
    const items = [
      item(301, 15, { checkout_priority: 0, priority: 99, sort_order: 99 }),
      item(302, 10, { priority: 1, sort_order: 98 }),
      item(303, 20, { sort_order: "2" }),
      item(304, 5),
    ];
    expect(rankCheckoutAddOns(items, new Set(), 3).map(({ id }) => id))
      .toEqual([301, 302, 303]);
  });

  test("escada de preços distribui três recomendações entre sete ofertas", () => {
    const items = [70, 10, 50, 30, 60, 20, 40]
      .map((price, index) => item(301 + index, price));
    expect(rankCheckoutAddOns(items, new Set(), 3).map(({ price }) => price))
      .toEqual([10, 40, 70]);
  });

  test("estoque quantity substitui remaining ausente e bloqueia quantidade zero", () => {
    const items = [
      item(301, 10, { remaining: null, quantity: 0 }),
      item(302, 20, { remaining: null, quantity: 2 }),
    ];
    expect(rankCheckoutAddOns(items, new Set(), 3).map(({ id }) => id))
      .toEqual([302]);
  });

  test("remaining explícito zerado não é reaberto por quantity antigo", () => {
    const items = [
      item(301, 10, { remaining: "0", quantity: 500 }),
      item(302, 20, { remaining: 3, quantity: 0 }),
    ];
    expect(rankCheckoutAddOns(items, new Set(), 3).map(({ id }) => id))
      .toEqual([302]);
  });

  test("identificadores de itens já selecionados são excluídos mesmo se textuais", () => {
    const items = [item("301", 10), item("302", 20), item("303", 30)];
    expect(rankCheckoutAddOns(items, new Set([301, 303]), 3).map(({ id }) => id))
      .toEqual(["302"]);
  });

  test.each([0, -2, NaN, "inválido"])(
    "limite %p não cria recomendação adicional",
    (limit) => {
      expect(rankCheckoutAddOns([item(301, 10)], new Set(), limit)).toEqual([]);
    }
  );
});


// O checkout não pode transformar quantidades inválidas em unidades vendáveis.
// Estes contratos testam o helper atual, sem autorizar vendas curatoriais na API.
describe("W2 — quantidades comerciais respeitam limites inteiros", () => {
  const ingresso = { id: 201, available: true, remaining: 8, remaining_per_user: 4 };

  test.each([NaN, Infinity, -Infinity, -2, 0, null, undefined, "invalido"])(
    "pedido %p não produz quantidade positiva", (requested) => {
      expect(resolveCheckoutQuantity(ingresso, requested, 10)).toBe(0);
    }
  );

  test.each(["NaN", "Infinity", -1, 0, "0.9"])(
    "estoque inválido ou insuficiente %p bloqueia seleção", (remaining) => {
      expect(resolveCheckoutQuantity({ ...ingresso, remaining }, 2, 10)).toBe(0);
    }
  );

  test.each(["NaN", "Infinity", -1, 0, "0.9"])(
    "limite individual inválido ou insuficiente %p bloqueia seleção", (remaining_per_user) => {
      expect(resolveCheckoutQuantity({ ...ingresso, remaining_per_user }, 2, 10)).toBe(0);
    }
  );

  test("pedido, estoque e limite fracionários são truncados antes da escolha", () => {
    const item = { available: true, remaining: "3.9", remaining_per_user: "2.9" };
    expect(resolveCheckoutQuantity(item, "8.8", 5.9)).toBe(2);
    expect(resolveCheckoutQuantity(item, "1.9", 5.9)).toBe(1);
  });

  test("limite comercial vigente prevalece sobre estoque e pedido elevados", () => {
    expect(resolveCheckoutQuantity({ available: true, remaining: 1000 }, 999, 3)).toBe(3);
    expect(resolveCheckoutQuantity({ available: true, remaining: 1000 }, 999, 0)).toBe(0);
  });

  test("estoque zero explícito não é reaberto por quantity legado", () => {
    expect(resolveCheckoutQuantity({ available: true, remaining: "0", quantity: 200 }, 3, 10))
      .toBe(0);
  });

  test("helper não modifica objeto de catálogo congelado", () => {
    const item = Object.freeze({ available: true, remaining: 3, remaining_per_user: 2 });
    expect(resolveCheckoutQuantity(item, 10, 10)).toBe(2);
    expect(item.remaining).toBe(3);
    expect(item.remaining_per_user).toBe(2);
  });
});


// W2 — respostas HTTP incompletas não concedem titularidade ou comércio.
// O status devolvido pelo endpoint é informativo: somente o estado atual
// da ficha e a autorização da API podem liberar operações comerciais.
describe("W2 — resposta parcial de reivindicação permanece não autorizativa", () => {
  const claimService = claimServiceForFixtures;
  const appApiClient = require("../../services/AppApiClient").default;
  const request = {
    entityType: "event", entityId: "91",
    name: "Responsável", email: "contato@example.org", consent: true,
  };

  beforeEach(() => { jest.clearAllMocks(); });

  test.each([
    ["HTTP 204 sem corpo", undefined],
    ["resposta nula", null],
    ["objeto vazio", {}],
    ["somente mensagem", { message: "Solicitação recebida" }],
    ["status desconhecido", { status: "queued_external_review" }],
  ])("%s não produz aprovação presumida ou CTA comercial", async (_, data) => {
    appApiClient.post.mockResolvedValueOnce({ data });
    await expect(claimService.submit(request)).rejects.toMatchObject({ status: 502 });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
    expect(claimStatusMessage(data?.status)).toContain("verificará sua identidade");
    const listing = curated({ ownership_status: "pending_claim", can_sell: true });
    expect(isUnverifiedListing(listing)).toBe(true);
    expect(canShowListingCommerce(listing)).toBe(false);
    expect(render(listing)).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
  });
});


// Respostas inesperadas ou malformadas da API não constituem comprovação de
// titularidade. O estado público da ficha continua sendo a única fonte da UI;
// o servidor é a autoridade para qualquer operação comercial.
describe("W2 — respostas HTTP sem contrato de titularidade não liberam CTA", () => {
  const claimService = claimServiceForFixtures;
  const appApiClient = require("../../services/AppApiClient").default;
  const request = {
    entityType: "event", entityId: "9007199254740993",
    name: "Responsável", email: "responsavel@example.org", consent: true,
  };

  beforeEach(() => { jest.clearAllMocks(); });

  test.each([
    ["texto de aprovação", "approved"],
    ["booleano de sucesso", true],
    ["código numérico", 200],
    ["array com aprovação", [{ status: "approved", can_sell: true }]],
    ["array vazio", []],
    ["resposta com flags comerciais", {
      status: "approved", can_sell: true, ownership_status: "verified",
      checkout_url: "/checkout/91", app_id: "999",
    }],
  ])("%s não modifica a ficha nem expõe compra", async (_, data) => {
    const entity = Object.freeze(curated({
      id: "9007199254740993", ownership_status: "pending_claim",
      verification_status: "pending_claim", can_sell: true,
    }));
    appApiClient.post.mockResolvedValueOnce({ data });

    await expect(claimService.submit(request)).rejects.toMatchObject({ status: 502 });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity);
    expect(html).toContain("responsável não verificado");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho/i);
    expect(html).not.toContain("/checkout/91");
  });
});


// W2 — regressão de escaping de URLs de proveniência fornecidas por terceiros.
// A curadoria publica links externos não confiáveis: a UI não pode criar
// elementos HTML a partir de parâmetros/fragmentos nem expor CTA comercial.
describe("W2 — URLs externas hostis permanecem atributos HTML inertes", () => {
  test.each([
    ["query com tentativa de script", "https://example.org/agenda?busca=\"><script>alert(1)</script>"],
    ["fragmento com tentativa de imagem", "https://example.org/agenda#\"><img src=x onerror=alert(1)>"],
  ])("%s não injeta marcação em evento ou produção", (_, source_url) => {
    const normalized = safeListingSourceUrl(source_url);
    expect(normalized).toMatch(/^https:\/\/example\.org\/agenda/);
    for (const entityType of ["event", "production"]) {
      const entity = curated({ source_url, can_sell: true });
      const html = render(entity, entityType);
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('href="https://example.org/agenda');
      expect(html).not.toMatch(/<script\b|<img\b|\sonerror=|\sonclick=/i);
      expect(html).toContain("responsável não verificado");
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
    }
  });

  test("query com múltiplos parâmetros mantém escaping e destino HTTPS", () => {
    const entity = curated({ source_url: "https://example.org/agenda?evento=91&origem=curadoria&modo=publico" });
    const html = render(entity, "artist");
    expect(html).toContain("?evento=91&amp;origem=curadoria&amp;modo=publico");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });
});


// URLs de fonte são dados externos, não endereços confiáveis do aplicativo.
// Credenciais embutidas e esquemas não HTTPS nunca podem virar link público,
// independentemente de a ficha conter flags comerciais indevidas.
describe("W2 — proveniência rejeita credenciais e protocolos não web", () => {
  test.each([
    ["URL com usuário e senha", "https://usuario:senha@example.org/agenda"],
    ["URL com usuário", "https://usuario@example.org/agenda"],
    ["credenciais apontando para localhost", "https://example.org@localhost/agenda"],
    ["protocolo data", "data:text/html,<svg/onload=alert(1)>"],
    ["protocolo blob", "blob:https://example.org/arquivo"],
    ["protocolo file", "file:///etc/passwd"],
    ["protocolo ftp", "ftp://example.org/agenda"],
    ["URL relativa ao protocolo", "//example.org/agenda"],
    ["loopback IPv6", "https://[::1]/agenda"],
  ])("%s não cria link público nem autoriza comércio", (_, source_url) => {
    expect(safeListingSourceUrl(source_url)).toBe("");
    for (const entityType of ["event", "production", "artist"]) {
      const entity = curated({ source_url, can_sell: true });
      const html = render(entity, entityType);
      expect(html).toContain("Referência não disponível");
      expect(html).not.toContain('href="');
      expect(html).not.toContain(source_url);
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
    }
  });
});


// Datas fornecidas pela curadoria são metadados de confiança, não prova de
// titularidade. Valores impossíveis ou hostis não devem simular conferência
// recente, quebrar SSR ou expor ações comerciais em páginas públicas.
describe("W2 — conferência de fonte inválida não fabrica credibilidade", () => {
  test.each([
    ["data textual arbitrária", "conferido hoje"],
    ["mês inexistente", "2026-13-01T12:00:00Z"],
    ["dia inexistente", "2026-10-32T12:00:00Z"],
    ["hora inexistente", "2026-10-20T25:00:00Z"],
    ["minuto inexistente", "2026-10-20T12:61:00Z"],
    ["fuso inexistente", "2026-10-20T12:00:00+99:00"],
    ["HTML hostil", '<img src=x onerror="alert(1)">'],
    ["script hostil", '<script>alert("aprovado")</script>'],
  ])("%s mantém a data como não informada em todas as fichas", (_, last_verified_at) => {
    for (const entityType of ["event", "production", "artist"]) {
      const entity = curated({ last_verified_at, can_sell: true });
      const html = render(entity, entityType);
      expect(html).toContain("Última conferência");
      expect(html).toContain("Não informada");
      expect(html).not.toMatch(/Invalid Date|<script\\b|<img\\b|\\sonerror=/i);
      expect(html).toContain("responsável não verificado");
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
    }
  });

  test("timestamp ISO legítimo continua visível, mas não concede venda", () => {
    const entity = curated({ last_verified_at: "2026-10-20T12:00:00Z", can_sell: true });
    const html = render(entity, "event");
    expect(html).toContain("Última conferência");
    expect(html).not.toContain("Não informada");
    expect(html).toContain("Consultar publicação original");
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora/i);
  });
});


// O aviso curatorial precisa ser perceptível por tecnologias assistivas.
// A reivindicação exige uma ação explícita; não é navegação comercial.
describe("W2 — semântica acessível do aviso de titularidade não verificada", () => {
  test.each(["event", "production", "artist"])(
    "%s expõe região identificada, origem e ação de reivindicação sem checkout",
    (entityType) => {
      const html = render(curated({
        source_url: "https://example.org/agenda?evento=91&origem=publica",
        last_verified_at: "2026-10-20T12:00:00Z",
      }), entityType);
      expect(html).toContain('<aside class="cut-unverified" aria-label="Informações sobre a titularidade deste cadastro">');
      expect(html).toContain("Informações públicas — responsável não verificado");
      expect(html).toContain("<dl");
      expect(html).toContain("<dt>Fonte</dt>");
      expect(html).toContain("<dt>Última conferência</dt>");
      expect(html).toContain('target="_blank" rel="noopener noreferrer"');
      expect(html).toContain('type="button">Reivindicar esta página — criar conta</button>');
      expect(html).not.toContain("<form");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora|Emitir QR/i);
    }
  );
});

// A API pode devolver estados com capitalização diferente; o aviso público e
// o bloqueio visual precisam concordar para as três entidades curatoriais.
describe("W2 — estados de reivindicação com capitalização variável", () => {
  test.each([
    ["UNCLAIMED", "event"],
    ["UnClaimed", "production"],
    ["unclaimed", "artist"],
    ["PENDING_CLAIM", "event"],
    ["Pending_Claim", "production"],
    ["pending_claim", "artist"],
  ])("%s em %s mantém aviso público e não cria checkout", (ownership_status, entityType) => {
    const entity = curated({
      ownership_status,
      can_sell: true,
      checkout_url: "/checkout/91",
      tickets: [{ id: 91, price: 49.9, sales_enabled: true }],
    });
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    const html = render(entity, entityType);
    expect(html).toContain("Informações públicas — responsável não verificado");
    expect(html).toContain("Reivindicar esta página");
    expect(html).not.toContain("/checkout/91");
    expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora|Emitir QR/i);
  });

  test.each(["revoked", "under_review", "suspended", "APPROVED"])(
    "estado não reconhecido %s não concede CTA comercial nem reivindicação presumida",
    (ownership_status) => {
      const entity = curated({ ownership_status, can_sell: true });
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);
      const html = render(entity, "event");
      expect(html).toContain("Informações públicas — responsável não verificado");
      expect(html).not.toContain("Reivindicar esta página");
      expect(html).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho|Pagar agora|Emitir QR/i);
    }
  );
});


// W2 — regressão interativa da reivindicação: o painel público não deve
// submeter dados sem consentimento nem confundir protocolo com autorização.
describe("W2 — formulário autenticado preserva consentimento e veto comercial", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  const show = async (entityType = "event") => {
    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, {
        entity: curated({ app_id: "10", id: "9007199254740993", can_sell: true }),
        entityType,
        user: { id: 77, first_name: "Pessoa", last_name: "Responsável", email: "contato@example.org" },
        onLogin: jest.fn(),
      }));
    });
  };

  const click = async (element) => {
    await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each(["event", "production", "artist"])(
    "%s só abre formulário autenticado após ação explícita", async (entityType) => {
      await show(entityType);
      expect(container.querySelector("form")).toBeNull();
      expect(container.textContent).not.toContain("contato@example.org");
      const action = container.querySelector(".cut-unverified__action");
      expect(action?.textContent).toBe("Reivindicar esta página");
      await click(action);
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      expect(form.querySelector('input[type="email"]').readOnly).toBe(true);
      expect(form.querySelector('input[type="email"]').value).toBe("contato@example.org");
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(false);
      expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
      expect(claimService.submit).not.toHaveBeenCalled();
      expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
    }
  );

  test("consentimento explícito permite somente solicitação pendente, nunca checkout", async () => {
    claimService.submit.mockResolvedValueOnce({ status: "pending_claim" });
    await show();
    await click(container.querySelector(".cut-unverified__action"));
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "event",
      entityId: "9007199254740993",
      name: "Pessoa Responsável",
      email: "contato@example.org",
      consent: true,
    }));
    expect(container.textContent).toContain("Solicitação registrada para revisão.");
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Adicionar ao carrinho/i);
  });

  test("erro HTTP 403 não simula reivindicação aceita ou libera comércio", async () => {
    claimService.submit.mockRejectedValueOnce({ response: { status: 403, data: { message: "Acesso negado" } } });
    await show("production");
    await click(container.querySelector(".cut-unverified__action"));
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("não tem autorização");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Solicitação registrada|Comprar ingresso|Finalizar compra/i);
  });

  test("envio pendente bloqueia repetição e mantém a ficha sem comércio", async () => {
    let concluir;
    claimService.submit.mockImplementationOnce(() => new Promise((resolve) => {
      concluir = resolve;
    }));
    await show("event");
    await click(container.querySelector(".cut-unverified__action"));
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(form.textContent).toContain("Enviando...");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
    await act(async () => { concluir({ status: "pending_claim" }); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Solicitação registrada");
    expect(container.querySelector("form")).toBeNull();
  });

  test("falha temporária permite nova tentativa sem aprovação presumida", async () => {
    claimService.submit
      .mockRejectedValueOnce({ response: { status: 429, data: { message: "Aguarde antes de tentar novamente" } } })
      .mockResolvedValueOnce({ status: "pending_claim" });
    await show("artist");
    await click(container.querySelector(".cut-unverified__action"));
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível enviar");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(2);
    expect(claimService.submit).toHaveBeenLastCalledWith(expect.objectContaining({
      entityType: "artist", consent: true,
    }));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Solicitação registrada");
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
  });

  // Identificadores decimais de 64 bits precisam chegar à API sem Number().
  // A submissão não representa aprovação nem concede acesso comercial.
  test.each(["production", "artist"])(
    "%s envia tipo e ID decimal exatos sem liberar comércio", async (entityType) => {
      claimService.submit.mockResolvedValueOnce({ status: "pending_claim" });
      await show(entityType);
      await click(container.querySelector(".cut-unverified__action"));
      const form = container.querySelector("form");
      await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(claimService.submit).toHaveBeenCalledTimes(1);
      expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
        entityType,
        entityId: "9007199254740993",
        consent: true,
        email: "contato@example.org",
      }));
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Solicitação registrada");
      expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
    }
  );

  test.each([
    ["rede indisponível", new Error("Network Error"), "Não foi possível enviar"],
    ["serviço indisponível", { response: { status: 503 } }, "Não foi possível enviar"],
    ["mensagem hostil da API", { response: { status: 500, data: { message: '<img src=x onerror="alert(1)">' } } }, "Não foi possível enviar"],
  ])("%s não fabrica sucesso de reivindicação nem executa HTML", async (_, failure, expected) => {
    claimService.submit.mockRejectedValueOnce(failure);
    await show("event");
    await click(container.querySelector(".cut-unverified__action"));
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(expected);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toMatch(/Solicitação registrada|Comprar ingresso|Finalizar compra|Pagar agora/i);
  });

});

// A entrada pública de reivindicação exige autenticação antes de coletar dados
// pessoais; a transição de sessão não pode enviar a solicitação automaticamente.
describe("W2 — login explícito antes da reivindicação pública", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each(["event", "production", "artist"])(
    "%s exige login e nova ação consciente antes de exibir formulário",
    async (entityType) => {
      const onLogin = jest.fn();
      const entity = curated({ app_id: "10", id: "9007199254740993", can_sell: true });
      const panel = (user) => React.createElement(UnverifiedListingPanel, {
        entity, entityType, user, onLogin,
      });

      await act(async () => { root.render(panel(null)); });
      expect(container.querySelector("form")).toBeNull();
      const loginButton = container.querySelector(".cut-unverified__action");
      expect(loginButton?.textContent).toContain("criar conta");
      await act(async () => { loginButton.click(); });
      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(claimService.submit).not.toHaveBeenCalled();
      expect(container.querySelector("form")).toBeNull();

      await act(async () => {
        root.render(panel({ id: 77, name: "Pessoa Responsável", email: "contato@example.org" }));
      });
      expect(container.querySelector("form")).toBeNull();
      expect(container.textContent).not.toContain("contato@example.org");
      expect(claimService.submit).not.toHaveBeenCalled();

      const claimButton = container.querySelector(".cut-unverified__action");
      expect(claimButton?.textContent).toBe("Reivindicar esta página");
      await act(async () => { claimButton.click(); });
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      expect(form.querySelector('input[type="email"]').value).toBe("contato@example.org");
      expect(form.querySelector('input[type="email"]').readOnly).toBe(true);
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(false);
      expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
      expect(claimService.submit).not.toHaveBeenCalled();
      expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
    }
  );
});

// A rejeição do servidor não deve converter um pedido de reivindicação em
// titularidade, nem eliminar o consentimento necessário para nova tentativa.
describe("W2 — erros HTTP de reivindicação preservam formulário sem conceder comércio", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each([
    [401, "Sessão expirada"],
    [400, "Solicitação inválida"],
    [409, "Reivindicação já existente"],
    [422, "Dados não aceitos"],
  ])("HTTP %i mantém pedido não aprovado e permite correção consciente", async (status, message) => {
    claimService.submit.mockRejectedValueOnce({ response: { status, data: { message } } });
    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, {
        entity: curated({ app_id: "10", id: "9007199254740993", can_sell: true }),
        entityType: "event",
        user: { id: 77, name: "Responsável", email: "contato@example.org" },
        onLogin: jest.fn(),
      }));
    });
    await act(async () => { container.querySelector(".cut-unverified__action").click(); });
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain(status === 401 ? "Sua sessão expirou" : "Não foi possível enviar");
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(message);
    expect(container.querySelector('[role="status"]')).toBeNull();
    if (status === 401) {
      expect(container.querySelector("form")).toBeNull();
    } else {
      expect(container.querySelector("form")).not.toBeNull();
      expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
    }
    expect(container.textContent).not.toMatch(/Solicitação registrada|Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
  });
});

// A permissão de contato deve ser explícita e revogável antes do envio.
// Estes testes não autorizam comércio: o veto financeiro pertence à API.
describe("W2 — consentimento revogável e mensagens seguras na reivindicação", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  const openForm = async (entityType = "event", name = "Responsável") => {
    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, {
        entity: curated({ app_id: "10", id: "9007199254740993", can_sell: true }),
        entityType,
        user: { id: 77, name, email: "contato@example.org" },
        onLogin: jest.fn(),
      }));
    });
    await act(async () => { container.querySelector(".cut-unverified__action").click(); });
    return container.querySelector("form");
  };

  test("revogar consentimento antes do POST bloqueia até submissão programática", async () => {
    const form = await openForm();
    const checkbox = form.querySelector('input[type="checkbox"]');
    await act(async () => { checkbox.click(); });
    expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => { checkbox.click(); });
    expect(checkbox.checked).toBe(false);
    expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
  });

  test.each(["event", "production", "artist"])(
    "%s não permite iniciar solicitação com nome composto apenas por espaços",
    async (entityType) => {
      const form = await openForm(entityType, "   ");
      await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
      expect(form.querySelector('input[autocomplete="name"]').value).toBe("   ");
      expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
      expect(claimService.submit).not.toHaveBeenCalled();
      expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora/i);
    }
  );

  test("mensagem HTML devolvida no sucesso é exibida como texto, nunca como elemento ativo", async () => {
    const hostile = '<img src=x onerror="alert(1)"> Solicitação recebida';
    claimService.submit.mockResolvedValueOnce({ status: "pending_claim", message: hostile });
    const form = await openForm("artist");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(hostile);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
  });
});

// A resposta de POST registra uma solicitação, não altera a titularidade da ficha.
// Mesmo um payload indevido de aprovação não pode transformar o painel em checkout.
describe("W2 — resposta de reivindicação não eleva a ficha a comerciante", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each([
    ["event", { status: "approved", can_sell: true, checkout_url: "/checkout/91" }],
    ["production", { status: "verified", ownership_status: "verified", can_sell: true }],
    ["artist", { status: "pending_claim", merchant_enabled: true, tickets: [{ id: 9 }] }],
  ])("%s mantém ficha informativa após resposta de POST com flags comerciais", async (entityType, response) => {
    const entity = Object.freeze(curated({ app_id: "10",
      id: "9007199254740993",
      checkout_url: "/checkout/91",
      can_sell: true,
    }));
    claimService.submit.mockResolvedValueOnce(response);
    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, {
        entity, entityType,
        user: { id: 77, name: "Responsável", email: "contato@example.org" },
        onLogin: jest.fn(),
      }));
    });
    await act(async () => { container.querySelector(".cut-unverified__action").click(); });
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
      entityType, entityId: "9007199254740993", consent: true,
    }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Solicitação registrada");
    expect(container.querySelector("form")).toBeNull();
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(container.textContent).toContain("responsável não verificado");
    expect(container.innerHTML).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho|Emitir QR|\/checkout\/91/i);
  });
});

// Cobertura de privacidade para o estado anônimo após sair da conta.
// O reset integral do estado interno e respostas assíncronas obsoletas
// continua sob ownership W03; aqui verificamos apenas o limite visível.
describe("W2 — logout oculta dados de reivindicação e exige autenticação novamente", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each(["event", "production", "artist"])(
    "%s esconde formulário, e-mail e consentimento após logout sem enviar POST",
    async (entityType) => {
      const entity = Object.freeze(curated({ app_id: "10",
        id: "9223372036854775807",
        can_sell: true,
      }));
      const onLogin = jest.fn();
      const panel = (user) => React.createElement(UnverifiedListingPanel, {
        entity, entityType, user, onLogin,
      });

      await act(async () => {
        root.render(panel({
          id: 77,
          name: "Pessoa Responsável",
          email: "contato-privado@example.org",
        }));
      });
      await act(async () => {
        container.querySelector(".cut-unverified__action").click();
      });
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      await act(async () => {
        form.querySelector('input[type="checkbox"]').click();
      });
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
      expect(form.querySelector('input[type="email"]').value)
        .toBe("contato-privado@example.org");

      await act(async () => { root.render(panel(null)); });
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(container.querySelector('input[type="email"]')).toBeNull();
      expect(container.textContent).not.toContain("contato-privado@example.org");
      expect(container.textContent).not.toContain("Pessoa Responsável");
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.querySelector(".cut-unverified__action")?.textContent)
        .toContain("criar conta");
      expect(claimService.submit).not.toHaveBeenCalled();

      await act(async () => {
        container.querySelector(".cut-unverified__action").click();
      });
      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(claimService.submit).not.toHaveBeenCalled();
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(container.textContent)
        .not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
    }
  );
});


// Limite visível enquanto o POST está pendente: logout deve retirar
// imediatamente os dados da conta e impedir uma segunda solicitação.
// A resposta tardia continua exigindo correção separada no painel W03.
describe("W2 — logout durante envio pendente oculta dados sem duplicar reivindicação", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each(["event", "production", "artist"])(
    "%s retira contato e formulário imediatamente ao sair durante POST pendente",
    async (entityType) => {
      claimService.submit.mockImplementationOnce(() => new Promise(() => {}));
      const entity = Object.freeze(curated({ app_id: "10", id: "9223372036854775807" }));
      const onLogin = jest.fn();
      const panel = (user) => React.createElement(UnverifiedListingPanel, {
        entity, entityType, user, onLogin,
      });

      await act(async () => {
        root.render(panel({
          id: 77, name: "Responsável Privado",
          email: "privado-pendente@example.org",
        }));
      });
      await act(async () => { container.querySelector(".cut-unverified__action").click(); });
      const form = container.querySelector("form");
      await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(claimService.submit).toHaveBeenCalledTimes(1);
      expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
        entityType, entityId: "9223372036854775807", consent: true,
      }));
      expect(container.textContent).toContain("Enviando...");

      await act(async () => { root.render(panel(null)); });
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector('input[type="email"]')).toBeNull();
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(container.textContent).not.toContain("privado-pendente@example.org");
      expect(container.textContent).not.toContain("Responsável Privado");
      expect(container.querySelector(".cut-unverified__action")?.textContent)
        .toContain("criar conta");
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(claimService.submit).toHaveBeenCalledTimes(1);
      expect(isUnverifiedListing(entity)).toBe(true);
      expect(canShowListingCommerce(entity)).toBe(false);
      expect(container.innerHTML).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Adicionar ao carrinho|Emitir QR/i);
    }
  );
});

// A mensagem de erro da API é dado não confiável, mesmo quando a ficha
// permanece aberta para correção. Não executar HTML nem liberar comércio.
describe("W2 — erros de reivindicação não injetam HTML no painel curatorial", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each([
    ["event", 403, '<img src=x onerror="alert(1)"> Acesso negado'],
    ["production", 422, '<svg onload="alert(1)"></svg> Dados inválidos'],
    ["artist", 500, '<a href="javascript:alert(1)">Tentar novamente</a>'],
  ])("%s apresenta erro HTTP %i como texto inerte e mantém veto comercial", async (entityType, status, hostile) => {
    const entity = Object.freeze(curated({ app_id: "10", id: "9223372036854775807", can_sell: true }));
    claimService.submit.mockRejectedValueOnce({
      response: { status, data: { message: hostile } },
    });
    const props = {
      entity,
      entityType,
      user: { id: 77, name: "Responsável", email: "contato@example.org" },
      onLogin: jest.fn(),
    };

    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, props));
    });
    await act(async () => { container.querySelector(".cut-unverified__action").click(); });
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
      entityType, entityId: "9223372036854775807", consent: true,
    }));
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain(status === 403 ? "não tem autorização" : "Não foi possível enviar");
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(hostile);
    expect(container.querySelector("img, svg, a[href^='javascript:']")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    if (status === 403) {
      expect(container.querySelector("form")).toBeNull();
    } else {
      expect(container.querySelector("form")).not.toBeNull();
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
    }
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);

    await act(async () => {
      root.render(React.createElement(UnverifiedListingPanel, props));
    });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
  });
});
// Respostas de segurança da API não podem ser confundidas com aprovação:
// 401 (sessão), 409 (duplicidade) e 413 (limite de payload) exigem
// intervenção explícita da pessoa; o React não reenvia nem libera vendas.
describe("W2 — recusas HTTP preservam titularidade pendente sem reenvio implícito", () => {
  const { act } = require("react-dom/test-utils");
  const { createRoot } = require("react-dom/client");
  const claimService = require("../../services/IndependenceClaimService").default;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test.each([
    ["event", 401, "Sessão expirada: autentique-se novamente."],
    ["production", 409, "Já existe uma solicitação em análise."],
    ["artist", 413, "Mensagem muito longa: reduza os detalhes."],
  ])("%s mantém a reivindicação sem aprovação após HTTP %i", async (entityType, status, message) => {
    const entity = Object.freeze(curated({ app_id: "10", id: "9223372036854775807", can_sell: true }));
    const props = {
      entity, entityType,
      user: { id: 81, name: "Responsável", email: "contato@example.org" },
      onLogin: jest.fn(),
    };
    claimService.submit.mockRejectedValueOnce({ response: { status, data: { message } } });

    await act(async () => { root.render(React.createElement(UnverifiedListingPanel, props)); });
    await act(async () => { container.querySelector(".cut-unverified__action").click(); });
    const form = container.querySelector("form");
    await act(async () => { form.querySelector('input[type="checkbox"]').click(); });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(claimService.submit).toHaveBeenCalledWith(expect.objectContaining({
      entityType, entityId: "9223372036854775807", consent: true,
    }));
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain(status === 401 ? "Sua sessão expirou" : "Não foi possível enviar");
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(message);
    expect(container.querySelector('[role="status"]')).toBeNull();
    if (status === 401) {
      expect(container.querySelector("form")).toBeNull();
    } else {
      expect(container.querySelector("form")).toBe(form);
      expect(form.querySelector('input[type="checkbox"]').checked).toBe(true);
      expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
    }

    await act(async () => { root.render(React.createElement(UnverifiedListingPanel, props)); });
    expect(claimService.submit).toHaveBeenCalledTimes(1);
    expect(isUnverifiedListing(entity)).toBe(true);
    expect(canShowListingCommerce(entity)).toBe(false);
    expect(container.textContent).not.toMatch(/Comprar ingresso|Finalizar compra|Pagar agora|Emitir QR/i);
  });
});
