/**
 * Service worker da Nexora.
 *
 * Antes o handler de `fetch` era um no-op: o app se registrava como PWA mas não
 * funcionava offline nem economizava rede. Agora:
 *  - app shell pré-cacheado no install (com fallback offline para navegação);
 *  - assets estáticos com stale-while-revalidate;
 *  - `/api/**` nunca vai para cache (dados sempre frescos);
 *  - caches versionados com limpeza no activate.
 */

const STATIC_CACHE = 'nexora-static-v2';
const RUNTIME_CACHE = 'nexora-runtime-v2';

const APP_SHELL = [
  '/',
  '/login',
  '/register',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isCacheableStatic = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpe?g|webp|avif|svg|woff2?)$/i.test(url.pathname));

const isApi = (url) =>
  url.origin === self.location.origin && url.pathname.startsWith('/api/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API sempre pela rede: progresso/sessões não podem vir de cache.
  if (isApi(url)) return;

  // Navegação: network-first com fallback para o shell (offline real).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached || caches.match('/login').then((fallback) => fallback || Response.error())
            )
        )
    );
    return;
  }

  // Estáticos: stale-while-revalidate.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const refresh = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || refresh;
        })
      )
    );
    return;
  }

  // Demais recursos same-origin: tenta a rede e guarda uma cópia.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Nexora';
  const body = payload.body || 'Voce tem uma nova notificacao.';
  const targetPath = payload.url || '/dashboard';
  const tag = payload.tag || 'nexora-push';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-32.png',
      tag,
      data: {
        url: targetPath,
      },
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification?.data?.url || '/dashboard';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
