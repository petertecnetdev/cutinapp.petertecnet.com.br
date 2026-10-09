import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InlineText } from "./BlogArticlePage";

const renderInline = (text) => renderToStaticMarkup(
  <MemoryRouter>
    <InlineText text={text} />
  </MemoryRouter>
);

describe("Blog article inline links", () => {
  test("renders internal markdown links as application links", () => {
    const html = renderInline("Conheça [a página para produtores](/for-producers).");

    expect(html).toContain('href="/for-producers"');
    expect(html).toContain("a página para produtores");
  });

  test("renders external HTTPS links with safe target attributes", () => {
    const html = renderInline("Leia [a documentação](https://example.com/guia).");

    expect(html).toContain('href="https://example.com/guia"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("does not convert protocol-relative URLs into links", () => {
    const html = renderInline("Acesse [o site externo](//example.com).");

    expect(html).not.toContain('href="//example.com"');
    expect(html).toContain("o site externo");
  });

  test("preserves bold text rendering", () => {
    const html = renderInline("Texto **importante**.");

    expect(html).toContain("<strong>importante</strong>");
  });
});
