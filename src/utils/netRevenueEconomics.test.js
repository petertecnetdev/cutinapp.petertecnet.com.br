import { estimateNetRevenueEconomics } from "./netRevenueEconomics";

test("calculates net take rate and net revenue per paid order", () => {
  expect(estimateNetRevenueEconomics({
    grossRevenue: 10000,
    platformRevenue: 1000,
    processorFees: 250,
    paidOrders: 50,
  })).toMatchObject({
    netRevenue: 750,
    netTakeRate: 7.5,
    processingRateOnGmv: 2.5,
    processingShareOfPlatformRevenue: 25,
    netRevenuePerPaidOrder: 15,
    contributionRatio: 0.75,
  });
});

test("estimates at-risk and recovered net revenue from observed contribution margin", () => {
  expect(estimateNetRevenueEconomics({
    platformRevenue: 800,
    processorFees: 200,
    platformRevenueAtRisk: 160,
    recoveredPlatformRevenue: 80,
  })).toMatchObject({
    estimatedNetRevenueAtRisk: 120,
    estimatedRecoveredNetRevenue: 60,
  });
});

test("stays safe with empty or malformed values", () => {
  expect(estimateNetRevenueEconomics({
    grossRevenue: "invalid",
    platformRevenue: 0,
    processorFees: 30,
    paidOrders: 0,
    platformRevenueAtRisk: 100,
  })).toMatchObject({
    netTakeRate: 0,
    processingShareOfPlatformRevenue: 0,
    netRevenuePerPaidOrder: 0,
    estimatedNetRevenueAtRisk: 0,
  });
});
