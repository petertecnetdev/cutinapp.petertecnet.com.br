import { getCheckoutFunnelRecommendation } from "./checkoutFunnelRecommendations";

describe("getCheckoutFunnelRecommendation", () => {
  it("prioritizes checkout friction before payment attempts", () => {
    const result = getCheckoutFunnelRecommendation({ from: "checkout_opened", to: "payment_attempted", dropoff_journeys: 7, gmv_at_risk: 420, platform_contribution_at_risk: 31.5 });
    expect(result.key).toBe("reduce_pre_payment_friction");
    expect(result.priority).toBe("conversion");
    expect(result.platformContributionAtRisk).toBe(31.5);
  });

  it("recommends payment approval work after an attempted payment", () => {
    const result = getCheckoutFunnelRecommendation({ from: "payment_attempted", to: "payment_approved", dropoff_journeys: 2 });
    expect(result.key).toBe("improve_payment_approval");
    expect(result.metric).toContain("pagamento aprovado");
  });

  it("treats paid but unfulfilled journeys as a stability priority", () => {
    const result = getCheckoutFunnelRecommendation({ from: "payment_approved", to: "checkout_fulfilled", platform_contribution_at_risk: 12 });
    expect(result.key).toBe("stabilize_fulfillment");
    expect(result.priority).toBe("stability");
  });

  it("returns null for unknown or missing stages", () => {
    expect(getCheckoutFunnelRecommendation(null)).toBeNull();
    expect(getCheckoutFunnelRecommendation({ from: "unknown" })).toBeNull();
  });
});
