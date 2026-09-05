import { subscribeToUserChannelEvent } from "./RealtimeUserChannelService";

const MESSAGE_EVENT = "app.messaging.message.created";
const MESSAGE_CHANGED_EVENT = "app.messaging.message.changed";
const READ_EVENT = "app.messaging.conversation.read";
const TYPING_EVENT = "app.messaging.conversation.typing";

export function subscribeToMessagingEvents(userId, handlers = {}) {
  const unsubscribers = [
    subscribeToUserChannelEvent(userId, MESSAGE_EVENT, (payload) => handlers.onMessage?.(payload)),
    subscribeToUserChannelEvent(userId, MESSAGE_CHANGED_EVENT, (payload) => handlers.onMessageChanged?.(payload)),
    subscribeToUserChannelEvent(userId, READ_EVENT, (payload) => handlers.onRead?.(payload)),
    subscribeToUserChannelEvent(userId, TYPING_EVENT, (payload) => handlers.onTyping?.(payload)),
  ].filter(Boolean);

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
