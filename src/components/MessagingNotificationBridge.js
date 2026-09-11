import { useContext, useEffect, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import messagingService from "../services/MessagingService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";
import { ensureWebPushSubscription, showLocalNotification } from "../services/WebPushService";

const HEARTBEAT_MS = 45000;
const PERMISSION_EVENT = "cutinapp:notification-permission-changed";

export default function MessagingNotificationBridge() {
  const { user } = useContext(AuthContext);
  const pushReadyRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return undefined;

    let stopped = false;
    const heartbeat = () => messagingService.heartbeat().catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);

    const preparePush = async () => {
      if (stopped) return;
      try {
        pushReadyRef.current = await ensureWebPushSubscription();
      } catch (_) {
        pushReadyRef.current = false;
      }
    };

    preparePush();
    const permissionChanged = () => preparePush();
    window.addEventListener(PERMISSION_EVENT, permissionChanged);

    const unsubscribeRealtime = subscribeToUserNotifications(user.id, (notification) => {
      if (!notification || notification.type !== "direct_message") return;

      const conversationId = Number(notification?.data?.conversation_id || notification?.reference_id || 0);
      const activeConversationId = Number(window.sessionStorage.getItem("cutinapp:activeConversationId") || 0);
      if (conversationId && activeConversationId === conversationId && document.visibilityState === "visible") return;

      if (!pushReadyRef.current) {
        showLocalNotification(notification).catch(() => undefined);
      }
    });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener(PERMISSION_EVENT, permissionChanged);
      unsubscribeRealtime?.();
    };
  }, [user?.id]);

  return null;
}
