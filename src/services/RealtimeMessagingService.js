import { apiBaseUrl } from "../config";
import { getAuthToken } from "../utils/authTokenStorage";

const APP_SLUG = "cutinapp";
const MAX_RECONNECT_DELAY_MS = 30000;
const SUPPORTED_EVENTS = new Set([
  "messaging.message.created",
  "messaging.message.updated",
  "messaging.message.deleted",
  "messaging.reaction.updated",
  "messaging.message.read",
  "messaging.typing",
  "messaging.conversation.created",
  "messaging.conversation.updated",
  "messaging.pins.updated",
  "messaging.call.updated",
]);

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
    client: "cutinapp-direct",
    version: "2.0",
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

export function subscribeToConversation(conversationId, onEvent, onConnectionChange) {
  const key = String(process.env.REACT_APP_REVERB_APP_KEY || "").trim();
  if (!key || !conversationId || typeof WebSocket === "undefined") return null;

  const host = String(process.env.REACT_APP_REVERB_HOST || "api.petertecnet.com.br").trim();
  const scheme = String(process.env.REACT_APP_REVERB_SCHEME || "https").trim().toLowerCase();
  const port = Number(process.env.REACT_APP_REVERB_PORT || (scheme === "https" ? 443 : 80));
  const channelName = `private-messaging.conversation.${Number(conversationId)}`;
  const token = getAuthToken();

  let socket = null;
  let stopped = false;
  let subscribed = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  const setState = (state) => onConnectionChange?.(state);

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    reconnectAttempts += 1;
    setState("reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;

    setState("connecting");
    try {
      socket = new WebSocket(websocketUrl(key, host, scheme, port));
    } catch (_) {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectAttempts = 0;
      setState("connected");
    };

    socket.onmessage = async (message) => {
      const envelope = parseData(message.data);

      if (envelope.event === "pusher:connection_established") {
        const connection = parseData(envelope.data);
        if (!connection.socket_id || stopped) return;
        try {
          const auth = await authorizePrivateChannel(connection.socket_id, channelName, token);
          if (stopped || socket?.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            event: "pusher:subscribe",
            data: {
              channel: channelName,
              auth: auth.auth,
              channel_data: auth.channel_data,
            },
          }));
        } catch (_) {
          socket?.close();
        }
        return;
      }

      if (envelope.event === "pusher_internal:subscription_succeeded" && envelope.channel === channelName) {
        subscribed = true;
        setState("subscribed");
        return;
      }

      if (SUPPORTED_EVENTS.has(envelope.event) && (!envelope.channel || envelope.channel === channelName)) {
        onEvent?.(envelope.event, parseData(envelope.data));
      }
    };

    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      subscribed = false;
      setState(stopped ? "stopped" : "disconnected");
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    stopped = true;
    subscribed = false;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    socket = null;
    setState("stopped");
  };
}

export const realtimeMessagingEvents = SUPPORTED_EVENTS;
