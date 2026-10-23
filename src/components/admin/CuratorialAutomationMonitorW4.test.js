import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CuratorialAutomationMonitorW4 from "./CuratorialAutomationMonitorW4";
const context = (extra = {}) => ({
  authorized: true, application_id: 7, permissions: ["operations.view"], is_owner: true, is_root: true, ...extra,
});
const apiResponse = { success: true, data: { global_enabled: false,
  workers: [{ key: "discovery_health", enabled: true }],
  recent_runs: [{ id: 3, worker_key: "discovery_health", status: "succeeded",
    result: { sources: 3, stale: 0, errors: 1 }, checkout_url: "https://example.invalid", token: "SECRET" }] } };
const render = (ctx = context(), payload = apiResponse) => renderToStaticMarkup(
  <CuratorialAutomationMonitorW4 context={ctx} applicationId={7} apiResponse={payload} />);
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
