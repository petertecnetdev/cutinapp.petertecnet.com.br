import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InlineText } from "./BlogArticlePage";

const renderInline = (value) => renderToStaticMarkup(
  <MemoryRouter><InlineText text={value} /></MemoryRouter>
);

describe("Blog editorial links", () => {
  it("links articles to the producer landing without a full page reload", () => {
    const html = renderInline("[Conheça a Cutinapp para produtores](/for-producers)");
    expect(html).toContain('href="/for-producers"');
    expect(html).toContain("Conheça a Cutinapp para produtores");
  });

  it("opens external HTTP(S) destinations safely", () => {
    const html = renderInline("[Fonte](https://example.org/guia)");
    expect(html).toContain('href="https://example.org/guia"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not make javascript or protocol-relative URLs clickable", () => {
    const html = renderInline("[Risco](javascript:alert) [Outro](//example.org)");
    expect(html).not.toContain("href=");
  });

  it("keeps existing bold Markdown support", () => {
    expect(renderInline("**Guia de eventos**")).toContain("<strong>Guia de eventos</strong>");
  });
});
