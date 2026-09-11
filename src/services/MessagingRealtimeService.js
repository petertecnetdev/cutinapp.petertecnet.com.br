import { apiBaseUrl } from "../config";
import { getAuthToken } from "../utils/authTokenStorage";

const APP_SLUG = "cutinapp";
const EVENT_NAME = "messaging.changed";
const MAX_RECONNECT_DELAY_MS = 30000;

const parseData = (value) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch (_) { return {}; }
};

const websocketUrl = (key, host, scheme, port) => {
  const protocol = scheme === "https" ? "wss" : "ws";
  const defaultPort = protocol === "wss" ? 443 : 80;
  const portPart = Number(port) === defaultPort ? "" : `:${port}`;
  const query = new URLSearchParams({ protocol: "7", client: "cutinapp-direct", version: "1.0", flash: "false" });
  return `${protocol}://${host}${portPart}/app/${encodeURIComponent(key)}?${query.toString()}`;
};

async function authorizePrivateChannel(socketId, channelName) {
  const token = getAuthToken();
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
  return response.json();
}

export function subscribeToConversation(conversationId, handlers = {}) {
  const key = String(process.env.REACT_APP_REVERB_APP_KEY || "").trim();
  if (!key || !conversationId || typeof WebSocket === "undefined") return null;

  const host = String(process.env.REACT_APP_REVERB_HOST || "api.petertecnet.com.br").trim();
  const scheme = String(process.env.REACT_APP_REVERB_SCHEME || "https").trim().toLowerCase();
  const port = Number(process.env.REACT_APP_REVERB_PORT || (scheme === "https" ? 443 : 80));
  const channelName = `private-messaging.${Number(conversationId)}`;
  let socket = null;
  let socketId = "";
  let stopped = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  };

  const whisper = (event, payload = {}) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ event: `client-${event}`, channel: channelName, data: JSON.stringify(payload) }));
    return true;
  };

  const connect = () => {
    if (stopped) return;
    try { socket = new WebSocket(websocketUrl(key, host, scheme, port)); } catch (_) { scheduleReconnect(); return; }
    socket.onopen = () => { reconnectAttempts = 0; handlers.onStatus?.("connecting"); };
    socket.onmessage = async (message) => {
      const envelope = parseData(message.data);
      if (envelope.event === "pusher:connection_established") {
        const connection = parseData(envelope.data);
        socketId = connection.socket_id || "";
        if (!socketId || stopped) return;
        try {
          const auth = await authorizePrivateChannel(socketId, channelName);
          if (stopped || socket?.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ event: "pusher:subscribe", data: { channel: channelName, auth: auth.auth, channel_data: auth.channel_data } }));
        } catch (_) { socket?.close(); }
        return;
      }
      if (envelope.event === "pusher_internal:subscription_succeeded") {
        handlers.onStatus?.("connected");
        return;
      }
      if (envelope.event === EVENT_NAME && (!envelope.channel || envelope.channel === channelName)) {
        handlers.onChange?.(parseData(envelope.data));
        return;
      }
      if (envelope.event === "client-typing" && envelope.channel === channelName) {
        handlers.onTyping?.(parseData(envelope.data));
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => { handlers.onStatus?.("disconnected"); scheduleReconnect(); };
  };

  connect();
  return {
    typing: (payload) => whisper("typing", payload),
    close: () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
      socket = null;
    },
  };
}
