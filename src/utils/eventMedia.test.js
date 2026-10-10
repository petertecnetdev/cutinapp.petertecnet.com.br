import { eventImageUrl, eventInitials } from "./eventMedia";

jest.mock("../config", () => ({ storageUrl: "https://cdn.example.test/storage/" }));

describe("eventMedia", () => {
  test("gera iniciais com as duas primeiras palavras do evento", () => {
    expect(eventInitials("Noite de Gala")).toBe("ND");
    expect(eventInitials("Festival")).toBe("F");
    expect(eventInitials("")).toBe("EV");
  });

  test("mantém URLs absolutas e resolve caminhos de storage", () => {
    expect(eventImageUrl("https://images.example.test/event.webp")).toBe("https://images.example.test/event.webp");
    expect(eventImageUrl("blob:preview")).toBe("blob:preview");
    expect(eventImageUrl("/images/events/event.webp")).toBe("https://cdn.example.test/storage/images/events/event.webp");
    expect(eventImageUrl(null)).toBe("");
  });
  test("normaliza caminhos /storage/ sem duplicar o prefixo da API", () => {
    expect(eventImageUrl("/storage/events/file.webp"))
      .toBe("https://cdn.example.test/storage/events/file.webp");
    expect(eventImageUrl("storage/events/file.webp"))
      .toBe("https://cdn.example.test/storage/events/file.webp");
    expect(eventImageUrl("/storage//events/file.webp"))
      .toBe("https://cdn.example.test/storage/events/file.webp");
    expect(eventImageUrl("/storage/events/file.webp"))
      .not.toContain("/storage/storage/");
  });

  test("mantém caminhos relativos de imagens de eventos", () => {
    expect(eventImageUrl("images/events/file.webp"))
      .toBe("https://cdn.example.test/storage/images/events/file.webp");
    expect(eventImageUrl("/images/events/file.webp"))
      .toBe("https://cdn.example.test/storage/images/events/file.webp");
  });

  test("preserva URLs HTTPS, query strings e fragments", () => {
    expect(eventImageUrl("https://images.example.test/events/file.webp?size=small#preview"))
      .toBe("https://images.example.test/events/file.webp?size=small#preview");
    expect(eventImageUrl("/storage/events/file.webp?v=2#cover"))
      .toBe("https://cdn.example.test/storage/events/file.webp?v=2#cover");
    expect(eventImageUrl("data:image/png;base64,AAAA"))
      .toBe("data:image/png;base64,AAAA");
  });

  test("retorna fallback vazio para valores ausentes", () => {
    expect(eventImageUrl(null)).toBe("");
    expect(eventImageUrl(undefined)).toBe("");
    expect(eventImageUrl("")).toBe("");
    expect(eventImageUrl("   ")).toBe("");
  });

});
