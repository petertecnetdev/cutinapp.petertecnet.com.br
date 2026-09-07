const parseData = (message) => {
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed?.data === "string") {
      try { parsed.data = JSON.parse(parsed.data); } catch (_) { /* keep raw */ }
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

export const subscribeTimelineRealtime = ({ realtime, appId, onChange }) => {
  if (!realtime?.configured || !realtime?.key || !realtime?.host || !appId || typeof WebSocket === "undefined") {
    return () => {};
  }

  const protocol = String(realtime.scheme || "https") === "https" ? "wss" : "ws";
  const defaultPort = protocol === "wss" ? 443 : 80;
  const port = Number(realtime.port || defaultPort);
  const portPart = port === defaultPort ? "" : `:${port}`;
  const endpoint = `${protocol}://${realtime.host}${portPart}/app/${encodeURIComponent(realtime.key)}?protocol=7&client=js&version=8.4.0&flash=false`;
  let socket;
  let closed = false;
  let retryTimer;
  let retryDelay = 1500;

  const connect = () => {
    if (closed) return;
    try {
      socket = new WebSocket(endpoint);
    } catch (_) {
      retryTimer = window.setTimeout(connect, retryDelay);
      retryDelay = Math.min(30000, Math.round(retryDelay * 1.7));
      return;
    }

    socket.onopen = () => { retryDelay = 1500; };
    socket.onmessage = (event) => {
      const message = parseData(event.data);
      if (!message) return;
      if (message.event === "pusher:connection_established") {
        socket.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `app.${appId}.timeline` } }));
        return;
      }
      if (message.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }
      if (message.event === "timeline.changed") onChange?.(message.data || {});
    };
    socket.onclose = () => {
      if (closed) return;
      retryTimer = window.setTimeout(connect, retryDelay);
      retryDelay = Math.min(30000, Math.round(retryDelay * 1.7));
    };
    socket.onerror = () => socket?.close();
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    try { socket?.close(); } catch (_) { /* noop */ }
  };
};
