import { hasSellableTickets, isEventPaymentReady, requiresPaymentSetup, sellableTicketCount } from "./eventSalesReadiness";

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
    expect(isEventPaymentReady({ tickets_count: 2 })).toBe(true);
  });

  test("requires payment setup only when a sellable paid lot exists", () => {
    expect(requiresPaymentSetup({ available_paid_tickets_count: 1 })).toBe(true);
    expect(requiresPaymentSetup({ available_paid_tickets_count: 0 })).toBe(false);
  });

  test("blocks paid-event readiness when the generic payment capability is unavailable", () => {
    expect(isEventPaymentReady({
      available_paid_tickets_count: 1,
      payment_readiness: { available: false },
    })).toBe(false);
    expect(isEventPaymentReady({
      available_paid_tickets_count: 1,
      payment_readiness: { available: true },
    })).toBe(true);
  });

  test("keeps free events ready without a payment provider", () => {
    expect(isEventPaymentReady({
      available_paid_tickets_count: 0,
      payment_readiness: { available: false },
    })).toBe(true);
  });
});
