const recoveryClickCapture = (notification, surface) => {
  if (surface !== "navbar_popover") return undefined;
  if (notification?.type !== "checkout_recovery" || notification?.metadata?.recovery_action !== "resume_pix") return undefined;

  return () => {
    try {
      window.PeterTecnetTelemetry?.track?.("checkout_recovery_notification_cta_clicked", {
        label: String(notification?.metadata?.recovery_cta_label || "Retomar pagamento PIX").trim().slice(0, 80),
        target: "navbar_popover",
        metadata: {
          order_public_id: String(notification?.reference_id || ""),
          recovery_source: "in_app",
          recovery_entrypoint: "navbar_popover",
          recovery_action: "resume_pix",
          recovery_experiment: notification?.metadata?.recovery_experiment || null,
          recovery_timing_minutes: Number(notification?.metadata?.recovery_timing_minutes || 0) || null,
        },
      });
    } catch (_) {
      // Attribution must never block notification navigation or payment recovery.
    }
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

  return attrs;
}
