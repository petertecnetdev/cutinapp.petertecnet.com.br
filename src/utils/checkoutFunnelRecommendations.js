const recommendations = {
  checkout_opened: {
    key: "reduce_pre_payment_friction",
    title: "Reduza o atrito antes do pagamento",
    action: "Revise primeiro preço final, taxas visíveis, seleção de ingresso/quantidade, cupom e erros de formulário. Mantenha o carrinho e o CTA de pagamento claros no mobile antes de aumentar desconto ou tráfego.",
    metric: "checkout → tentativa de pagamento",
    priority: "conversion",
  },
  payment_attempted: {
    key: "improve_payment_approval",
    title: "Ataque falhas de pagamento",
    action: "Separe recusas e erros por Pix/cartão, preserve idempotência e permita tentativa segura ou método alternativo sem recriar cobranças. Priorize o método com maior contribuição líquida em risco.",
    metric: "tentativa → pagamento aprovado",
    priority: "payments",
  },
  payment_approved: {
    key: "stabilize_fulfillment",
    title: "Proteja emissão do ingresso",
    action: "Pagamento aprovado sem ingresso é prioridade operacional. Investigue emissão, QR e reconciliação idempotente antes de qualquer ação de aquisição ou desconto.",
    metric: "pagamento aprovado → ingresso emitido",
    priority: "stability",
  },
};

export function getCheckoutFunnelRecommendation(step) {
  if (!step || typeof step !== "object") return null;
  const recommendation = recommendations[step.from];
  if (!recommendation) return null;

  return {
    ...recommendation,
    from: step.from,
    to: step.to || null,
    journeysAtRisk: Math.max(0, Number(step.dropoff_journeys || 0)),
    gmvAtRisk: Math.max(0, Number(step.gmv_at_risk || 0)),
    platformContributionAtRisk: Math.max(0, Number(step.platform_contribution_at_risk || 0)),
  };
}
