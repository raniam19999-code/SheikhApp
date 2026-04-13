const CACHE_NAME = "sheikh-app-v1";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./css/styles.css",
  "./app.js",
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
    caches.match(event.request).then((response) => {
      if (response) return response;

      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    }),
  );
});
