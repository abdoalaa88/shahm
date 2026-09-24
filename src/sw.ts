/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'shahm-pages',
    networkTimeoutSeconds: 3,
    plugins: [{
      handlerDidError: async () => caches.match('/offline.html'),
    }],
  })
);

registerRoute(
  ({ request }) => request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({ cacheName: 'shahm-assets' })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'shahm-images' })
);

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json() as { title?: string; body?: string; url?: string; tag?: string };
  const notificationOptions = {
    body: data.body || 'إشعار جديد من منصة شَهْم',
    dir: 'rtl',
    lang: 'ar',
    icon: '/shahm-app-icon-192-20260924.png',
    badge: '/shahm-app-icon-192-20260924.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'shahm-trip',
    renotify: true,
    data: { url: data.url || '/' },
  } as NotificationOptions & { vibrate: number[] };
  event.waitUntil(self.registration.showNotification(data.title || 'شَهْم', notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'));
});
