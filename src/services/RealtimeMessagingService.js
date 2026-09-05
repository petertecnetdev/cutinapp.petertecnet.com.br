import { subscribeToUserChannelEvent } from "./RealtimeUserChannelService";

const MESSAGE_EVENT = "app.messaging.message.created";
const READ_EVENT = "app.messaging.conversation.read";

export function subscribeToMessagingEvents(userId, handlers = {}) {
  const unsubscribers = [
    subscribeToUserChannelEvent(userId, MESSAGE_EVENT, (payload) => handlers.onMessage?.(payload)),
    subscribeToUserChannelEvent(userId, READ_EVENT, (payload) => handlers.onRead?.(payload)),
  ].filter(Boolean);

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
