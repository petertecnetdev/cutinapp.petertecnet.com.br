const nonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const clampPercent = (value) => Math.min(100, nonNegative(value));

/**
 * Simula o efeito econômico de uma nova configuração de custo variável do canal
 * (ex.: comissão de promoter, desconto/cupom ou campanha) sem alterar preços ou pedidos.
 *
 * A simulação parte do resumo produzido por summarizeRevenueByChannel e preserva
 * explicitamente o piso mínimo de take rate líquido configurado para o canal.
 */
export const simulateChannelVariableCost = (channel = {}, proposal = {}) => {
  const gmv = nonNegative(channel.gmv);
  const platformRevenue = nonNegative(channel.platformRevenue);
  const processorFees = nonNegative(channel.processorFeesBorneByPlatform);
  const currentVariableCosts = nonNegative(channel.variableChannelCosts);
  const minimumNetTakeRate = nonNegative(channel.minimumNetTakeRate);

  const proposedTotalVariableCosts = proposal.totalVariableCosts !== undefined
    ? nonNegative(proposal.totalVariableCosts)
    : proposal.variableCostRate !== undefined
      ? gmv * (clampPercent(proposal.variableCostRate) / 100)
      : currentVariableCosts;

  const projectedNetRevenue = Math.max(
    0,
    platformRevenue - processorFees - proposedTotalVariableCosts
  );
  const projectedNetTakeRate = gmv > 0 ? (projectedNetRevenue / gmv) * 100 : 0;
  const minimumNetRevenue = gmv * (minimumNetTakeRate / 100);
  const projectedHeadroomAboveFloor = Math.max(0, projectedNetRevenue - minimumNetRevenue);
  const incrementalVariableCost = proposedTotalVariableCosts - currentVariableCosts;
  const projectedContributionMargin = platformRevenue > 0
    ? (projectedNetRevenue / platformRevenue) * 100
    : 0;
  const preservesFloor = projectedNetTakeRate >= minimumNetTakeRate;

  return {
    channelKey: channel.key || null,
    gmv,
    currentVariableCosts,
    proposedTotalVariableCosts,
    proposedVariableCostRate: gmv > 0 ? (proposedTotalVariableCosts / gmv) * 100 : 0,
    incrementalVariableCost,
    projectedNetRevenue,
    projectedNetTakeRate,
    projectedContributionMargin,
    minimumNetTakeRate,
    minimumNetRevenue,
    projectedHeadroomAboveFloor,
    preservesFloor,
    status: preservesFloor ? "safe" : "below_floor",
  };
};

/**
 * Conveniência para promoters: mantém todos os demais custos do canal fixos e
 * substitui apenas a comissão do promoter pela proposta informada.
 */
export const simulatePromoterCommission = (channel = {}, proposal = {}) => {
  const gmv = nonNegative(channel.gmv);
  const currentPromoterCommission = nonNegative(channel.promoterCommission);
  const otherVariableCosts = Math.max(
    0,
    nonNegative(channel.variableChannelCosts) - currentPromoterCommission
  );

  const proposedPromoterCommission = proposal.commissionAmount !== undefined
    ? nonNegative(proposal.commissionAmount)
    : proposal.commissionRate !== undefined
      ? gmv * (clampPercent(proposal.commissionRate) / 100)
      : currentPromoterCommission;

  const simulation = simulateChannelVariableCost(channel, {
    totalVariableCosts: otherVariableCosts + proposedPromoterCommission,
  });

  return {
    ...simulation,
    currentPromoterCommission,
    proposedPromoterCommission,
    proposedPromoterCommissionRate: gmv > 0 ? (proposedPromoterCommission / gmv) * 100 : 0,
    otherVariableCosts,
    promoterCommissionDelta: proposedPromoterCommission - currentPromoterCommission,
  };
};
