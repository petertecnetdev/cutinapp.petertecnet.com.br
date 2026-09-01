import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { apiBaseUrl } from "../config";

window.Pusher = Pusher;

export function subscribeToUserNotifications(userId, onNotification) {
  const key = String(process.env.REACT_APP_REVERB_APP_KEY || "").trim();
  if (!key || !userId) return null;

  const host = process.env.REACT_APP_REVERB_HOST || "api.petertecnet.com.br";
  const scheme = process.env.REACT_APP_REVERB_SCHEME || "https";
  const port = Number(process.env.REACT_APP_REVERB_PORT || (scheme === "https" ? 443 : 80));
  const token = localStorage.getItem("token");

  const echo = new Echo({
    broadcaster: "reverb",
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: ["ws", "wss"],
    authEndpoint: `${apiBaseUrl.replace(/\/api\/?$/, "")}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        Accept: "application/json",
        "X-Peter-App": "cutinapp",
      },
    },
  });

  echo
    .private(`App.Models.User.${userId}`)
    .listen(".app.notification.created", (payload) => {
      if (payload?.notification) onNotification?.(payload.notification);
    });

  return () => {
    echo.leave(`App.Models.User.${userId}`);
    echo.disconnect();
  };
}
