export function notificationTelemetryAttrs(notification, surface = "notification_center") {
  if (!notification?.id) return {};

  return {
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
}
