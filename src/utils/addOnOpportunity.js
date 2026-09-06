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
