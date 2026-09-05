import { apiBaseUrl } from "../config";

const APP_SLUG = "cutinapp";
const MAX_RECONNECT_DELAY_MS = 30000;
const channels = new Map();

const parseData = (value) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch (_) { return {}; }
};

const websocketUrl = (key, host, scheme, port) => {
  const protocol = scheme === "https" ? "wss" : "ws";
  const defaultPort = protocol === "wss" ? 443 : 80;
  const portPart = Number(port) === defaultPort ? "" : `:${port}`;
  const query = new URLSearchParams({
    protocol: "7",
    client: "cutinapp-web",
    version: "1.1",
    flash: "false",
  });
  return `${protocol}://${host}${portPart}/app/${encodeURIComponent(key)}?${query.toString()}`;
};

async function authorizePrivateChannel(socketId, channelName, token) {
  const authEndpoint = `${apiBaseUrl.replace(/\/api\/?$/, "")}/broadcasting/auth`;
  const body = new URLSearchParams({ socket_id: socketId, channel_name: channelName });
  const response = await fetch(authEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Authorization: token ? `Bearer ${token}` : "",
      "X-Peter-App": APP_SLUG,
    },
    body: body.toString(),
  });

  if (!response.ok) throw new Error(`Realtime auth failed (${response.status})`);
  const payload = await response.json();
  if (!payload?.auth) throw new Error("Realtime auth response is invalid");
  return payload;
}

function createChannel(userId) {
  const key = String(process.env.REACT_APP_REVERB_APP_KEY || "").trim();
  if (!key || !userId || typeof WebSocket === "undefined") return null;

  const host = String(process.env.REACT_APP_REVERB_HOST || "api.petertecnet.com.br").trim();
  const scheme = String(process.env.REACT_APP_REVERB_SCHEME || "https").trim().toLowerCase();
  const port = Number(process.env.REACT_APP_REVERB_PORT || (scheme === "https" ? 443 : 80));
  const channelName = `private-App.Models.User.${userId}`;
  const token = localStorage.getItem("token");

  const state = {
    userId: Number(userId),
    channelName,
    listeners: new Map(),
    socket: null,
    stopped: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
  };

  const emit = (eventName, payload) => {
    const listeners = state.listeners.get(eventName);
    if (!listeners) return;
    [...listeners].forEach((listener) => {
      try { listener(payload); } catch (_) { /* um consumidor não derruba os demais */ }
    });
  };

  const scheduleReconnect = () => {
    if (state.stopped || state.reconnectTimer || state.listeners.size === 0) return;
    const delay = Math.min(1000 * (2 ** state.reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    state.reconnectAttempts += 1;
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (state.stopped || state.listeners.size === 0) return;

    try {
      state.socket = new WebSocket(websocketUrl(key, host, scheme, port));
    } catch (_) {
      scheduleReconnect();
      return;
    }

    state.socket.onopen = () => { state.reconnectAttempts = 0; };
    state.socket.onmessage = async (message) => {
      const envelope = parseData(message.data);

      if (envelope.event === "pusher:connection_established") {
        const connection = parseData(envelope.data);
        if (!connection.socket_id || state.stopped) return;
        try {
          const auth = await authorizePrivateChannel(connection.socket_id, channelName, token);
          if (state.stopped || state.socket?.readyState !== WebSocket.OPEN) return;
          state.socket.send(JSON.stringify({
            event: "pusher:subscribe",
            data: {
              channel: channelName,
              auth: auth.auth,
              channel_data: auth.channel_data,
            },
          }));
        } catch (_) {
          state.socket?.close();
        }
        return;
      }

      if (!envelope.event || envelope.event.startsWith("pusher:")) return;
      if (envelope.channel && envelope.channel !== channelName) return;
      emit(envelope.event, parseData(envelope.data));
    };
    state.socket.onerror = () => { state.socket?.close(); };
    state.socket.onclose = () => scheduleReconnect();
  };

  state.connect = connect;
  state.destroy = () => {
    state.stopped = true;
    if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.socket && state.socket.readyState < WebSocket.CLOSING) state.socket.close();
    state.socket = null;
  };

  connect();
  return state;
}

export function subscribeToUserChannelEvent(userId, eventName, listener) {
  if (!userId || !eventName || typeof listener !== "function") return null;
  const id = Number(userId);
  let state = channels.get(id);

  if (!state) {
    state = createChannel(id);
    if (!state) return null;
    channels.set(id, state);
  }

  const listeners = state.listeners.get(eventName) || new Set();
  listeners.add(listener);
  state.listeners.set(eventName, listeners);

  if (!state.socket || state.socket.readyState >= WebSocket.CLOSING) {
    state.stopped = false;
    state.connect();
  }

  return () => {
    const current = state.listeners.get(eventName);
    current?.delete(listener);
    if (current && current.size === 0) state.listeners.delete(eventName);

    if (state.listeners.size === 0) {
      state.destroy();
      channels.delete(id);
    }
  };
}
