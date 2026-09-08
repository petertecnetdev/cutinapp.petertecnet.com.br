import {
  assessChannelCostProposal,
  assessPromoterCommissionProposal,
  simulateChannelVariableCost,
  simulatePromoterCommission,
} from "./channelCostSimulation";

describe("channel cost simulation", () => {
  const promoterChannel = {
    key: "promoter",
    gmv: 100,
    platformRevenue: 15,
    processorFeesBorneByPlatform: 2,
    variableChannelCosts: 7,
    promoterCommission: 4,
    minimumNetTakeRate: 2,
    netRevenue: 6,
    netRevenueHeadroomAboveFloor: 4,
  };

  test("marks a promoter commission proposal as safe while preserving the take-rate floor", () => {
    const simulation = simulatePromoterCommission(promoterChannel, { commissionRate: 8 });

    expect(simulation.proposedPromoterCommission).toBe(8);
    expect(simulation.otherVariableCosts).toBe(3);
    expect(simulation.proposedTotalVariableCosts).toBe(11);
    expect(simulation.projectedNetRevenue).toBe(2);
    expect(simulation.projectedNetTakeRate).toBe(2);
    expect(simulation.preservesFloor).toBe(true);
    expect(simulation.status).toBe("safe");
  });

  test("flags a promoter commission proposal that would cross the take-rate floor", () => {
    const simulation = simulatePromoterCommission(promoterChannel, { commissionRate: 9 });

    expect(simulation.proposedPromoterCommission).toBe(9);
    expect(simulation.projectedNetRevenue).toBe(1);
    expect(simulation.projectedNetTakeRate).toBe(1);
    expect(simulation.projectedHeadroomAboveFloor).toBe(0);
    expect(simulation.preservesFloor).toBe(false);
    expect(simulation.status).toBe("below_floor");
  });

  test("simulates generic campaign or coupon cost without mutating channel inputs", () => {
    const channel = {
      key: "campaign",
      gmv: 200,
      platformRevenue: 24,
      processorFeesBorneByPlatform: 4,
      variableChannelCosts: 6,
      minimumNetTakeRate: 3,
    };

    const simulation = simulateChannelVariableCost(channel, { variableCostRate: 5 });

    expect(simulation.proposedTotalVariableCosts).toBe(10);
    expect(simulation.incrementalVariableCost).toBe(4);
    expect(simulation.projectedNetRevenue).toBe(10);
    expect(simulation.projectedNetTakeRate).toBe(5);
    expect(simulation.projectedHeadroomAboveFloor).toBe(4);
    expect(channel.variableChannelCosts).toBe(6);
  });

  test("recommends promoter commission only while preserving the margin reserve and efficient payback", () => {
    const recommended = assessPromoterCommissionProposal(
      promoterChannel,
      { commissionRate: 6 },
      { safetyReserveFactor: 0.5 },
    );
    const caution = assessPromoterCommissionProposal(
      promoterChannel,
      { commissionRate: 7 },
      { safetyReserveFactor: 0.5 },
    );

    expect(recommended.minimumHeadroomReserve).toBe(2);
    expect(recommended.maximumRecommendedPromoterCommission).toBe(6);
    expect(recommended.maximumRecommendedPromoterCommissionRate).toBe(6);
    expect(recommended.projectedHeadroomAboveFloor).toBe(2);
    expect(recommended.requiredIncrementalNetRevenue).toBe(2);
    expect(recommended.requiredGmvUpliftRate).toBeCloseTo(33.3333333333);
    expect(recommended.paybackStatus).toBe("efficient");
    expect(recommended.decisionStatus).toBe("recommended");
    expect(recommended.recommendedToApply).toBe(true);

    expect(caution.preservesFloor).toBe(true);
    expect(caution.preservesSafetyReserve).toBe(false);
    expect(caution.decisionStatus).toBe("caution");
    expect(caution.canApply).toBe(true);
    expect(caution.recommendedToApply).toBe(false);
  });

  test("downgrades a margin-safe promoter proposal when incremental GMV payback is too demanding", () => {
    const assessment = assessPromoterCommissionProposal(
      promoterChannel,
      { commissionRate: 6 },
      { safetyReserveFactor: 0.5, maxRequiredGmvUpliftRate: 25 },
    );

    expect(assessment.preservesFloor).toBe(true);
    expect(assessment.preservesSafetyReserve).toBe(true);
    expect(assessment.requiredIncrementalGmv).toBeCloseTo(33.3333333333);
    expect(assessment.requiredGmvUpliftRate).toBeCloseTo(33.3333333333);
    expect(assessment.maxRequiredGmvUpliftRate).toBe(25);
    expect(assessment.paybackStatus).toBe("high_burden");
    expect(assessment.decisionStatus).toBe("caution");
    expect(assessment.canApply).toBe(true);
    expect(assessment.recommendedToApply).toBe(false);
  });

  test("can require positive incremental net return before recommending acquisition spend", () => {
    const assessment = assessPromoterCommissionProposal(
      promoterChannel,
      { commissionRate: 5 },
      {
        safetyReserveFactor: 0.5,
        maxRequiredGmvUpliftRate: 40,
        minProjectedNetReturnPerReal: 1,
      },
    );

    expect(assessment.requiredIncrementalNetRevenue).toBe(2);
    expect(assessment.requiredIncrementalGmv).toBeCloseTo(33.3333333333);
    expect(assessment.requiredGmvUpliftRate).toBeCloseTo(33.3333333333);
    expect(assessment.paybackStatus).toBe("efficient");
    expect(assessment.recommendedToApply).toBe(true);
  });

  test("blocks promoter commission that breaches the hard take-rate floor", () => {
    const assessment = assessPromoterCommissionProposal(
      promoterChannel,
      { commissionRate: 9 },
      { safetyReserveFactor: 0.5 },
    );

    expect(assessment.decisionStatus).toBe("blocked");
    expect(assessment.canApply).toBe(false);
    expect(assessment.recommendedToApply).toBe(false);
  });

  test("exposes a generic recommended channel cost ceiling with configurable reserve", () => {
    const channel = {
      key: "campaign",
      gmv: 200,
      platformRevenue: 24,
      processorFeesBorneByPlatform: 4,
      variableChannelCosts: 6,
      minimumNetTakeRate: 3,
      netRevenue: 14,
      netRevenueHeadroomAboveFloor: 8,
    };

    const assessment = assessChannelCostProposal(
      channel,
      { totalVariableCosts: 10 },
      { safetyReserveFactor: 0.5 },
    );

    expect(assessment.minimumHeadroomReserve).toBe(4);
    expect(assessment.maximumRecommendedVariableCosts).toBe(10);
    expect(assessment.maximumRecommendedVariableCostRate).toBe(5);
    expect(assessment.projectedHeadroomAboveFloor).toBe(4);
    expect(assessment.requiredIncrementalGmv).toBeCloseTo(57.1428571429);
    expect(assessment.requiredGmvUpliftRate).toBeCloseTo(28.5714285714);
    expect(assessment.paybackStatus).toBe("efficient");
    expect(assessment.decisionStatus).toBe("recommended");
  });
});
