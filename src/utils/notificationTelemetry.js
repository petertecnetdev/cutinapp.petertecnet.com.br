const recoveryImpressionKeys = new Set();

const recoveryMetadata = (notification, surface) => ({
  order_public_id: String(notification?.reference_id || ""),
  recovery_source: "in_app",
  recovery_entrypoint: surface,
  recovery_action: "resume_pix",
  recovery_experiment: notification?.metadata?.recovery_experiment || null,
  recovery_timing_minutes: Number(notification?.metadata?.recovery_timing_minutes || 0) || null,
});

const isRecoveryCta = (notification) => (
  notification?.type === "checkout_recovery"
  && notification?.metadata?.recovery_action === "resume_pix"
);

const recoveryClickCapture = (notification, surface) => {
  if (surface !== "navbar_popover" || !isRecoveryCta(notification)) return undefined;

  return () => {
    try {
      window.PeterTecnetTelemetry?.track?.("checkout_recovery_notification_cta_clicked", {
        label: String(notification?.metadata?.recovery_cta_label || "Retomar pagamento PIX").trim().slice(0, 80),
        target: surface,
        metadata: recoveryMetadata(notification, surface),
      });
    } catch (_) {
      // Attribution must never block notification navigation or payment recovery.
    }
  };
};

const recoveryImpressionRef = (notification, surface) => {
  if (surface !== "navbar_popover" || !isRecoveryCta(notification)) return undefined;
  if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") return undefined;

  const impressionKey = `${surface}:${String(notification.id)}`;
  let observer;

  return (node) => {
    observer?.disconnect?.();
    observer = undefined;
    if (!node || recoveryImpressionKeys.has(impressionKey)) return;

    observer = new window.IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && Number(entry.intersectionRatio || 0) >= 0.5);
      if (!visible || recoveryImpressionKeys.has(impressionKey)) return;

      recoveryImpressionKeys.add(impressionKey);
      observer?.disconnect?.();
      observer = undefined;

      try {
        window.PeterTecnetTelemetry?.track?.("checkout_recovery_notification_cta_viewed", {
          label: String(notification?.metadata?.recovery_cta_label || "Retomar pagamento PIX").trim().slice(0, 80),
          target: surface,
          metadata: recoveryMetadata(notification, surface),
        });
      } catch (_) {
        // Impression telemetry must never interfere with notification rendering.
      }
    }, { threshold: 0.5 });

    observer.observe(node);
  };
};

export function notificationTelemetryAttrs(notification, surface = "notification_center") {
  if (!notification?.id) return {};

  const attrs = {
    "data-peter-notification-id": String(notification.id),
    "data-peter-notification-title": notification.title || "Nova notificação",
    "data-peter-notification-type": notification.type || "",
    "data-peter-notification-reference-type": notification.reference_type || "",
    "data-peter-notification-reference-id": notification.reference_id || "",
    "data-peter-notification-reference-url": notification.reference_url || "",
    "data-peter-notification-created-at": notification.created_at || "",
    "data-peter-notification-read-at": notification.read_at || "",
    "data-peter-notification-surface": surface,
  };

  const onClickCapture = recoveryClickCapture(notification, surface);
  if (onClickCapture) attrs.onClickCapture = onClickCapture;

  const ref = recoveryImpressionRef(notification, surface);
  if (ref) attrs.ref = ref;

  return attrs;
}
