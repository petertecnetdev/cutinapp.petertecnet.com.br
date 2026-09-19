const CHANNEL_NAME = "cutinapp-production-gallery-v1";
const STORAGE_KEY = "cutinapp:production-gallery:update";

const nowId = () => {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalizePayload = (organizationId, details = {}) => ({
  id: nowId(),
  organizationId: Number(organizationId),
  at: Date.now(),
  ...details,
});

export const notifyGalleryUpdate = (organizationId, details = {}) => {
  if (typeof window === "undefined" || !Number(organizationId)) return;
  const payload = normalizePayload(organizationId, details);

  try {
    window.dispatchEvent(new CustomEvent(CHANNEL_NAME, { detail: payload }));
  } catch (_) {
    // Same-tab notification is best effort.
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    }
  } catch (_) {
    // Storage fallback below covers browsers without a usable channel.
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Private browsing may reject localStorage; current tab still received it.
  }
};

export const subscribeGalleryUpdates = (organizationId, callback) => {
  if (typeof window === "undefined" || typeof callback !== "function") return () => {};
  const targetId = Number(organizationId);
  if (!targetId) return () => {};

  let channel = null;
  const deliver = (payload) => {
    if (!payload || Number(payload.organizationId) !== targetId) return;
    callback(payload);
  };
  const customHandler = (event) => deliver(event.detail);
  const storageHandler = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch (_) { /* ignore malformed storage events */ }
  };

  window.addEventListener(CHANNEL_NAME, customHandler);
  window.addEventListener("storage", storageHandler);

  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => deliver(event.data);
    }
  } catch (_) {
    channel = null;
  }

  return () => {
    window.removeEventListener(CHANNEL_NAME, customHandler);
    window.removeEventListener("storage", storageHandler);
    if (channel) channel.close();
  };
};
