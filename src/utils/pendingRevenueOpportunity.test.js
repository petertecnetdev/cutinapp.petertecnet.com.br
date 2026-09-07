import { estimatePendingRevenueOpportunity } from "./pendingRevenueOpportunity";

describe("estimatePendingRevenueOpportunity", () => {
  const now = new Date("2026-09-06T23:00:00Z").getTime();

  test("mantém totais históricos, mas expõe como recuperável somente pendências recentes", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      now,
      orders: [
        { status: "pending", total: 200, created_at: "2026-09-06T22:00:00Z", event: { id: 1, title: "Evento A" } },
        { status: "paid", total: 500, platform_fee: 50, created_at: "2026-09-06T21:00:00Z", event: { id: 1, title: "Evento A" } },
        { status: "pending", total: 100, platform_fee: 15, created_at: "2026-09-04T20:00:00Z", event: { id: 2, title: "Evento B" } },
      ],
    });

    expect(result.totalPendingCount).toBe(2);
    expect(result.totalPendingGmv).toBe(300);
    expect(result.totalEstimatedPlatformRevenue).toBe(35);
    expect(result.pendingCount).toBe(1);
    expect(result.pendingGmv).toBe(200);
    expect(result.estimatedPlatformRevenue).toBe(20);
    expect(result.stalePendingCount).toBe(1);
    expect(result.stalePendingGmv).toBe(100);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: "1", pendingGmv: 200, estimatedPlatformRevenue: 20, totalPendingGmv: 200 });
  });

  test("estima contribuição líquida recuperável sem alterar a receita bruta projetada", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      fallbackContributionRatio: 0.72,
      now,
      orders: [
        { status: "pending", total: 200, created_at: "2026-09-06T22:00:00Z", event: { id: 1, title: "Evento A" } },
        { status: "pending", total: 100, platform_fee: 15, created_at: "2026-09-06T22:10:00Z", event: { id: 2, title: "Evento B" } },
      ],
    });

    expect(result.estimatedPlatformRevenue).toBe(35);
    expect(result.estimatedNetPlatformRevenue).toBeCloseTo(25.2);
    expect(result.totalEstimatedNetPlatformRevenue).toBeCloseTo(25.2);
    expect(result.contributionRatio).toBe(0.72);
    expect(result.events[0]).toMatchObject({ id: "1", estimatedPlatformRevenue: 20 });
    expect(result.events[0].estimatedNetPlatformRevenue).toBeCloseTo(14.4);
  });

  test("limita margem estimada ao intervalo seguro entre zero e cem por cento", () => {
    const baseOrder = { status: "pending", total: 100, platform_fee: 10, created_at: "2026-09-06T22:00:00Z", event_id: 1 };

    expect(estimatePendingRevenueOpportunity({ orders: [baseOrder], fallbackContributionRatio: 5, now }).estimatedNetPlatformRevenue).toBe(10);
    expect(estimatePendingRevenueOpportunity({ orders: [baseOrder], fallbackContributionRatio: -1, now }).estimatedNetPlatformRevenue).toBe(0);
  });

  test("usa expiração real futura mesmo quando o pedido é mais antigo que a heurística", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      now,
      orders: [{
        status: "pending",
        total: 300,
        created_at: "2026-09-04T20:00:00Z",
        expires_at: "2026-09-07T00:00:00Z",
        event: { id: 3, title: "Evento C" },
      }],
    });

    expect(result.pendingCount).toBe(1);
    expect(result.pendingGmv).toBe(300);
    expect(result.realExpiryPendingCount).toBe(1);
    expect(result.stalePendingCount).toBe(0);
  });

  test("não promove cobrança expirada mesmo quando foi criada recentemente", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 10,
      now,
      orders: [{
        status: "pending",
        total: 180,
        created_at: "2026-09-06T22:30:00Z",
        expires_at: "2026-09-06T22:59:00Z",
        event: { id: 4, title: "Evento D" },
      }],
    });

    expect(result.pendingCount).toBe(0);
    expect(result.pendingGmv).toBe(0);
    expect(result.stalePendingCount).toBe(1);
    expect(result.expiredPaymentCount).toBe(1);
    expect(result.events).toEqual([]);
  });

  test("mantém pedidos sem data no total sem promovê-los para recuperação recente", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: 8,
      now,
      orders: [{ status: "pending", total: 250, event_id: 1 }],
    });

    expect(result.totalPendingGmv).toBe(250);
    expect(result.pendingGmv).toBe(0);
    expect(result.unknownAgeCount).toBe(1);
    expect(result.events).toEqual([]);
  });

  test("ignora valores inválidos e nunca projeta receita negativa", () => {
    const result = estimatePendingRevenueOpportunity({
      fallbackTakeRate: -4,
      fallbackContributionRatio: -2,
      now,
      orders: [
        { status: "pending", total: -10, created_at: "2026-09-06T22:00:00Z", event_id: 1 },
        { status: "pending", total: "invalid", created_at: "2026-09-06T22:00:00Z", event_id: 2 },
      ],
    });

    expect(result.pendingCount).toBe(0);
    expect(result.pendingGmv).toBe(0);
    expect(result.estimatedPlatformRevenue).toBe(0);
    expect(result.estimatedNetPlatformRevenue).toBe(0);
    expect(result.totalPendingGmv).toBe(0);
    expect(result.events).toEqual([]);
  });
});