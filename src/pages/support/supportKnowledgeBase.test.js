import { SUPPORT_FAQS, filterSupportFaqs, SUPPORT_TOPICS } from "./supportKnowledgeBase";

test("FAQ responde dúvidas de ingressos, pagamentos, produções e conta", () => {
  expect(new Set(SUPPORT_FAQS.map((item) => item.topic))).toEqual(new Set(["tickets", "payments", "producers", "account"]));
  expect(SUPPORT_TOPICS.some((topic) => topic.id === "all")).toBe(true);
});
test("busca no FAQ ignora acentos e filtra por assunto", () => {
  expect(filterSupportFaqs("REEMBOLSO").map((entry) => entry.id)).toContain("refund");
  expect(filterSupportFaqs("QR Code", "tickets").map((entry) => entry.id)).toContain("ticket-location");
  expect(filterSupportFaqs("nao consigo", "account").map((entry) => entry.id)).toContain("account-access");
  expect(filterSupportFaqs("reembolso", "account")).toEqual([]);
});
test("FAQs não são duplicadas", () => {
  expect(new Set(SUPPORT_FAQS.map((entry) => entry.id)).size).toBe(SUPPORT_FAQS.length);
});
