// Montenku service worker (D-037): shows push reminders and opens them on click. No offline caching.
// Plain JavaScript in public/, served as /sw.js, so its scope is the whole site.

const FALLBACK = { title: "Pengingat Montenku", body: "Buka Montenku untuk melihat pengingatmu.", url: "/", tag: "montenku" };

/** The payload is JSON from our server (src/server/dal/reminders.ts). Anything else still shows a generic notice. */
function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string") return { ...FALLBACK, ...data };
  } catch {
    // Not JSON: fall through.
  }
  return FALLBACK;
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  // Browsers require every push to show a notification; waitUntil keeps the worker alive until it does.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // Same tag = a repeat replaces the notification still on screen instead of adding a second one.
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open our own pages, whatever the payload says.
  let target = new URL("/", self.location.origin);
  try {
    const url = new URL(event.notification.data && event.notification.data.url, self.location.origin);
    if (url.origin === self.location.origin) target = url;
  } catch {
    // Bad URL: open the dashboard.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === target.href);
      return open ? open.focus() : self.clients.openWindow(target.href);
    }),
  );
});
