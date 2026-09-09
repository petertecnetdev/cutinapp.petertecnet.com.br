const normalize = (value) => String(value || "").trim().toLowerCase();

const providerDetail = (payment = {}) => normalize(
  payment?.status_detail
  || payment?.statusDetail
  || payment?.provider_payload?.status_detail
  || payment?.provider_payload?.statusDetail
);

const paymentStatus = (payment = {}) => normalize(
  payment?.status
  || payment?.provider_payload?.status
);

export const classifyPaymentFailure = (payment = {}, method = "") => {
  const detail = providerDetail(payment);
  const status = paymentStatus(payment);
  const paymentMethod = normalize(method || payment?.method);

  if (paymentMethod !== "card") {
    if (detail.includes("expired") || status === "expired") return { reason: "pix_expired", detail };
    if (detail.includes("cancel") || status === "cancelled" || status === "canceled") return { reason: "pix_cancelled", detail };
    if (detail.includes("reject") || status === "rejected") return { reason: "pix_rejected", detail };
    return { reason: "pix_not_completed", detail };
  }
  if ((status === "cancelled" || status === "canceled") && detail === "expired") return { reason: "card_authentication_expired", detail };
  if (detail.includes("3ds_challenge_expired")) return { reason: "card_authentication_expired", detail };
  if ((status === "cancelled" || status === "canceled") && (!detail || detail === "cancelled" || detail === "canceled")) return { reason: "card_cancelled", detail };
  if (detail.includes("bad_filled_security_code")) return { reason: "card_security_code", detail };
  if (detail.includes("bad_filled_date")) return { reason: "card_expiration_data", detail };
  if (detail.includes("bad_filled_card_number")) return { reason: "card_number", detail };
  if (detail.includes("bad_filled_other")) return { reason: "card_additional_data", detail };
  if (detail.includes("3ds_challenge") || detail.includes("pending_challenge") || detail.includes("three_ds")) return { reason: "card_authentication", detail };
  if (detail.includes("invalid_installments") || detail.includes("installment")) return { reason: "invalid_installments", detail };
  if (detail.includes("amount_limit_exceeded")) return { reason: "amount_limit_exceeded", detail };
  if (detail.includes("insufficient_amount")) return { reason: "insufficient_funds", detail };
  if (detail.includes("processing_error")) return { reason: "processing_error", detail };
  if (detail.includes("card_disabled")) return { reason: "card_disabled", detail };
  if (detail.includes("card_type_not_allowed")) return { reason: "card_type_not_allowed", detail };
  if (detail.includes("bad_filled") || detail.includes("invalid") || detail.includes("form")) return { reason: "card_data", detail };
  if (detail.includes("expired")) return { reason: "expired_card", detail };
  if (detail.includes("call_for_authorize")) return { reason: "issuer_authorization", detail };
  if (detail.includes("duplicated")) return { reason: "duplicate_payment", detail };
  if (detail.includes("blacklist")) return { reason: "security_block", detail };
  if (detail.includes("rejected_by_issuer")) return { reason: "issuer_rejection", detail };
  if (detail.includes("other_reason")) return { reason: "issuer_or_risk_rejection", detail };
  if (detail.includes("high_risk") || detail.includes("fraud")) return { reason: "security_review", detail };
  if (detail.includes("max_attempts")) return { reason: "attempt_limit", detail };
  return { reason: "card_rejected", detail };
};

const sameCardRetryBlockedReasons = new Set([
  "duplicate_payment",
  "security_block",
  "security_review",
  "attempt_limit",
  "issuer_rejection",
  "issuer_or_risk_rejection",
  "card_rejected",
  "card_type_not_allowed",
  "expired_card",
  "insufficient_funds",
  "amount_limit_exceeded",
]);

const statusCheckOnlyReasons = new Set([
  "duplicate_payment",
]);

