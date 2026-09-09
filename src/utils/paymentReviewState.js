const normalize = (value) => String(value || "").trim().toLowerCase();

const reviewDetails = new Set([
  "in_review",
  "pending_review_manual",
]);

const terminalStatuses = new Set([
  "paid",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
]);

const storagePrefix = "cutinapp_payment_review_";

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

const paymentOutcome = (status) => {
  if (status === "paid") return "approved";
  if (terminalStatuses.has(status)) return "rejected";
  return null;
};

const reviewStorage = () => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch (_) {
    return null;
  }
};

const trackReviewResolution = (result, state) => {
  const publicId = String(result?.order?.public_id || "").trim();
  if (!publicId) return;

  const storage = reviewStorage();
  if (!storage) return;

  const key = `${storagePrefix}${publicId}`;
  const now = Date.now();

  if (state.underReview) {
    try {
      if (!storage.getItem(key)) {
        storage.setItem(key, JSON.stringify({
          started_at: now,
          status_detail: state.detail || null,
        }));
      }
    } catch (_) {
      // Telemetry persistence must never interrupt checkout.
    }
    return;
  }

  const currentStatus = normalize(result?.order?.status || result?.payment?.status);
  const outcome = paymentOutcome(currentStatus);
  if (!outcome) return;

  try {
    const stored = storage.getItem(key);
    if (!stored) return;
    const lifecycle = JSON.parse(stored);
    storage.removeItem(key);

    const startedAt = Number(lifecycle?.started_at || 0);
    const durationMs = startedAt > 0 ? Math.max(0, now - startedAt) : null;
    const amount = Number(result?.order?.total || result?.payment?.transaction_amount || 0);
    const statusDetail = normalize(
      result?.payment?.status_detail
      || result?.payment?.provider_payload?.status_detail
      || result?.order?.status_detail
    ) || null;

    try {
      window.PeterTecnetTelemetry?.track?.("payment_review_resolved", {
        label: outcome === "approved" ? "Pagamento aprovado após análise" : "Pagamento recusado após análise",
        target: publicId,
        metadata: {
          amount,
          order_status: currentStatus,
          status_detail: statusDetail,
          review_status_detail: lifecycle?.status_detail || null,
          review_duration_ms: durationMs,
          outcome,
        },
      });
    } catch (_) {
      // Telemetry must never interrupt checkout.
    }
  } catch (_) {
    try { storage.removeItem(key); } catch (_) { /* noop */ }
  }
};

export const paymentReviewState = (result = {}) => {
  const payment = entityReviewState(result?.payment || {});
  const order = entityReviewState(result?.order || {});
  const active = payment.underReview ? payment : order;
  const state = {
    underReview: payment.underReview || order.underReview,
    status: active.status,
    detail: active.detail,
  };

  trackReviewResolution(result, state);
  return state;
};
