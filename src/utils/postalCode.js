export const sanitizePostalCodeInput = (value, maxLength = 20) => String(value ?? "")
  .replace(/\s{2,}/g, " ")
  .slice(0, maxLength);

export const brazilianCepDigits = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 8);

export const isBrazilianCep = (value) => /^\d{5}-?\d{3}$/.test(String(value ?? "").trim());

export const formatBrazilianCep = (value) => {
  const digits = brazilianCepDigits(value);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : String(value ?? "").trim();
};
