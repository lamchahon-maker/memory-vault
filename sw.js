const CACHE_NAME = 'memory-vault-v13';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './ai-assistant.js',
  './google-drive.js',
  './config.js',
  './icon.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do not intercept API calls or non-GET requests (like Groq/Gemini POST requests)
  if (event.request.method !== 'GET' || event.request.url.includes('api.groq.com') || event.request.url.includes('googleapis.com')) {
    return;
  }

  // Try network first, fallback to cache for static assets
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        // If not found in cache, return a generic offline response or just let it fail
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
