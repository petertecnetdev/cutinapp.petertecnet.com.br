import { paymentReviewState } from "./paymentReviewState";

describe("paymentReviewState", () => {
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
});
