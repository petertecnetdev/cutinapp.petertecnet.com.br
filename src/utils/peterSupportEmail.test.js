import { buildSupportMailto, DEFAULT_SUPPORT_EMAIL, getPeterSupportEmail, validateSupportEmail } from "./peterSupportEmail";

test("não aceita esquemas ou headers disfarçados de e-mail", () => {
  expect(validateSupportEmail("pessoa@example.com")).toBe("pessoa@example.com");
  expect(validateSupportEmail("mailto:pessoa@example.com")).toBe("");
  expect(validateSupportEmail("a@example.com?bcc=outro@example.com")).toBe("");
  expect(validateSupportEmail("a@example.com\r\nBcc:vitima@example.com")).toBe("");
  expect(buildSupportMailto("javascript:alert(1)")).toContain(DEFAULT_SUPPORT_EMAIL);
});
test("usa contato público do ecossistema", async () => {
  const previous = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ site: { contact: { email: "suporte@exemplo.com.br" } } }) });
  try { expect(await getPeterSupportEmail()).toBe("suporte@exemplo.com.br"); } finally { global.fetch = previous; }
});
test("falha da API mantém fallback de contato", async () => {
  const previous = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("fora"));
  try { expect(await getPeterSupportEmail()).toBe(DEFAULT_SUPPORT_EMAIL); } finally { global.fetch = previous; }
});
