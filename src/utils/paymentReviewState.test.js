import { paymentReviewState } from "./paymentReviewState";

describe("paymentReviewState", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.PeterTecnetTelemetry = { track: jest.fn() };
  });

  afterEach(() => {
    delete window.PeterTecnetTelemetry;
  });

  test("recognizes a Mercado Pago manual review on the payment", () => {
    expect(paymentReviewState({
      payment: { status: "processing", status_detail: "pending_review_manual" },
    })).toEqual({
      underReview: true,
      status: "processing",
      detail: "pending_review_manual",
    });
  });

  test("recognizes legacy in_review detail from provider payload", () => {
    const result = paymentReviewState({
      payment: { provider_payload: { status: "processing", status_detail: "in_review" } },
    });
    expect(result.underReview).toBe(true);
    expect(result.detail).toBe("in_review");
  });

  test("recognizes a review exposed at order level", () => {
    const result = paymentReviewState({
      order: { status: "processing", status_detail: "pending_review_manual" },
      payment: { status: "processing", status_detail: "in_process" },
    });
    expect(result.underReview).toBe(true);
    expect(result.detail).toBe("pending_review_manual");
  });

  test("does not classify normal processing as manual review", () => {
    expect(paymentReviewState({
      payment: { status: "processing", status_detail: "in_process" },
    }).underReview).toBe(false);
  });

  test("does not classify terminal or approved states as review", () => {
    expect(paymentReviewState({ payment: { status: "paid" } }).underReview).toBe(false);
    expect(paymentReviewState({ payment: { status: "rejected", status_detail: "cc_rejected_high_risk" } }).underReview).toBe(false);
  });

  test("emits one resolved event when a reviewed payment becomes approved", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    paymentReviewState({
      order: { public_id: "ord-review-1", status: "processing", total: 249.9 },
      payment: { status: "processing", status_detail: "pending_review_manual" },
    });

    now.mockReturnValueOnce(5500);
    paymentReviewState({
      order: { public_id: "ord-review-1", status: "paid", total: 249.9 },
      payment: { status: "paid", status_detail: "accredited" },
    });

    expect(window.PeterTecnetTelemetry.track).toHaveBeenCalledWith("payment_review_resolved", expect.objectContaining({
      target: "ord-review-1",
      metadata: expect.objectContaining({
        amount: 249.9,
        order_status: "paid",
        review_duration_ms: 4500,
        review_status_detail: "pending_review_manual",
        status_detail: "accredited",
        outcome: "approved",
      }),
    }));
    expect(window.sessionStorage.getItem("cutinapp_payment_review_ord-review-1")).toBeNull();
    now.mockRestore();
  });

  test("emits rejected resolution and never duplicates a terminal event", () => {
    paymentReviewState({
      order: { public_id: "ord-review-2", status: "processing", total: 80 },
      payment: { status: "processing", status_detail: "in_review" },
    });
    paymentReviewState({
      order: { public_id: "ord-review-2", status: "rejected", total: 80 },
      payment: { status: "rejected", status_detail: "cc_rejected_high_risk" },
    });
    paymentReviewState({
      order: { public_id: "ord-review-2", status: "rejected", total: 80 },
      payment: { status: "rejected", status_detail: "cc_rejected_high_risk" },
    });

    expect(window.PeterTecnetTelemetry.track).toHaveBeenCalledTimes(1);
    expect(window.PeterTecnetTelemetry.track).toHaveBeenCalledWith("payment_review_resolved", expect.objectContaining({
      metadata: expect.objectContaining({ outcome: "rejected" }),
    }));
  });
});
