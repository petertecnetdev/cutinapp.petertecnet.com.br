import { addOnEconomicPriorityScore, addOnMarginQualityBonus, compareAddOnOpportunities } from "./addOnOpportunity";

test("rewards only margin above the profitability floor", () => {
  expect(addOnMarginQualityBonus({ incrementalNetMargin: 2 })).toBe(0);
  expect(addOnMarginQualityBonus({ incrementalNetMargin: 10 })).toBe(8);
  expect(addOnMarginQualityBonus({ incrementalNetMargin: 10, minimumNetMargin: 5 })).toBe(5);
  expect(addOnEconomicPriorityScore({ incrementalNetRevenue: 100, evidenceFactor: 1, incrementalNetMargin: 2 })).toBe(100);
  expect(addOnEconomicPriorityScore({ incrementalNetRevenue: 95, evidenceFactor: 1, incrementalNetMargin: 10 })).toBeCloseTo(102.6, 8);
});

test("allows materially better margin to win when net revenue is close", () => {
  const opportunities = [
    { id: "higher-revenue-thin-margin", addOnProfitable: true, incrementalNetRevenue: 100, evidenceFactor: 1, incrementalNetMargin: 2 },
    { id: "healthier-margin", addOnProfitable: true, incrementalNetRevenue: 95, evidenceFactor: 1, incrementalNetMargin: 10 },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual([
    "healthier-margin",
    "higher-revenue-thin-margin",
  ]);
});

test("does not let tiny high-margin upside beat substantially larger net revenue", () => {
  const opportunities = [
    { id: "large-net-revenue", addOnProfitable: true, incrementalNetRevenue: 100, evidenceFactor: 1, incrementalNetMargin: 2 },
    { id: "tiny-high-margin", addOnProfitable: true, incrementalNetRevenue: 40, evidenceFactor: 1, incrementalNetMargin: 100 },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual([
    "large-net-revenue",
    "tiny-high-margin",
  ]);
});

test("keeps evidence discount in the economic priority score", () => {
  expect(addOnEconomicPriorityScore({ incrementalNetRevenue: 100, evidenceFactor: 0.25, incrementalNetMargin: 20 })).toBe(29.5);
  expect(addOnEconomicPriorityScore({ incrementalNetRevenue: 100, evidenceFactor: 0.25, evidenceAdjusted: true, incrementalNetMargin: 20 })).toBe(118);
});
