import { hasSellableTickets, sellableTicketCount } from "./eventSalesReadiness";

describe("eventSalesReadiness", () => {
  test("uses the API sellable count even when configured lots exist", () => {
    const event = { tickets_count: 3, available_tickets_count: 0 };
    expect(sellableTicketCount(event)).toBe(0);
    expect(hasSellableTickets(event)).toBe(false);
  });

  test("recognizes an available lot", () => {
    const event = { tickets_count: 3, available_tickets_count: 1 };
    expect(sellableTicketCount(event)).toBe(1);
    expect(hasSellableTickets(event)).toBe(true);
  });

  test("keeps backward compatibility while the API field is unavailable", () => {
    expect(sellableTicketCount({ tickets_count: 2 })).toBe(2);
    expect(hasSellableTickets({ tickets_count: 2 })).toBe(true);
  });
});
