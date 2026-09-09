import { normalizeCommercePaymentStatuses } from "./commercePaymentStatus";
import { paymentFailureGuidance } from "./paymentFailureGuidance";

describe("expired payment recovery", () => {
  test("turns expired order and payment into a terminal rejected state while preserving provider detail", () => {
    const result = normalizeCommercePaymentStatuses({
      order: { id: 10, status: "expired", status_detail: "expired" },
      payment: { id: 20, status: "expired", status_detail: "expired" },
    });

    expect(result.order.status).toBe("rejected");
    expect(result.payment.status).toBe("rejected");
    expect(result.order.status_detail).toBe("expired");
    expect(result.payment.status_detail).toBe("expired");
  });

  test("classifies normalized card transaction expiry separately from an expired card", () => {
    const normalized = normalizeCommercePaymentStatuses({
      payment: { status: "expired", status_detail: "expired" },
    });
    const guidance = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: normalized.payment,
    });

    expect(guidance.reason).toBe("payment_expired");
    expect(guidance.title).toContain("tentativa de pagamento expirou");
    expect(guidance.message).toContain("não será mais processada");
    expect(guidance.message).toContain("não significa que o cartão esteja vencido");
    expect(guidance.retryAllowed).toBe(true);
  });

  test("keeps cancelled and expired card outcome as 3DS authentication expiry", () => {
    const normalized = normalizeCommercePaymentStatuses({
      payment: { status: "canceled", status_detail: "expired" },
    });
    const guidance = paymentFailureGuidance({ method: "card", payment: normalized.payment });

    expect(guidance.reason).toBe("card_authentication_expired");
  });

  test("keeps an explicit expired-card provider detail blocked from identical retry", () => {
    const guidance = paymentFailureGuidance({
      method: "card",
      payment: { status: "rejected", status_detail: "cc_rejected_card_expired" },
    });

    expect(guidance.reason).toBe("expired_card");
    expect(guidance.retryAllowed).toBe(false);
  });
});
