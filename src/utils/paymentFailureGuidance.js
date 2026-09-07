const normalize = (value) => String(value || "").trim().toLowerCase();

const providerDetail = (payment = {}) => normalize(
  payment?.status_detail
  || payment?.statusDetail
  || payment?.provider_payload?.status_detail
  || payment?.provider_payload?.statusDetail
);

export const classifyPaymentFailure = (payment = {}, method = "") => {
  const detail = providerDetail(payment);
  const paymentMethod = normalize(method || payment?.method);

  if (paymentMethod !== "card") return { reason: "pix_not_completed", detail };
  if (detail.includes("insufficient_amount")) return { reason: "insufficient_funds", detail };
  if (detail.includes("card_disabled")) return { reason: "card_disabled", detail };
  if (detail.includes("bad_filled") || detail.includes("invalid") || detail.includes("form")) return { reason: "card_data", detail };
  if (detail.includes("expired")) return { reason: "expired_card", detail };
  if (detail.includes("call_for_authorize")) return { reason: "issuer_authorization", detail };
  if (detail.includes("high_risk") || detail.includes("fraud")) return { reason: "security_review", detail };
  if (detail.includes("max_attempts") || detail.includes("duplicated")) return { reason: "attempt_limit", detail };
  return { reason: "card_rejected", detail };
};

export const paymentFailureGuidance = ({ payment = {}, method = "", pixAvailable = false } = {}) => {
  const classification = classifyPaymentFailure(payment, method);
  const pixAlternative = pixAvailable ? " Você também pode usar PIX sem refazer sua seleção." : "";
  const pixRecommended = pixAvailable ? " Recomendado: tente PIX para concluir esta mesma compra sem refazer sua seleção." : "";

  const guidance = {
    insufficient_funds: {
      title: "O cartão não conseguiu concluir o pagamento",
      message: `O provedor indicou saldo ou limite insuficiente. Tente outro cartão.${pixRecommended}`,
    },
    card_disabled: {
      title: "O cartão está bloqueado para esta compra",
      message: `O provedor indicou que o cartão está desabilitado para este tipo de pagamento. Habilite compras online no seu banco ou use outro cartão.${pixRecommended}`,
    },
    card_data: {
      title: "Revise os dados do cartão",
      message: `O provedor indicou que algum dado do cartão precisa ser corrigido. Revise os campos e tente novamente.${pixAlternative}`,
    },
    expired_card: {
      title: "Este cartão não pôde ser usado",
      message: `O provedor indicou cartão vencido. Use outro cartão.${pixRecommended}`,
    },
    issuer_authorization: {
      title: "O banco precisa autorizar a compra",
      message: `O emissor pediu autorização para esta compra. Autorize no seu banco e tente novamente.${pixRecommended}`,
    },
    security_review: {
      title: "O pagamento não foi autorizado",
      message: `Por segurança, o provedor não aprovou esta tentativa. Não repita os mesmos dados em sequência.${pixRecommended || pixAlternative}`,
    },
    attempt_limit: {
      title: "Não foi possível repetir esta tentativa",
      message: `O provedor bloqueou novas tentativas iguais. Use outro cartão ou outra forma de pagamento.${pixRecommended}`,
    },
    card_rejected: {
      title: "O cartão não concluiu o pagamento",
      message: `Você pode revisar os dados e tentar novamente ou escolher outra forma de pagamento.${pixAlternative}`,
    },
    pix_not_completed: {
      title: "O PIX não foi concluído",
      message: "Gere um novo PIX para esta mesma compra. Sua seleção continua preservada.",
    },
  };

  return { ...classification, ...guidance[classification.reason] };
};
