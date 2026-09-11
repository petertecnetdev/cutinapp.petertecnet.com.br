import messagingService from "./MessagingService";

const SW_PATH = "/cutinapp-push-sw.js";

const base64UrlToUint8Array = (base64Url) => {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
};

export async function ensureWebPushSubscription() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!("Notification" in window) || window.Notification.permission !== "granted") return false;

  await navigator.serviceWorker.register(SW_PATH);
  const ready = await navigator.serviceWorker.ready;
  const current = await ready.pushManager.getSubscription();

  if (current) {
    await messagingService.subscribePush(current.toJSON());
    return true;
  }

  const configuredKey = String(process.env.REACT_APP_WEB_PUSH_PUBLIC_KEY || "").trim();
  const remote = configuredKey ? { public_key: configuredKey } : await messagingService.pushPublicKey();
  const publicKey = String(remote?.public_key || "").trim();
  if (!publicKey) return false;

  const subscription = await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  });

  await messagingService.subscribePush(subscription.toJSON());
  return true;
}

export async function removeWebPushSubscription() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!registration) return;
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await messagingService.unsubscribePush(endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

export async function showLocalNotification(payload = {}) {
  if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return false;

  const title = payload.title || "Cutinapp";
  const options = {
    body: payload.message || payload.body || "Você recebeu uma nova notificação.",
    icon: payload.icon || "/logo192.png",
    badge: "/logo192.png",
    tag: payload.data?.conversation_id ? `conversation-${payload.data.conversation_id}` : payload.type || "cutinapp",
    data: {
      url: payload.reference_url || payload.data?.url || "/notifications",
      conversation_id: payload.data?.conversation_id || null,
    },
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  }

  // eslint-disable-next-line no-new
  new window.Notification(title, options);
  return true;
}
