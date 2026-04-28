const CACHE_NAME = "sheikh-app-v1.1";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./css/styles.css",
  "./app.js",
  "./js/auth.js",
  "./js/ui-utils.js",
  "./js/cart-logic.js",
  "./js/order-logic.js",
  "./js/admin-logic.js",
  "./js/pricing.js",
  "./js/chatbot.js",
  "./img/logo.png",
  "./img/CALLB.png",
  "./img/download (1).png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

self.addEventListener("fetch", (event) => {
  // للبيانات الأساسية التي تعتمد على الانترنت مثل Firebase، نرجو جلبها من الشبكة
  if (
    event.request.url.includes("firestore") ||
    event.request.url.includes("firebase")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // استراتيجية Stale-While-Revalidate: عرض المخزن فوراً مع تحديثه في الخلفية
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });

      return cachedResponse || fetchPromise;
    }),
  );
});
