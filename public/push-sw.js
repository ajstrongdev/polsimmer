self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    // A malformed payload must not display arbitrary notification text.
  }
  let target = "/dashboard";
  if (typeof message.url === "string" && message.url.startsWith("/") && !message.url.startsWith("//")) {
    const url = new URL(message.url, self.location.origin);
    if (url.origin === self.location.origin && (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"))) {
      target = url.pathname + url.search + url.hash;
    }
  }
  event.waitUntil(self.registration.showNotification(
    typeof message.title === "string" ? message.title.slice(0, 80) : "Notification",
    {
      body: typeof message.body === "string" ? message.body.slice(0, 120) : "You have a new notification.",
      tag: typeof message.tag === "string" ? message.tag.slice(0, 100) : "mention",
      icon: "/favicon.ico",
      data: { target },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.target || "/dashboard";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (app) {
      await app.focus();
      await app.navigate(target);
    } else {
      await self.clients.openWindow(target);
    }
  })());
});
