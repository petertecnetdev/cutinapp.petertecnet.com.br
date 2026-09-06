import { estimatePendingRevenueOpportunity } from "./pendingRevenueOpportunity";

describe("estimatePendingRevenueOpportunity", () => {
  test("soma apenas pedidos pendentes e prioriza eventos pela receita recuperável", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      orders: [
        { status: "pending", total: 200, event: { id: 1, title: "Evento A" } },
        { status: "paid", total: 500, platform_fee: 50, event: { id: 1, title: "Evento A" } },
        { status: "pending", total: 100, platform_fee: 15, event: { id: 2, title: "Evento B" } },
      ],
    });

    expect(result.pendingCount).toBe(2);
    expect(result.pendingGmv).toBe(300);
    expect(result.estimatedPlatformRevenue).toBe(35);
    expect(result.events[0]).toMatchObject({ id: "1", pendingGmv: 200, estimatedPlatformRevenue: 20 });
    expect(result.events[1]).toMatchObject({ id: "2", pendingGmv: 100, estimatedPlatformRevenue: 15 });
  });

  test("ignora valores inválidos e nunca projeta receita negativa", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: -4,
      orders: [
        { status: "pending", total: -10, event_id: 1 },
        { status: "pending", total: "invalid", event_id: 2 },
      ],
    });

    expect(result.pendingCount).toBe(0);
    expect(result.pendingGmv).toBe(0);
    expect(result.estimatedPlatformRevenue).toBe(0);
    expect(result.events).toEqual([]);
  });
});
