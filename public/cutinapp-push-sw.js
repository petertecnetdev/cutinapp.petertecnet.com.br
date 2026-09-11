self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : "Você recebeu uma nova mensagem." };
  }

  const title = payload.title || "Cutinapp";
  const options = {
    body: payload.body || "Você recebeu uma nova mensagem.",
    icon: payload.icon || "/logo192.png",
    badge: "/logo192.png",
    tag: payload.tag || (payload.conversation_id ? `conversation-${payload.conversation_id}` : "cutinapp"),
    renotify: true,
    data: {
      url: payload.url || "/notifications",
      conversation_id: payload.conversation_id || null,
      message_id: payload.message_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification?.data?.url || "/notifications", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
