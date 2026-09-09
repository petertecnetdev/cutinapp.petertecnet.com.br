import { normalizeBrazilianWhatsappPhone, safeWhatsappHref } from "./whatsappUrl";

describe("whatsappUrl", () => {
  test.each([
    ["(31) 99999-1234", "5531999991234"],
    ["31 3333-1234", "553133331234"],
    ["+55 (31) 99999-1234", "5531999991234"],
    ["0031 99999-1234", "5531999991234"],
  ])("normalizes supported Brazilian phones: %s", (input, expected) => {
    expect(normalizeBrazilianWhatsappPhone(input)).toBe(expected);
  });

  test.each(["", "123", "551234", "553199999123456", "abc"])(
    "rejects malformed phone values: %s",
    (input) => {
      expect(normalizeBrazilianWhatsappPhone(input)).toBe("");
    }
  );

  test("accepts canonical WhatsApp destinations and normalizes the host", () => {
    expect(safeWhatsappHref("https://wa.me/5531999991234")).toBe("https://wa.me/5531999991234");
    expect(safeWhatsappHref("https://api.whatsapp.com/send?phone=5531999991234")).toBe("https://wa.me/5531999991234");
  });

  test("rejects unsupported hosts, schemes and malformed destinations", () => {
    expect(safeWhatsappHref("javascript:alert(5531999991234)")).toBe("");
    expect(safeWhatsappHref("http://wa.me/5531999991234")).toBe("");
    expect(safeWhatsappHref("https://example.com/5531999991234")).toBe("");
    expect(safeWhatsappHref("https://example.com/?phone=5531999991234")).toBe("");
    expect(safeWhatsappHref("123")).toBe("");
  });
});
