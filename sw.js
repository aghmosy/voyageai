const CACHE_NAME = 'voyageai-v8';
const APP_SHELL = [
  './',
  './index.html',
  './src/app.js',
  './src/store.js',
  './src/ai/provider.js',
  './src/ai/anthropic.js',
  './src/ai/openai.js',
  './src/ai/prompts.js',

  './src/pages/plan.js',
  './src/pages/itinerary.js',
  './src/pages/expenses.js',
  './src/pages/profile.js',
  './manifest.json'
];

const FX_CACHE = 'voyageai-fx-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== FX_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for FX rates
  if (url.hostname === 'api.frankfurter.app') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(FX_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for AI API calls — don't cache
  if (
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'api.openai.com' ||
    url.hostname.includes('openai.azure.com')
  ) {
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
