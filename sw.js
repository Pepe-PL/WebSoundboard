const SHELL_CACHE = 'web-soundboard-shell-v1';
const SOUND_CACHE = 'web-soundboard-sounds-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './sounds.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('web-soundboard-') && ![SHELL_CACHE, SOUND_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/sounds/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SOUND_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) await cache.put(request, response.clone());
        return response;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.endsWith('/sounds.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const manifestUrl = new URL('./sounds.json', self.registration.scope).href;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(manifestUrl, response.clone());
        return response;
      } catch {
        return (await cache.match(manifestUrl)) || Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});