export const paymentFailureGuidance = ({ payment = {}, method = "", pixAvailable = false } = {}) => {
  const classification = classifyPaymentFailure(payment, method);
  const pixAlternative = pixAvailable ? " Você também pode usar PIX sem refazer sua seleção." : "";
  const pixRecommended = pixAvailable ? " Recomendado: tente PIX para concluir esta mesma compra sem refazer sua seleção." : "";

  const guidance = {
    card_security_code: {
      title: "Revise o código de segurança do cartão",
      message: `O provedor indicou que o código de segurança (CVV) precisa ser corrigido. Confira os 3 ou 4 dígitos do cartão antes de enviar novamente.${pixAlternative}`,
    },
    card_expiration_data: {
      title: "Revise a validade do cartão",
      message: `O provedor indicou que a data de validade precisa ser corrigida. Confira mês e ano antes de tentar novamente.${pixAlternative}`,
    },
    card_number: {
      title: "Revise o número do cartão",
      message: `O provedor indicou que o número do cartão precisa ser corrigido. Confira os dígitos antes de tentar novamente.${pixAlternative}`,
    },
    card_additional_data: {
      title: "Revise os outros dados do cartão",
      message: `O provedor indicou erro em outro dado preenchido no cartão, diferente de número, validade ou CVV. Revise os demais campos solicitados no formulário antes de enviar novamente; sua seleção continua preservada.${pixAlternative}`,
    },
    card_authentication: {
      title: "A autenticação do cartão não foi concluída",
      message: `O banco exigiu uma etapa extra de autenticação (3DS) e ela não foi concluída ou expirou. Volte ao fluxo do banco e conclua a confirmação antes de tentar novamente. Evite repetir imediatamente os mesmos dados sem concluir a autenticação.${pixRecommended}`,
    },
    card_authentication_expired: {
      title: "O prazo de autenticação do banco expirou",
      message: `A etapa de autenticação (3DS) expirou antes da confirmação. O cartão não está necessariamente vencido: inicie uma nova tentativa para abrir uma nova autenticação e conclua a confirmação no banco.${pixAlternative}`,
    },
    card_cancelled: {
      title: "A tentativa anterior foi encerrada",
      message: `O provedor confirmou que essa tentativa de cartão foi cancelada e não será processada. Sua seleção continua preservada: você pode iniciar uma nova tentativa com segurança.${pixAlternative}`,
    },
    invalid_installments: {
      title: "Escolha outra quantidade de parcelas",
      message: `O provedor não aceitou o parcelamento selecionado para este cartão. Escolha outra quantidade de parcelas disponível e tente novamente; sua seleção e o valor da compra continuam preservados.${pixAlternative}`,
    },
    amount_limit_exceeded: {
      title: "O valor ultrapassou o limite permitido para este cartão",
      message: `O banco ou o provedor informou que o valor desta compra excede o limite permitido para a transação. Não repita a mesma tentativa sem ajustar o limite; use outro cartão ou outra forma de pagamento.${pixRecommended}`,
    },
    insufficient_funds: {
      title: "O cartão não conseguiu concluir o pagamento",
      message: `O provedor indicou saldo ou limite insuficiente. Não repita a mesma tentativa sem liberar limite; use outro cartão ou aguarde a atualização do limite.${pixRecommended}`,
    },
    processing_error: {
      title: "Houve uma falha temporária no processamento",
      message: `O provedor informou um erro técnico ao processar o cartão. Sua seleção continua preservada: aguarde alguns instantes e tente novamente. Se o erro persistir, use outro meio de pagamento.${pixAlternative}`,
    },
    card_disabled: {
      title: "O cartão está bloqueado para esta compra",
      message: `O provedor indicou que o cartão está desabilitado para este tipo de pagamento. Habilite compras online no seu banco antes de tentar novamente ou use outro cartão.${pixRecommended}`,
    },
    card_type_not_allowed: {
      title: "Este tipo de cartão não é aceito nesta compra",
      message: `O provedor recusou esta modalidade de cartão. Não repita este cartão; use outro cartão elegível.${pixRecommended}`,
    },
    card_data: {
      title: "Revise os dados do cartão",
      message: `O provedor indicou que algum dado do cartão precisa ser corrigido. Revise os campos antes de tentar novamente.${pixAlternative}`,
    },
    expired_card: {
      title: "Este cartão não pôde ser usado",
      message: `O provedor indicou cartão vencido. Não tente novamente com este cartão; use outro cartão válido.${pixRecommended}`,
    },
    issuer_authorization: {
      title: "O banco precisa autorizar a compra",
      message: `O emissor pediu autorização para esta compra. Autorize no seu banco primeiro e só então tente novamente.${pixRecommended}`,
    },
    issuer_rejection: {
      title: "O banco recusou esta tentativa",
      message: `O banco emissor recusou o pagamento. Evite repetir imediatamente os mesmos dados; confirme com o banco se a compra está liberada ou escolha outro meio de pagamento.${pixRecommended}`,
    },
    duplicate_payment: {
      title: "Já existe um pagamento semelhante para esta compra",
      message: "O provedor identificou uma tentativa de pagamento duplicada. Não tente pagar novamente com outro cartão ou PIX agora. Verifique o status da compra e aguarde a confirmação antes de iniciar uma nova cobrança.",
    },
    security_block: {
      title: "Este cartão não pode ser usado nesta tentativa",
      message: `O provedor bloqueou esta tentativa por critérios de segurança. Não repita o mesmo cartão em sequência; escolha outro meio de pagamento ou fale com o banco emissor.${pixRecommended}`,
    },
    issuer_or_risk_rejection: {
      title: "O banco não aprovou esta tentativa",
      message: `O banco não informou um motivo específico para a recusa e o provedor recomenda trocar o meio de pagamento ou consultar o emissor. Evite repetir imediatamente os mesmos dados.${pixRecommended}`,
    },
    security_review: {
      title: "O pagamento não foi autorizado",
      message: `Por segurança, o provedor não aprovou esta tentativa. Não repita os mesmos dados em sequência.${pixRecommended || pixAlternative}`,
    },
    attempt_limit: {
      title: "Não foi possível repetir esta tentativa",
      message: `O provedor bloqueou novas tentativas iguais. Não repita os mesmos dados; use outro cartão ou outra forma de pagamento.${pixRecommended}`,
    },
    card_rejected: {
      title: "O cartão não concluiu o pagamento",
      message: `O provedor não informou um motivo específico para a recusa. Evite repetir imediatamente os mesmos dados; use outro cartão ou consulte o banco emissor.${pixRecommended}`,
    },
    pix_expired: {
      title: "Este PIX expirou",
      message: "O código PIX anterior não está mais ativo. Gere um novo PIX para esta mesma compra; sua seleção continua preservada.",
    },
    pix_cancelled: {
      title: "Este PIX foi encerrado",
      message: "A tentativa anterior não está mais ativa. Gere um novo PIX para esta mesma compra; sua seleção continua preservada.",
    },
    pix_rejected: {
      title: "O PIX não foi confirmado",
      message: "A tentativa anterior não pôde ser concluída. Gere um novo PIX para esta mesma compra; sua seleção continua preservada.",
    },
    pix_not_completed: {
      title: "O PIX não foi concluído",
      message: "Gere um novo PIX para esta mesma compra. Sua seleção continua preservada.",
    },
  };

  return {
    ...classification,
    ...guidance[classification.reason],
    retryAllowed: !sameCardRetryBlockedReasons.has(classification.reason),
    statusCheckOnly: statusCheckOnlyReasons.has(classification.reason),
  };
};