// Shows pings from friends and opens their room when tapped. Nothing is cached here.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let ping = {};
  try {
    ping = event.data ? event.data.json() : {};
  } catch {
    // Not one of ours.
  }
  event.waitUntil(
    self.registration.showNotification(ping.title || "Whizard", {
      body: ping.body || "",
      tag: ping.tag,
      renotify: Boolean(ping.tag),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: ping.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
          await client.focus();
          return client.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
