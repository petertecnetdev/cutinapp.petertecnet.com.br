import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CuratorialAccessSummaryW4 from "./CuratorialAccessSummaryW4";

const render = (context, applicationId = 7) => renderToStaticMarkup(
  <CuratorialAccessSummaryW4 context={context} applicationId={applicationId} />,
);

const context = (extra = {}) => ({
  authorized: true,
  application_id: 7,
  permissions: ["operations.view"],
  is_owner: true,
  is_root: true,
  ...extra,
});

describe("W4: interface administrativa de curadoria sem elevação", () => {
  test("proprietário local não é apresentado como root global", () => {
    const html = render(context());
    expect(html).toContain("Administrador da aplicação");
    expect(html).toContain("consulta somente leitura");
    expect(html).not.toMatch(/root global|superusuário|checkout|href=|<button/i);
  });

  test.each([
    ["outra aplicação", { application_id: 8 }],
    ["sem permissão", { permissions: [] }],
    ["sem autorização", { authorized: false }],
  ])("não revela painel para %s", (_name, extra) => {
    const html = render(context(extra));
    expect(html).toContain("Acesso ao monitoramento indisponível");
    expect(html).not.toContain("Curadoria automatizada");
    expect(html).not.toContain("Administrador da aplicação");
  });

  test("não apresenta ações comerciais mesmo com payload contendo checkout", () => {
    const html = render(context({ checkout_url: "https://example.invalid/checkout", token: "segredo" }));
    expect(html).toContain("Ingressos curatoriais são informativos");
    expect(html).not.toMatch(/example\.invalid|segredo|<a |<button|<form/i);
  });
});
