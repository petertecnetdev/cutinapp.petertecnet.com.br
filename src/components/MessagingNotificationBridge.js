import { useContext, useEffect, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import messagingService from "../services/MessagingService";
import { subscribeToUserNotifications } from "../services/RealtimeNotificationService";
import { ensureWebPushSubscription, showLocalNotification } from "../services/WebPushService";
import { getMobileRuntimeProfile, scheduleIdleWork } from "../utils/mobilePerformance";

const PERMISSION_EVENT = "cutinapp:notification-permission-changed";

export default function MessagingNotificationBridge() {
  const { user } = useContext(AuthContext);
  const pushReadyRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return undefined;

    let stopped = false;
    const profile = getMobileRuntimeProfile();
    const heartbeatMs = profile.constrainedNetwork ? 120000 : 60000;
    const heartbeat = () => {
      if (stopped || document.visibilityState === "hidden") return;
      messagingService.heartbeat().catch(() => undefined);
    };
    const cancelInitialHeartbeat = scheduleIdleWork(heartbeat, {
      timeout: profile.constrainedNetwork ? 3200 : 1800,
      fallbackDelay: profile.mobile ? 900 : 500,
    });
    const timer = window.setInterval(heartbeat, heartbeatMs);

    const preparePush = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        pushReadyRef.current = await ensureWebPushSubscription();
      } catch (_) {
        pushReadyRef.current = false;
      }
    };

    const cancelInitialPush = scheduleIdleWork(preparePush, {
      timeout: profile.constrainedNetwork ? 4200 : 2400,
      fallbackDelay: profile.mobile ? 1200 : 700,
    });
    const permissionChanged = () => preparePush();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      heartbeat();
      if (!pushReadyRef.current) preparePush();
    };
    window.addEventListener(PERMISSION_EVENT, permissionChanged);
    document.addEventListener("visibilitychange", onVisible);

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
      cancelInitialHeartbeat();
      cancelInitialPush();
      window.clearInterval(timer);
      window.removeEventListener(PERMISSION_EVENT, permissionChanged);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribeRealtime?.();
    };
  }, [user?.id]);

  return null;
}
