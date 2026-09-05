import { subscribeToUserChannelEvent } from "./RealtimeUserChannelService";

const EVENT_NAME = "app.notification.created";

export function subscribeToUserNotifications(userId, onNotification) {
  return subscribeToUserChannelEvent(userId, EVENT_NAME, (payload) => {
    if (payload?.notification) onNotification?.(payload.notification);
  });
}
