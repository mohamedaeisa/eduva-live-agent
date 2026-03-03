// Service Worker for EDUVA-Me
const CACHE_NAME = 'eduva-v5-resilient';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json?v=2',
  './logo.svg?v=2',
  './index.css',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  // OFFLINE FONT RESILIENCE (Technical Resilience Phase)
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter-Italic.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter-Bold.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter-Black.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/Cairo-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/Cairo-Bold.ttf'
];

// On Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
  );
  self.skipWaiting();
});

// On Activate: Clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handling: Cache-First for Fonts, Network-First for App
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy: Cache-First for Font Binaries (They never change)
  if (url.pathname.endsWith('.ttf')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return fetchResponse;
        });
      })
    );
    return;
  }

  // Network-First for other assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});