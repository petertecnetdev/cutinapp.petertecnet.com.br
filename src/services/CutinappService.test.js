import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

describe("CutinappService generic lifecycle contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses application-scoped generic event lifecycle endpoints", async () => {
    appApiClient.get.mockResolvedValue({ data: { impact: {} } });
    appApiClient.post.mockResolvedValue({ data: { message: "ok" } });

    await cutinappService.eventLifecycle(42);
    expect(appApiClient.get).toHaveBeenCalledWith("/events/42/lifecycle");

    await cutinappService.cancelEvent(42, { reason: "motivo válido" });
    expect(appApiClient.post).toHaveBeenCalledWith("/events/42/cancel", { reason: "motivo válido" });

    await cutinappService.postponeEvent(42, { reason: "motivo válido" });
    expect(appApiClient.post).toHaveBeenCalledWith("/events/42/postpone", { reason: "motivo válido" });

    await cutinappService.rescheduleEvent(42, {
      reason: "motivo válido",
      start_date: "2026-10-01T20:00",
      end_date: "2026-10-02T02:00",
    });
    expect(appApiClient.post).toHaveBeenCalledWith("/events/42/reschedule", {
      reason: "motivo válido",
      start_date: "2026-10-01T20:00",
      end_date: "2026-10-02T02:00",
    });
  });

  test("uses generic deletion and refund endpoints", async () => {
    appApiClient.delete.mockResolvedValue({ data: { message: "ok" } });
    appApiClient.post.mockResolvedValue({ data: { message: "ok" } });

    await cutinappService.deleteProduction(7);
    expect(appApiClient.delete).toHaveBeenCalledWith("/organizations/7");

    await cutinappService.deleteEvent(42);
    expect(appApiClient.delete).toHaveBeenCalledWith("/events/42");

    await cutinappService.requestRefund("order-public-id", { reason: "nova data incompatível" });
    expect(appApiClient.post).toHaveBeenCalledWith("/commerce/orders/order-public-id/refund", { reason: "nova data incompatível" });
  });
});
