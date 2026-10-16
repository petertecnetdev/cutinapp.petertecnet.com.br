import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import EventProductionLink from "./EventProductionLink";

const renderProduction = (production) => renderToStaticMarkup(
  <MemoryRouter><EventProductionLink production={production} /></MemoryRouter>
);

describe("EventProductionLink", () => {
  it("exibe nome e logo oficiais sem o rótulo redundante", () => {
    const html = renderProduction({
      name: "Bicicleta Produtora",
      slug: "bicicleta-produtora",
      logo: "productions/bicicleta.png",
    });
    expect(html).toContain('href="/production/bicicleta-produtora/public"');
    expect(html).toContain("Bicicleta Produtora");
    expect(html).toContain('src="https://api.petertecnet.com.br/storage/productions/bicicleta.png"');
    expect(html).not.toContain("Produção responsável");
  });

  it("usa iniciais quando a logo não está cadastrada", () => {
    const html = renderProduction({ name: "La Fyesta Pub", slug: "la-fyesta-pub" });
    expect(html).toContain("LF");
    expect(html).toContain('href="/production/la-fyesta-pub/public"');
    expect(html).not.toContain("<img");
  });

  it("não cria link enganoso quando a produção não tem slug", () => {
    const html = renderProduction({ name: "Produtora Sem Slug" });
    expect(html).toContain("Produtora Sem Slug");
    expect(html).not.toContain("href=");
  });

  it("não apresenta uma produção inexistente", () => {
    expect(renderProduction(null)).toBe("");
  });
});
