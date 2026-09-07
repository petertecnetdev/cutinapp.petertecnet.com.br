export const estimateAddOnAttachmentOpportunity = ({ paidCount, addOnOrders, averageAddOnValue, benchmarkAddOnValue = 0, takeRate, upliftPoints = 10 }) => {
  const paid = Math.max(0, Number(paidCount || 0));
  const attached = Math.max(0, Number(addOnOrders || 0));
  const observedAverage = Math.max(0, Number(averageAddOnValue || 0));
  const benchmarkAverage = Math.max(0, Number(benchmarkAddOnValue || 0));
  const average = observedAverage > 0 ? observedAverage : benchmarkAverage;
  const rate = Math.max(0, Number(takeRate || 0));
  const availableOrders = Math.max(0, paid - attached);
  const incrementalOrders = Math.min(availableOrders, paid * (Math.max(0, Number(upliftPoints || 0)) / 100));
  const incrementalGmv = incrementalOrders * average;
  return { incrementalOrders, incrementalGmv, incrementalPlatformRevenue: incrementalGmv * (rate / 100), benchmarkUsed: observedAverage <= 0 && benchmarkAverage > 0 };
};

export const suggestedAddOnStock = (incrementalOrders, maxStock = 100, demandBufferPercentage = 20) => {
  const projected = Math.max(0, Number(incrementalOrders || 0));
  if (projected <= 0) return 0;
  const boundedMax = Math.max(1, Math.floor(Number(maxStock || 100)));
  const buffer = Math.max(0, Math.min(100, Number(demandBufferPercentage || 0)));
  const bufferedProjection = projected * (1 + (buffer / 100));
  return Math.min(boundedMax, Math.max(1, Math.ceil(bufferedProjection)));
};

export const weightedAverageAddOnUnitPrice = (items = []) => {
  const totals = (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const quantity = Math.max(0, Number(item?.quantity || 0));
    const unitPrice = Math.max(0, Number(item?.unit_price || 0));
    if (quantity <= 0 || unitPrice <= 0) return acc;
    acc.units += quantity;
    acc.revenue += quantity * unitPrice;
    return acc;
  }, { units: 0, revenue: 0 });

  return totals.units > 0 ? totals.revenue / totals.units : 0;
};

export const addOnMonetizationEfficiency = ({
  incrementalNetRevenue = 0,
  incrementalOrders = 0,
  attachmentUpliftPoints = 10,
} = {}) => {
  const netRevenue = Math.max(0, Number(incrementalNetRevenue || 0));
  const orders = Math.max(0, Number(incrementalOrders || 0));
  const upliftPoints = Math.max(0, Number(attachmentUpliftPoints || 0));

  return {
    netRevenuePerAttachmentPoint: upliftPoints > 0 ? netRevenue / upliftPoints : 0,
    netRevenuePerIncrementalOrder: orders > 0 ? netRevenue / orders : 0,
  };
};

export const addOnMarginGuard = ({ incrementalGmv = 0, incrementalNetRevenue = 0, minimumNetMargin = 2 } = {}) => {
  const gmv = Math.max(0, Number(incrementalGmv || 0));
  const netRevenue = Math.max(0, Number(incrementalNetRevenue || 0));
  const minimumMargin = Math.max(0, Math.min(100, Number(minimumNetMargin || 0)));
  const netMargin = gmv > 0 ? (netRevenue / gmv) * 100 : 0;

  return {
    profitable: gmv > 0 && netRevenue > 0 && netMargin >= minimumMargin,
    netMargin,
    minimumNetMargin: minimumMargin,
  };
};
