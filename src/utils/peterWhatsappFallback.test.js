import {
  buildCutinappSupportMessage,
  buildCutinappWhatsappHref,
} from "./peterWhatsappFallback";

describe("WhatsApp institucional da Cutinapp", () => {
  test("identifica explicitamente a Cutinapp e a equipe da Peter Tecnet", () => {
    const text = buildCutinappSupportMessage();
    expect(text).toContain("Peter Tecnet");
    expect(text).toContain("Cutinapp");
    expect(text).toContain("atendimento");
  });

  test("encaminha somente a URL pública, sem parâmetros nem hash", () => {
    const message = buildCutinappSupportMessage(
      "/event/festival-rock?order=segredo#comprovante",
      "https://cutinapp.petertecnet.com.br"
    );
    expect(message).toContain("https://cutinapp.petertecnet.com.br/event/festival-rock");
    expect(message).not.toContain("segredo");
    expect(message).not.toContain("comprovante");
  });

  test.each([
    "/checkout/festival",
    "/purchases/pedido-privado",
    "/event/edit/123",
    "/artist/invitations/token-secreto",
    "/profile/123",
    "/admin",
  ])("não expõe endereço privado ao WhatsApp: %s", (path) => {
    const message = buildCutinappSupportMessage(path, "https://cutinapp.petertecnet.com.br");
    expect(message).not.toContain("Página pública:");
    expect(message).not.toContain(path);
  });

  test("normaliza destino e preenche texto no link oficial do WhatsApp", () => {
    const href = buildCutinappWhatsappHref(
      "https://api.whatsapp.com/send?phone=5531999991234",
      "/production/casa-de-shows/public",
      "https://cutinapp.petertecnet.com.br"
    );
    const parsed = new URL(href);
    expect(parsed.origin).toBe("https://wa.me");
    expect(parsed.pathname).toBe("/5531999991234");
    expect(parsed.searchParams.get("text")).toContain("aplicativo Cutinapp");
    expect(parsed.searchParams.get("text")).toContain("/production/casa-de-shows/public");
  });

  test("não abre contato com endereço inválido ou origem não confiável", () => {
    expect(buildCutinappWhatsappHref("https://example.com/phone")).toBe("");
    const text = buildCutinappSupportMessage("/event/123", "javascript:alert(1)");
    expect(text).not.toContain("Página pública:");
  });
});
