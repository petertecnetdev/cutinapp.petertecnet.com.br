const normalize = (value) => String(value || "").trim().toLowerCase();

const reviewDetails = new Set([
  "in_review",
  "pending_review_manual",
]);

const entityReviewState = (entity = {}) => {
  const status = normalize(entity?.status || entity?.provider_payload?.status);
  const detail = normalize(
    entity?.status_detail
    || entity?.statusDetail
    || entity?.provider_payload?.status_detail
    || entity?.provider_payload?.statusDetail
  );

  const underReview = status === "in_review"
    || (status === "processing" && reviewDetails.has(detail));

  return { underReview, status, detail };
};

export const paymentReviewState = (result = {}) => {
  const payment = entityReviewState(result?.payment || {});
  const order = entityReviewState(result?.order || {});
  const active = payment.underReview ? payment : order;

  return {
    underReview: payment.underReview || order.underReview,
    status: active.status,
    detail: active.detail,
  };
};
