self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  const rawPayload = event.data ? event.data.json() : {};
  const declarativeNotification =
    rawPayload && rawPayload.web_push === 8030 && rawPayload.notification
      ? rawPayload.notification
      : null;
  const fallbackData =
    declarativeNotification && typeof declarativeNotification.data === "object"
      ? declarativeNotification.data
      : {};
  const title =
    declarativeNotification && typeof declarativeNotification.title === "string"
      ? declarativeNotification.title
      : rawPayload.title || "Nuevo pedido en Smellme";
  const body =
    declarativeNotification && typeof declarativeNotification.body === "string"
      ? declarativeNotification.body
      : rawPayload.body || "Tienes un nuevo pedido pendiente de revisión.";
  const url =
    (typeof fallbackData.url === "string" && fallbackData.url) ||
    (declarativeNotification && typeof declarativeNotification.navigate === "string"
      ? declarativeNotification.navigate
      : null) ||
    rawPayload.url ||
    "/admin/pedidos";
  const pendingCount = Number(
    (typeof fallbackData.pendingCount === "number" && fallbackData.pendingCount) ||
      (declarativeNotification ? declarativeNotification.app_badge : 0) ||
      rawPayload.pendingCount ||
      0
  );

  return {
    title,
    body,
    url,
    pendingCount,
    icon:
      (declarativeNotification && declarativeNotification.icon) ||
      "/icons/android-chrome-192x192.png",
    badge:
      (declarativeNotification && declarativeNotification.badge) ||
      "/icons/android-chrome-192x192.png",
    tag:
      (declarativeNotification && declarativeNotification.tag) ||
      "smellme-admin-pending-orders",
    pedidoId:
      (typeof fallbackData.pedidoId === "string" && fallbackData.pedidoId) ||
      rawPayload.pedidoId ||
      null
  };
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    (async () => {
      if (payload.pendingCount > 0 && "setAppBadge" in navigator) {
        try {
          await navigator.setAppBadge(payload.pendingCount);
        } catch {}
      }

      if (payload.pendingCount <= 0 && "clearAppBadge" in navigator) {
        try {
          await navigator.clearAppBadge();
        } catch {}
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        badge: payload.badge,
        icon: payload.icon,
        tag: payload.tag,
        data: {
          url: payload.url,
          pendingCount: payload.pendingCount,
          pedidoId: payload.pedidoId
        }
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/admin/pedidos";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
