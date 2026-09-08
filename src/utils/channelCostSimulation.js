const nonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const clampPercent = (value) => Math.min(100, nonNegative(value));
const boundedRate = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
};

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

/**
 * Avalia uma proposta de custo variável com um colchão econômico acima do piso.
 *
 * O piso mínimo continua sendo o limite duro. Além dele, a Cutinapp preserva por
 * padrão 50% do headroom econômico atual como reserva de margem, evitando que uma
 * configuração aparentemente "safe" consuma toda a folga de receita líquida.
 */
export const assessChannelCostProposal = (channel = {}, proposal = {}, options = {}) => {
  const simulation = simulateChannelVariableCost(channel, proposal);
  const currentNetRevenue = nonNegative(channel.netRevenue);
  const minimumNetRevenue = simulation.minimumNetRevenue;
  const currentHeadroom = channel.netRevenueHeadroomAboveFloor !== undefined
    ? nonNegative(channel.netRevenueHeadroomAboveFloor)
    : Math.max(0, currentNetRevenue - minimumNetRevenue);
  const safetyReserveFactor = boundedRate(options.safetyReserveFactor, 0.5);
  const minimumHeadroomReserve = currentHeadroom * safetyReserveFactor;
  const preservesSafetyReserve = simulation.projectedHeadroomAboveFloor >= minimumHeadroomReserve;
  const availableHeadroomToSpend = Math.max(0, currentHeadroom - minimumHeadroomReserve);
  const incrementalCostCapacity = Math.max(0, availableHeadroomToSpend);
  const gmv = simulation.gmv;
  const maximumRecommendedVariableCosts = Math.max(
    0,
    simulation.currentVariableCosts + incrementalCostCapacity
  );
  const maximumRecommendedVariableCostRate = gmv > 0
    ? (maximumRecommendedVariableCosts / gmv) * 100
    : 0;
  const status = !simulation.preservesFloor
    ? "blocked"
    : preservesSafetyReserve
      ? "recommended"
      : "caution";

  return {
    ...simulation,
    currentHeadroom,
    safetyReserveFactor,
    minimumHeadroomReserve,
    preservesSafetyReserve,
    availableHeadroomToSpend,
    incrementalCostCapacity,
    maximumRecommendedVariableCosts,
    maximumRecommendedVariableCostRate,
    decisionStatus: status,
    canApply: simulation.preservesFloor,
    recommendedToApply: simulation.preservesFloor && preservesSafetyReserve,
  };
};

/**
 * Avaliação específica para comissão de promoter, preservando os outros custos do
 * canal e expondo o teto recomendado de comissão compatível com a reserva de margem.
 */
export const assessPromoterCommissionProposal = (channel = {}, proposal = {}, options = {}) => {
  const simulation = simulatePromoterCommission(channel, proposal);
  const currentNetRevenue = nonNegative(channel.netRevenue);
  const minimumNetRevenue = simulation.minimumNetRevenue;
  const currentHeadroom = channel.netRevenueHeadroomAboveFloor !== undefined
    ? nonNegative(channel.netRevenueHeadroomAboveFloor)
    : Math.max(0, currentNetRevenue - minimumNetRevenue);
  const safetyReserveFactor = boundedRate(options.safetyReserveFactor, 0.5);
  const minimumHeadroomReserve = currentHeadroom * safetyReserveFactor;
  const preservesSafetyReserve = simulation.projectedHeadroomAboveFloor >= minimumHeadroomReserve;
  const commissionHeadroomToSpend = Math.max(0, currentHeadroom - minimumHeadroomReserve);
  const maximumRecommendedPromoterCommission = simulation.currentPromoterCommission + commissionHeadroomToSpend;
  const maximumRecommendedPromoterCommissionRate = simulation.gmv > 0
    ? (maximumRecommendedPromoterCommission / simulation.gmv) * 100
    : 0;
  const decisionStatus = !simulation.preservesFloor
    ? "blocked"
    : preservesSafetyReserve
      ? "recommended"
      : "caution";

  return {
    ...simulation,
    currentHeadroom,
    safetyReserveFactor,
    minimumHeadroomReserve,
    preservesSafetyReserve,
    commissionHeadroomToSpend,
    maximumRecommendedPromoterCommission,
    maximumRecommendedPromoterCommissionRate,
    decisionStatus,
    canApply: simulation.preservesFloor,
    recommendedToApply: simulation.preservesFloor && preservesSafetyReserve,
  };
};
