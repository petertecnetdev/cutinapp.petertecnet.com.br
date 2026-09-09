import { normalizeCommercePaymentStatuses } from "./commercePaymentStatus";

describe("commerce payment status normalization", () => {
  test("normalizes canceled order and payment statuses to the checkout terminal spelling", () => {
    const result = normalizeCommercePaymentStatuses({
      order: { id: 10, status: "canceled" },
      payment: { id: 20, status: "canceled", status_detail: "expired" },
    });

    expect(result.order.status).toBe("cancelled");
    expect(result.payment.status).toBe("cancelled");
    expect(result.payment.status_detail).toBe("expired");
  });

  test("normalizes nested API data without changing pending states", () => {
    const result = normalizeCommercePaymentStatuses({
      data: { order: { status: "canceled" }, payment: { status: "pending" } },
    });

    expect(result.data.order.status).toBe("cancelled");
    expect(result.data.payment.status).toBe("pending");
  });

  test("does not mutate the source payload", () => {
    const source = { order: { status: "canceled" } };
    const result = normalizeCommercePaymentStatuses(source);
    expect(source.order.status).toBe("canceled");
    expect(result).not.toBe(source);
    expect(result.order).not.toBe(source.order);
  });
});
