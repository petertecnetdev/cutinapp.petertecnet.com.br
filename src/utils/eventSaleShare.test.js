import { buildEventSaleShareText, buildEventSaleUrl, buildWhatsAppShareUrl } from "./eventSaleShare";

describe("eventSaleShare", () => {
  test("builds the canonical public event URL from slug", () => {
    expect(buildEventSaleUrl({ id: 42, slug: "festa-de-verao" }, "https://cutinapp.petertecnet.com.br/"))
      .toBe("https://cutinapp.petertecnet.com.br/event/festa-de-verao");
  });

  test("falls back to event id when slug is not available", () => {
    expect(buildEventSaleUrl({ id: 42 }, "https://cutinapp.petertecnet.com.br"))
      .toBe("https://cutinapp.petertecnet.com.br/event/42");
  });

  test("creates a concise sale message and WhatsApp URL", () => {
    const event = { title: "Festival Peter" };
    const publicUrl = "https://cutinapp.petertecnet.com.br/event/festival-peter";
    expect(buildEventSaleShareText(event)).toBe("Ingressos para Festival Peter já estão disponíveis na Cutinapp.");
    const whatsapp = buildWhatsAppShareUrl(publicUrl, event);
    expect(whatsapp).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(whatsapp)).toContain(publicUrl);
  });
});
