import {
  normalizeContactWhatsappPhone,
  resolveProductionWhatsappPhone,
  buildProductionContactMessage,
  buildEventContactMessage,
  buildContactWhatsappHref,
} from "./productionWhatsappContact";

describe("Contato público de produções pelo WhatsApp", () => {
  test("normaliza telefones brasileiros, internacionais explícitos e links oficiais", () => {
    expect(normalizeContactWhatsappPhone("(61) 99999-1234")).toBe("5561999991234");
    expect(normalizeContactWhatsappPhone("+55 61 99999-1234")).toBe("5561999991234");
    expect(normalizeContactWhatsappPhone("0044 7700 900123")).toBe("447700900123");
    expect(normalizeContactWhatsappPhone("+1 (212) 555-1234")).toBe("12125551234");
    expect(normalizeContactWhatsappPhone("(61) 99999-1234", "+55")).toBe("5561999991234");
    expect(normalizeContactWhatsappPhone("55999991234", "55")).toBe("5555999991234"); // DDD 55 não é código do país
    expect(normalizeContactWhatsappPhone("https://wa.me/5561999991234")).toBe("5561999991234");
  });

  test("prioriza WhatsApp de produção e nunca busca número do dono ou da curadoria", () => {
    expect(resolveProductionWhatsappPhone({
      whatsapp_phone: "(61) 99999-1234",
      phone: "(61) 3333-1234",
      user: { phone: "(62) 99999-9999" },
    })).toBe("5561999991234");

    expect(resolveProductionWhatsappPhone({
      public_contact: { whatsapp: "(11) 99999-0000" },
    })).toBe("5511999990000");
    expect(resolveProductionWhatsappPhone({ user: { phone: "(62) 99999-9999" } })).toBe("");
    expect(resolveProductionWhatsappPhone({ phone: null })).toBe("");
  });

  test("monta mensagens contextualizadas e links com destinatário explícito", () => {
    const producerMessage = buildProductionContactMessage("Birosca");
    const eventMessage = buildEventContactMessage("Challoween Chá da Alice");

    expect(producerMessage).toBe('Olá, preciso de mais informações sobre a produção "Birosca" na Cutinapp. Você pode me ajudar?');
    expect(eventMessage).toBe('Olá, gostaria de mais informações sobre o evento "Challoween Chá da Alice" na Cutinapp. Você pode me ajudar?');
    expect(buildContactWhatsappHref("12125551234", producerMessage, { normalizedPhone: true })).toBe(
      `https://wa.me/12125551234?text=${encodeURIComponent(producerMessage)}`
    );
    expect(buildContactWhatsappHref("5561999991234", producerMessage)).toBe(
      `https://wa.me/5561999991234?text=${encodeURIComponent(producerMessage)}`
    );
  });

  test("não direciona para chat genérico ou domínio suspeito quando não há número confiável", () => {
    expect(normalizeContactWhatsappPhone("https://example.com/send?phone=5561999991234")).toBe("");
    expect(normalizeContactWhatsappPhone("javascript:alert(1)")).toBe("");
    expect(normalizeContactWhatsappPhone("1234")).toBe("");
    expect(buildContactWhatsappHref("", buildEventContactMessage("Teste"))).toBe("");
    expect(buildContactWhatsappHref("invalid", "Teste")).toBe("");
  });
});
