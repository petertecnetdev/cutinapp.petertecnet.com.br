import { estimateNetRevenueEconomics, processorFeesBorneByPlatformForOrder } from "./netRevenueEconomics";

const amount = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizedText = (value) => String(value || "").trim().toLowerCase();
const boundedRate = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
};

const attributionForOrder = (order = {}) => {
  const metadata = order.metadata || {};
  const promoterId = order.promoter_id || order.promoter?.id || metadata.promoter_id || metadata.promoter?.id;
  const couponCode = order.coupon_code || order.coupon?.code || metadata.coupon_code || metadata.coupon?.code;
  const explicit = normalizedText(order.sales_channel || order.channel || metadata.sales_channel || metadata.channel);

  if (promoterId) return { key: "promoter", label: "Promoter" };
  if (couponCode) return { key: "coupon", label: "Cupom" };
  if (["promoter", "affiliate", "referral"].includes(explicit)) return { key: "promoter", label: "Promoter" };
  if (["coupon", "voucher", "discount"].includes(explicit)) return { key: "coupon", label: "Cupom" };
  if (["campaign", "paid", "boost", "sponsored"].includes(explicit)) return { key: "campaign", label: "Campanha" };
  return { key: "organic", label: "Orgânico" };
};

export const summarizeRevenueByChannel = (orders = [], options = {}) => {
  const grouped = new Map();
  const minNetTakeRate = amount(options.minNetTakeRate ?? 2);
  const reinvestmentSafetyFactor = boundedRate(options.reinvestmentSafetyFactor, 0.5);
  const minOrdersForScale = Math.max(1, Math.floor(amount(options.minOrdersForScale ?? 5)));
  const minTakeRateGapForScale = amount(options.minTakeRateGapForScale ?? 2);

  (Array.isArray(orders) ? orders : [])
    .filter((order) => normalizedText(order?.status || order?.payment_status) === "paid")
    .forEach((order) => {
      const attribution = attributionForOrder(order);
      const current = grouped.get(attribution.key) || {
        key: attribution.key,
        label: attribution.label,
        paidOrders: 0,
        gmv: 0,
        platformRevenue: 0,
        processorFeesBorneByPlatform: 0,
        promoterCommission: 0,
        discountAmount: 0,
      };

      current.paidOrders += 1;
      current.gmv += amount(order.total || order.total_price || order.gross_amount);
      current.platformRevenue += amount(order.platform_fee || order.platform_revenue);
      current.processorFeesBorneByPlatform += processorFeesBorneByPlatformForOrder({
        processorFee: order.processor_fee,
        settlementMode: order.metadata?.settlement_mode,
      });
      current.promoterCommission += amount(order.promoter_commission || order.commission_amount || order.metadata?.promoter_commission);
      current.discountAmount += amount(order.discount_amount || order.coupon_discount || order.metadata?.discount_amount);
      grouped.set(attribution.key, current);
    });

  return Array.from(grouped.values())
    .map((channel) => {
      const baseEconomics = estimateNetRevenueEconomics({
        grossRevenue: channel.gmv,
        platformRevenue: channel.platformRevenue,
        processorFees: channel.processorFeesBorneByPlatform,
        processorFeesBorneByPlatform: channel.processorFeesBorneByPlatform,
        paidOrders: channel.paidOrders,
      });
      const variableChannelCosts = channel.promoterCommission + channel.discountAmount;
      const netRevenue = Math.max(0, baseEconomics.netRevenue - variableChannelCosts);
      const netTakeRate = channel.gmv > 0 ? (netRevenue / channel.gmv) * 100 : 0;
      const contributionMargin = channel.platformRevenue > 0 ? (netRevenue / channel.platformRevenue) * 100 : 0;
      const minimumNetRevenue = channel.gmv * (minNetTakeRate / 100);
      const netRevenueHeadroomAboveFloor = Math.max(0, netRevenue - minimumNetRevenue);
      const netTakeRateGap = netTakeRate - minNetTakeRate;
      const safeReinvestmentBudget = netRevenueHeadroomAboveFloor * reinvestmentSafetyFactor;
      const safeReinvestmentPerOrder = channel.paidOrders > 0 ? safeReinvestmentBudget / channel.paidOrders : 0;
      const netRevenuePerOrder = channel.paidOrders > 0 ? netRevenue / channel.paidOrders : 0;
      const reinvestmentBreakEvenGmv = safeReinvestmentBudget > 0 && netTakeRate > 0
        ? safeReinvestmentBudget / (netTakeRate / 100)
        : 0;
      const reinvestmentBreakEvenOrders = safeReinvestmentBudget > 0 && netRevenuePerOrder > 0
        ? safeReinvestmentBudget / netRevenuePerOrder
        : 0;
      const requiredGmvUpliftRate = channel.gmv > 0 ? (reinvestmentBreakEvenGmv / channel.gmv) * 100 : 0;
      const evidenceStatus = channel.paidOrders >= minOrdersForScale ? "sufficient" : "limited";
      const recommendedAction = netTakeRate < minNetTakeRate
        ? "reduce_cost"
        : evidenceStatus === "limited"
          ? "test"
          : netTakeRateGap >= minTakeRateGapForScale && safeReinvestmentBudget > 0
            ? "scale"
            : "maintain";

      return {
        ...channel,
        variableChannelCosts,
        channelCostRate: channel.gmv > 0 ? (variableChannelCosts / channel.gmv) * 100 : 0,
        netRevenue,
        netTakeRate,
        contributionMargin,
        averageTicket: channel.paidOrders > 0 ? channel.gmv / channel.paidOrders : 0,
        netRevenuePerOrder,
        minimumNetTakeRate: minNetTakeRate,
        minimumNetRevenue,
        netRevenueHeadroomAboveFloor,
        additionalCostCapacityPerOrder: channel.paidOrders > 0 ? netRevenueHeadroomAboveFloor / channel.paidOrders : 0,
        netTakeRateGap,
        economicStatus: netTakeRate >= minNetTakeRate ? "healthy" : "below_floor",
        reinvestmentSafetyFactor,
        safeReinvestmentBudget,
        safeReinvestmentPerOrder,
        reinvestmentBreakEvenGmv,
        reinvestmentBreakEvenOrders,
        requiredGmvUpliftRate,
        evidenceStatus,
        recommendedAction,
      };
    })
    .sort((a, b) => b.netRevenue - a.netRevenue || b.netTakeRate - a.netTakeRate || b.gmv - a.gmv);
};

export { attributionForOrder };
