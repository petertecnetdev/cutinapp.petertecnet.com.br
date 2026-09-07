const finiteNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const estimateNetRevenueEconomics = ({
  grossRevenue = 0,
  platformRevenue = 0,
  processorFees = 0,
  processorFeesBorneByPlatform,
  platformContributionAfterProcessing,
  paidOrders = 0,
  platformRevenueAtRisk = 0,
  recoveredPlatformRevenue = 0,
  recoveredPlatformContributionAfterProcessing,
} = {}) => {
  const gross = Math.max(0, finiteNumber(grossRevenue));
  const platform = Math.max(0, finiteNumber(platformRevenue));
  const totalProcessing = Math.max(0, finiteNumber(processorFees));
  const processing = processorFeesBorneByPlatform == null
    ? totalProcessing
    : Math.max(0, finiteNumber(processorFeesBorneByPlatform));
  const paid = Math.max(0, finiteNumber(paidOrders));
  const netRevenue = platformContributionAfterProcessing == null
    ? platform - processing
    : Math.max(0, finiteNumber(platformContributionAfterProcessing));
  const contributionRatio = platform > 0 ? netRevenue / platform : 0;

  return {
    netRevenue,
    netTakeRate: gross > 0 ? (netRevenue / gross) * 100 : 0,
    processingRateOnGmv: gross > 0 ? (processing / gross) * 100 : 0,
    processingShareOfPlatformRevenue: platform > 0 ? (processing / platform) * 100 : 0,
    netRevenuePerPaidOrder: paid > 0 ? netRevenue / paid : 0,
    estimatedNetRevenueAtRisk: Math.max(0, finiteNumber(platformRevenueAtRisk) * contributionRatio),
    estimatedRecoveredNetRevenue: recoveredPlatformContributionAfterProcessing == null
      ? Math.max(0, finiteNumber(recoveredPlatformRevenue) * contributionRatio)
      : Math.max(0, finiteNumber(recoveredPlatformContributionAfterProcessing)),
    contributionRatio,
  };
};
