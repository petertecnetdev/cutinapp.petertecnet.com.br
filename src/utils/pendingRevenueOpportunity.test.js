import { estimatePendingRevenueOpportunity } from "./pendingRevenueOpportunity";

describe("estimatePendingRevenueOpportunity", () => {
  const now = new Date("2026-09-06T23:00:00Z").getTime();

  test("soma apenas pedidos pendentes e prioriza eventos pela receita recuperável recente", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      now,
      orders: [
        { status: "pending", total: 200, created_at: "2026-09-06T22:00:00Z", event: { id: 1, title: "Evento A" } },
        { status: "paid", total: 500, platform_fee: 50, created_at: "2026-09-06T21:00:00Z", event: { id: 1, title: "Evento A" } },
        { status: "pending", total: 100, platform_fee: 15, created_at: "2026-09-04T20:00:00Z", event: { id: 2, title: "Evento B" } },
      ],
    });

    expect(result.pendingCount).toBe(2);
    expect(result.pendingGmv).toBe(300);
    expect(result.estimatedPlatformRevenue).toBe(35);
    expect(result.freshPendingCount).toBe(1);
    expect(result.freshPendingGmv).toBe(200);
    expect(result.freshEstimatedPlatformRevenue).toBe(20);
    expect(result.stalePendingCount).toBe(1);
    expect(result.stalePendingGmv).toBe(100);
    expect(result.events[0]).toMatchObject({ id: "1", freshPendingGmv: 200, freshEstimatedPlatformRevenue: 20 });
    expect(result.events[1]).toMatchObject({ id: "2", stalePendingGmv: 100, freshPendingGmv: 0 });
  });

  test("mantém pedidos sem data no total sem tratá-los como recentes", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 8,
      now,
      orders: [{ status: "pending", total: 250, event_id: 1 }],
    });

    expect(result.pendingGmv).toBe(250);
    expect(result.freshPendingGmv).toBe(0);
    expect(result.stalePendingGmv).toBe(0);
    expect(result.unknownAgeCount).toBe(1);
  });

  test("ignora valores inválidos e nunca projeta receita negativa", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: -4,
      now,
      orders: [
        { status: "pending", total: -10, created_at: "2026-09-06T22:00:00Z", event_id: 1 },
        { status: "pending", total: "invalid", created_at: "2026-09-06T22:00:00Z", event_id: 2 },
      ],
    });

    expect(result.pendingCount).toBe(0);
    expect(result.pendingGmv).toBe(0);
    expect(result.estimatedPlatformRevenue).toBe(0);
    expect(result.events).toEqual([]);
  });
});
