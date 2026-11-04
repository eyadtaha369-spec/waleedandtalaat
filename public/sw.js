// Service worker for Web Push booking reminders only — no fetch handler
// and no caching, so it never changes how the app itself loads.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "🚌 الحجز مفتوح الآن!",
    body: "",
    url: "/dashboard",
    tag: "booking-reminder",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Malformed payload — fall back to the defaults above.
  }
  const { title, body, url, tag } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.jpg",
      badge: "/favicon.png",
      tag,
      renotify: true,
      dir: "rtl",
      lang: "ar",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Resolve against our own origin so a relative "/dashboard" works, then
  // only trust it if it actually stayed on this origin.
  let target = "/";
  const rawUrl = event.notification.data && event.notification.data.url;
  if (rawUrl) {
    try {
      const resolved = new URL(rawUrl, self.location.origin);
      if (resolved.origin === self.location.origin) {
        target = resolved.pathname + resolved.search + resolved.hash;
      }
    } catch {
      // Ignore an unparseable url — keep the "/" default.
    }
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
