// DVote's service worker. It caches nothing but an offline page: elections change block by block,
// and a cached page or script could show a voter an outdated election or run outdated code after a
// deploy. A page opened without a connection shows the offline page instead of the browser's error.

const CACHE = "dvote-offline-1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // Starts the page's request while the worker wakes, so it adds no delay online.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Only page loads; every other request goes to the network untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE)) ?? Response.error();
      }
    })(),
  );
});
