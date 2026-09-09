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

  test("normalizes failed commerce statuses to the internal rejected terminal state", () => {
    const result = normalizeCommercePaymentStatuses({
      order: { id: 30, status: "failed" },
      payment: { id: 40, status: "failed", status_detail: "cc_rejected_3ds_challenge" },
    });

    expect(result.order.status).toBe("rejected");
    expect(result.payment.status).toBe("rejected");
    expect(result.payment.status_detail).toBe("cc_rejected_3ds_challenge");
  });

  test("normalizes processed/accredited commerce statuses to paid", () => {
    const result = normalizeCommercePaymentStatuses({
      order: { id: 50, status: "processed", status_detail: "accredited" },
      payment: { id: 60, status: "processed", statusDetail: "accredited" },
    });

    expect(result.order.status).toBe("paid");
    expect(result.payment.status).toBe("paid");
    expect(result.order.status_detail).toBe("accredited");
    expect(result.payment.statusDetail).toBe("accredited");
  });

  test("does not treat other processed outcomes as paid", () => {
    const result = normalizeCommercePaymentStatuses({
      order: { status: "processed", status_detail: "partially_refunded" },
      payment: { status: "processed", status_detail: "unknown" },
    });

    expect(result.order.status).toBe("processed");
    expect(result.payment.status).toBe("processed");
  });

  test("normalizes nested API data without changing pending states", () => {
    const result = normalizeCommercePaymentStatuses({
      data: { order: { status: "failed" }, payment: { status: "pending" } },
    });

    expect(result.data.order.status).toBe("rejected");
    expect(result.data.payment.status).toBe("pending");
  });

  test("normalizes nested processed/accredited states without changing the detail", () => {
    const result = normalizeCommercePaymentStatuses({
      data: { order: { status: "processed", status_detail: "accredited" }, payment: { status: "processing", status_detail: "in_review" } },
    });

    expect(result.data.order.status).toBe("paid");
    expect(result.data.order.status_detail).toBe("accredited");
    expect(result.data.payment.status).toBe("processing");
    expect(result.data.payment.status_detail).toBe("in_review");
  });

  test("does not mutate the source payload", () => {
    const source = { order: { status: "canceled" } };
    const result = normalizeCommercePaymentStatuses(source);
    expect(source.order.status).toBe("canceled");
    expect(result).not.toBe(source);
    expect(result.order).not.toBe(source.order);
  });
});
