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
    let timer = null;
    const heartbeat = () => messagingService.heartbeat().catch(() => undefined);

    const preparePush = async () => {
      if (stopped) return;
      try {
        pushReadyRef.current = await ensureWebPushSubscription();
      } catch (_) {
        pushReadyRef.current = false;
      }
    };

    const startBackgroundWork = () => {
      if (stopped) return;
      heartbeat();
      timer = window.setInterval(heartbeat, HEARTBEAT_MS);
      preparePush();
    };
    const idleHandle = window.requestIdleCallback
      ? window.requestIdleCallback(startBackgroundWork, { timeout: 1800 })
      : window.setTimeout(startBackgroundWork, 600);

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
      if (window.cancelIdleCallback && typeof idleHandle === "number") window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
      if (timer) window.clearInterval(timer);
      window.removeEventListener(PERMISSION_EVENT, permissionChanged);
      unsubscribeRealtime?.();
    };
  }, [user?.id]);

  return null;
}
