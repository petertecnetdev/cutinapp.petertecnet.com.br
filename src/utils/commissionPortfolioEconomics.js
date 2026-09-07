const finiteNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const commissionPortfolioEconomics = ({
  grossSales = 0,
  commissionAmount = 0,
  minimumRetainedMarginPercentage = 0,
} = {}) => {
  const gross = Math.max(0, finiteNumber(grossSales));
  const commission = Math.max(0, finiteNumber(commissionAmount));
  const retainedMargin = Math.max(0, Math.min(100, finiteNumber(minimumRetainedMarginPercentage)));

  return {
    grossSales: gross,
    commissionAmount: commission,
    commissionShareOfGmv: gross > 0 ? (commission / gross) * 100 : 0,
    gmvPerCommissionReal: commission > 0 ? gross / commission : null,
    protectedPeterRevenueFloor: gross * (retainedMargin / 100),
    retainedMarginPercentage: retainedMargin,
  };
};
