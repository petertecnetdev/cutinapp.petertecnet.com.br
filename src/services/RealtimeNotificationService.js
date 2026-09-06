import { apiBaseUrl } from "../config";
import { getAuthToken } from "../utils/authTokenStorage";

const APP_SLUG = "cutinapp";
const EVENT_NAME = "app.notification.created";
const MAX_RECONNECT_DELAY_MS = 30000;

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
    version: "1.0",
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

export function subscribeToUserNotifications(userId, onNotification) {
  const key = String(process.env.REACT_APP_REVERB_APP_KEY || "").trim();
  if (!key || !userId || typeof WebSocket === "undefined") return null;

  const host = String(process.env.REACT_APP_REVERB_HOST || "api.petertecnet.com.br").trim();
  const scheme = String(process.env.REACT_APP_REVERB_SCHEME || "https").trim().toLowerCase();
  const port = Number(process.env.REACT_APP_REVERB_PORT || (scheme === "https" ? 443 : 80));
  const channelName = `private-App.Models.User.${userId}`;
  const token = getAuthToken();

  let socket = null;
  let stopped = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;

    try {
      socket = new WebSocket(websocketUrl(key, host, scheme, port));
    } catch (_) {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => { reconnectAttempts = 0; };
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

      if (envelope.event === EVENT_NAME && (!envelope.channel || envelope.channel === channelName)) {
        const payload = parseData(envelope.data);
        if (payload?.notification) onNotification?.(payload.notification);
      }
    };
    socket.onerror = () => { socket?.close(); };
    socket.onclose = () => scheduleReconnect();
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    socket = null;
  };
}
