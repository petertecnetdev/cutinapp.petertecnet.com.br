import { nextProducerActivationRoute } from "./producerActivationRoute";

describe("nextProducerActivationRoute", () => {
  test("leva lote pago diretamente para gestão com publicação imediata disponível", () => {
    expect(nextProducerActivationRoute({ eventId: 42, ticketId: 7, ticketType: "paid" }))
      .toBe("/event/manage?activation=first-ticket&eventId=42&created=7");
  });

  test("mantém cortesia no fluxo específico de cortesias", () => {
    expect(nextProducerActivationRoute({ eventId: 42, ticketId: 8, ticketType: "free" }))
      .toBe("/event/42/courtesies?activation=first-ticket&eventId=42&created=8");
  });

  test("cai para gestão de eventos sem evento válido", () => {
    expect(nextProducerActivationRoute({ eventId: 0, ticketId: 8, ticketType: "paid" }))
      .toBe("/event/manage");
  });
});