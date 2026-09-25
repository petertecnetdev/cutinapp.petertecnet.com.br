import {
  brazilianCepDigits,
  formatBrazilianCep,
  isBrazilianCep,
  sanitizePostalCodeInput,
} from "./postalCode";

describe("postalCode", () => {
  it("preserves international alphanumeric postal codes", () => {
    expect(sanitizePostalCodeInput("SW1A 1AA")).toBe("SW1A 1AA");
    expect(sanitizePostalCodeInput("K1A 0B1")).toBe("K1A 0B1");
    expect(sanitizePostalCodeInput("10115")).toBe("10115");
  });

  it("does not reinterpret non-Brazilian postal formats as CEP", () => {
    expect(isBrazilianCep("SW1A 1AA")).toBe(false);
    expect(isBrazilianCep("10001-1234")).toBe(false);
    expect(isBrazilianCep("560001")).toBe(false);
  });

  it("recognizes and formats Brazilian CEP without changing the generic input contract", () => {
    expect(isBrazilianCep("74000-000")).toBe(true);
    expect(isBrazilianCep("74000000")).toBe(true);
    expect(brazilianCepDigits("74000-000")).toBe("74000000");
    expect(formatBrazilianCep("74000000")).toBe("74000-000");
  });

  it("caps unexpectedly long input without forcing a country-specific mask", () => {
    expect(sanitizePostalCodeInput("1234567890123456789012345")).toHaveLength(20);
  });
});
