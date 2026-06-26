self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Pauli Admin";
  const body = payload.body || "Hay novedades en los pedidos.";
  const pendingCount = Number(payload.pendingCount) || 0;
  const url = payload.url || "/admin/pedidos";

  event.waitUntil(
    (async () => {
      if (pendingCount > 0 && "setAppBadge" in navigator) {
        try {
          await navigator.setAppBadge(pendingCount);
        } catch {}
      }

      if (pendingCount <= 0 && "clearAppBadge" in navigator) {
        try {
          await navigator.clearAppBadge();
        } catch {}
      }

      await self.registration.showNotification(title, {
        body,
        badge: "/icons/android-chrome-192x192.png",
        icon: "/icons/android-chrome-192x192.png",
        data: { url }
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
