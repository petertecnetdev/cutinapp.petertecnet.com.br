import {
  compareSmartRanks,
  eventAlerts,
  eventHealth,
  eventOperationalMetrics,
  eventPerformance,
  eventTemporalGroup,
  smartEventRank,
  weekdayShortLabel,
} from "./eventManagerInsights";

const baseEvent = (overrides = {}) => ({
  id: 10,
  title: "Sextou Cutinapp",
  image: "images/events/sextou.webp",
  start_date: "2099-09-11T22:00:00-03:00",
  end_date: "2099-09-12T04:00:00-03:00",
  venue: "La Fyesta Pub",
  city: "Goiânia",
  is_published: true,
  is_cancelled: false,
  tickets_count: 2,
  available_tickets_count: 2,
  operational_metrics: {
    paid_orders_count: 8,
    pending_orders_count: 1,
    gross_sales: 920,
    gross_sales_today: 180,
    tickets_sold: 16,
    passes_issued: 18,
    ticket_capacity: 100,
    tickets_remaining: 82,
    sell_through_rate: 16,
    inventory_utilization_rate: 18,
    checked_in_count: 0,
    checkin_rate: 0,
    views_count: 120,
    conversion_rate: 6.67,
    agenda_days: [5],
    agenda_active: true,
  },
  ...overrides,
});

describe("eventManagerInsights", () => {
  test("normalizes operational metrics without leaking undefined values", () => {
    expect(eventOperationalMetrics(baseEvent())).toMatchObject({
      grossSales: 920,
      ticketsSold: 16,
      passesIssued: 18,
      ticketsReserved: 0,
      ticketCapacity: 100,
      ticketsRemaining: 82,
      views: 120,
      agendaDays: [5],
      agendaActive: true,
    });

    expect(eventOperationalMetrics({})).toMatchObject({
      grossSales: 0,
      ticketsSold: 0,
      passesIssued: 0,
      ticketsReserved: 0,
      views: 0,
      agendaDays: [],
      agendaActive: false,
    });
  });

  test("considers the event flyer itself in the health score", () => {
    const healthy = eventHealth(baseEvent());
    const withoutFlyer = eventHealth(baseEvent({ image: null }));

    expect(healthy.score).toBeGreaterThan(withoutFlyer.score);
    expect(healthy.score).toBeGreaterThanOrEqual(85);
  });

  test("flags published events without paid sales", () => {
    const event = baseEvent({
      operational_metrics: {
        ...baseEvent().operational_metrics,
        paid_orders_count: 0,
        tickets_sold: 0,
        gross_sales: 0,
        views_count: 4,
        conversion_rate: 0,
      },
    });

    expect(eventPerformance(event).key).toBe("no_sales");
    expect(eventAlerts(event).some((alert) => alert.key === "published-no-sales")).toBe(true);
  });

  test("detects strong sales and nearly sold out inventory", () => {
    const almostSoldOut = baseEvent({
      operational_metrics: {
        ...baseEvent().operational_metrics,
        tickets_sold: 86,
        passes_issued: 90,
        tickets_remaining: 10,
        sell_through_rate: 86,
        inventory_utilization_rate: 90,
      },
    });

    expect(eventPerformance(almostSoldOut).key).toBe("almost_sold_out");
    expect(eventAlerts(almostSoldOut).some((alert) => alert.key === "almost-sold-out")).toBe(true);
  });

  test("groups past and cancelled events predictably", () => {
    const past = baseEvent({
      start_date: "2020-01-01T20:00:00-03:00",
      end_date: "2020-01-02T03:00:00-03:00",
    });
    const cancelled = baseEvent({ is_cancelled: true });

    expect(eventTemporalGroup(past).key).toBe("past");
    expect(eventTemporalGroup(cancelled).key).toBe("cancelled");
  });

  test("puts pinned events ahead when smart sorting otherwise ties", () => {
    const event = baseEvent();
    const pinned = smartEventRank(event, true);
    const regular = smartEventRank(event, false);

    expect(compareSmartRanks(pinned, regular)).toBeLessThan(0);
  });

  test("renders weekday labels used by weekly agenda badges", () => {
    expect(weekdayShortLabel(0)).toBe("Dom");
    expect(weekdayShortLabel(5)).toBe("Sex");
  });
});
