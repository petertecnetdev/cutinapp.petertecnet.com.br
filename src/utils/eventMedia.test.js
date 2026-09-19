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
});
