import { simulateChannelVariableCost, simulatePromoterCommission } from "./channelCostSimulation";

describe("channel cost simulation", () => {
  const promoterChannel = {
    key: "promoter",
    gmv: 100,
    platformRevenue: 15,
    processorFeesBorneByPlatform: 2,
    variableChannelCosts: 7,
    promoterCommission: 4,
    minimumNetTakeRate: 2,
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
});
