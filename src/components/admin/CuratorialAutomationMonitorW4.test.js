import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CuratorialAutomationMonitorW4 from "./CuratorialAutomationMonitorW4";
const context = (extra = {}) => ({
  authorized: true, application_id: 7, permissions: ["operations.view"], is_owner: true, is_root: true, ...extra,
});
const apiResponse = { success: true, data: { application_id: 7, global_enabled: false,
  workers: [{ key: "discovery_health", enabled: true }],
  recent_runs: [{ id: 3, worker_key: "discovery_health", status: "succeeded",
    result: { sources: 3, stale: 0, errors: 1 }, checkout_url: "https://example.invalid", token: "SECRET" }] } };
const render = (ctx = context(), payload = apiResponse, appId = 7) => renderToStaticMarkup(
  <CuratorialAutomationMonitorW4 context={ctx} applicationId={appId} apiResponse={payload} />);
describe("W4: monitor de curadoria sem elevação ou checkout", () => {
  test.each([
    ["outra aplicação", context({ application_id: 8 })],
    ["sem permissão", context({ permissions: [] })],
    ["não autorizado", context({ authorized: false })],
  ])("nega %s mesmo com is_root inconsistente", (_name, ctx) => {
    const html = render(ctx);
    expect(html).toContain("Acesso ao monitoramento indisponível");
    expect(html).not.toContain("Últimas execuções");
  });
  test.each([
    ["outra aplicação", 8],
    ["sem identificador", undefined],
    ["identificador textual não canônico", "07"],
    ["identificador não escalar", { id: 7 }],
  ])("nega resposta %s mesmo com autorização local válida", (_name, application_id) => {
    const payload = { ...apiResponse, data: { ...apiResponse.data, application_id } };
    const html = render(context(), payload);
    expect(html).toContain("aplicação da resposta não confirmada");
    expect(html).not.toMatch(/Fontes com erro|Últimas execuções|Concluída|<table\b|<button\b|<form\b/);
  });
  test("aceita identificador canônico textual da aplicação", () => {
    const payload = { ...apiResponse, data: { ...apiResponse.data, application_id: "7" } };
    expect(render(context({ application_id: "7" }), payload, "7")).toContain("Fontes com erro");
  });
  test("troca A→B→A não reaproveita métricas da aplicação anterior", () => {
    const responseB = { ...apiResponse, data: { ...apiResponse.data, application_id: 8 } };
    expect(render(context({ application_id: 8 }), apiResponse, 8))
      .toContain("aplicação da resposta não confirmada");
    expect(render(context({ application_id: 8 }), responseB, 8))
      .toContain("Fontes com erro");
    expect(render(context({ application_id: 7 }), responseB, 7))
      .toContain("aplicação da resposta não confirmada");
    expect(render(context(), apiResponse)).toContain("Fontes com erro");
    expect(render(context({ permissions: [] }), apiResponse)).not.toContain("Últimas execuções");
  });
  test("mostra estados reais e métricas sem operações comerciais", () => {
    const html = render();
    expect(html).toContain("Administrador da aplicação");
    expect(html).toContain("global desativada");
    expect(html).toContain("Fontes com erro");
    expect(html).toContain("Últimas execuções");
    expect(html).not.toMatch(/root global|superusuário|<a |<button|<form|href=|example\.invalid|SECRET/i);
  });
  test("resposta inválida não apresenta números inventados", () => {
    const html = render(context(), { success: false, data: apiResponse.data });
    expect(html).toContain("Nenhuma contagem foi presumida");
    expect(html).not.toContain("Últimas execuções");
  });
  test("oculta tabela e último sucesso quando histórico ou configuração estão inconsistentes", () => {
    const invalidRun = { ...apiResponse.data.recent_runs[0], id: 100,
      status: "processing", result: { sources: 999 } };
    const html = render(context(), { success: true, data: {
      ...apiResponse.data, recent_runs: [apiResponse.data.recent_runs[0], invalidRun],
    } });
    expect(html).toContain("Última execução indeterminada");
    expect(html).toContain("Execuções ocultadas");
    expect(html).not.toMatch(/<table\b|Concluída|999|<a\b|<button\b|<form\b/i);

    const duplicated = render(context(), { success: true, data: {
      ...apiResponse.data, workers: [
        { key: "discovery_health", enabled: true },
        { key: "discovery_health", enabled: false },
      ],
    } });
    expect(duplicated).toContain("Última execução indeterminada");
    expect(duplicated).not.toContain("<table");
  });

  test("janela cheia não afirma ausência de execução de outro worker", () => {
    const runs = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, worker_key: "discovery_quality", status: "queued",
    }));
    const html = render(context(), { success: true, data: {
      ...apiResponse.data,
      workers: [
        { key: "discovery_health", enabled: true },
        { key: "discovery_quality", enabled: true },
      ],
      recent_runs: runs,
    } });
    expect(html).toContain("Histórico incompleto");
    expect(html).toContain("Sem execução na janela retornada");
    expect(html).not.toContain("Sem execução registrada");
    expect(html).not.toMatch(/<button\b|<form\b|checkout_url/i);
  });

  test("não interpola erros brutos ou dados privados", () => {
    const html = render(context(), { success: true, data: { ...apiResponse.data,
      recent_runs: [{ ...apiResponse.data.recent_runs[0], last_error: "<script>roubar()</script>", token: "SECRET" }] } });
    expect(html).not.toMatch(/<script|roubar\(\)|SECRET/);
  });
  test.each([320, 360, 390, 430])(
    "estrutura responsiva segura para largura-alvo %ipx (smoke estrutural, sem navegador)", (width) => {
      const previous = window.innerWidth;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      try {
        const html = render();
        expect(html).toContain('class="col-12 col-lg-6"');
        expect(html).toContain('class="table-responsive"');
        expect(html).toContain('text-break');
        expect(html).toContain('scope="col"');
        expect(html).not.toMatch(/<a\b|<button\b|<form\b|href=|checkout_url|SECRET/i);
        expect(render(context({ permissions: [] }))).not.toContain("Últimas execuções");
      } finally {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: previous });
      }
    });
});
