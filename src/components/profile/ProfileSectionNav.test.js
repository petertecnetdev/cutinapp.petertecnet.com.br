import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileSectionNav from "./ProfileSectionNav";

describe("ProfileSectionNav", () => {
  test("mostra apenas seções oferecidas pelo evento e indica início ativo", () => {
    const html = renderToStaticMarkup(<ProfileSectionNav label="Seções do evento" items={[
      { key: "inicio", label: "Início", targetId: "start" },
      { key: "sobre", label: "Informações", targetId: "about" },
    ]} />);
    expect(html).toContain("Seções do evento");
    expect(html).toContain("aria-current=\"location\"");
    expect(html).toContain("Informações");
    expect(html).not.toContain("Ingressos");
  });

  test("respeita a aba ativa e acessibilidade do perfil", () => {
    const html = renderToStaticMarkup(<ProfileSectionNav label="Seções do participante" mode="tabs"
      activeKey="events" items={[
        { key: "posts", label: "Publicações" },
        { key: "events", label: "Eventos" },
      ]} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Eventos");
  });
});
