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
  // Push must be handled by the worker even when no Shahm page is open.
  let data: Record<string, unknown> = {};
  if (event.data) {
    try {
      data = event.data.json() as Record<string, unknown>;
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = typeof data.title === 'string' && data.title.trim() ? data.title : 'شَهْم';
  const body = typeof data.body === 'string' && data.body.trim()
    ? data.body
    : 'إشعار جديد من منصة شَهْم';
  const candidateUrl = typeof data.url === 'string' ? data.url : '/';
  let url = '/';
  try {
    const parsedUrl = new URL(candidateUrl, self.location.origin);
    if (parsedUrl.origin === self.location.origin) url = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  } catch {
    // Keep the safe app-root fallback for malformed payload URLs.
  }

  const notificationOptions = {
    body,
    dir: 'rtl',
    lang: 'ar',
    icon: '/shahm-app-icon-192-20260924.png',
    badge: '/shahm-app-icon-192-20260924.png',
    vibrate: [200, 100, 200],
    tag: typeof data.tag === 'string' && data.tag ? data.tag : 'shahm-trip',
    renotify: true,
    data: {
      url,
      type: typeof data.type === 'string' ? data.type : undefined,
      trip_id: typeof data.trip_id === 'string' ? data.trip_id : undefined,
      assistance_id: typeof data.assistance_id === 'string' ? data.assistance_id : undefined,
    },
  } as NotificationOptions & { vibrate: number[] };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const candidateUrl = typeof event.notification.data?.url === 'string'
      ? event.notification.data.url
      : '/';
    let targetUrl = new URL('/', self.location.origin);
    try {
      const parsedUrl = new URL(candidateUrl, self.location.origin);
      if (parsedUrl.origin === self.location.origin) targetUrl = parsedUrl;
    } catch {
      // Keep the safe app-root fallback.
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingWindow = (windows as WindowClient[]).find((client) =>
      new URL(client.url).origin === self.location.origin
    );
    if (existingWindow) {
      // A suspended Android/PWA window can leave navigate() pending. Focus it
      // first and bound both operations so the notification click still opens
      // a fresh app window when the old one is no longer responsive.
      const settleWithin = async <T,>(promise: Promise<T>, timeoutMs = 1200): Promise<T | null> => {
        let timeoutId: number | undefined;
        try {
          return await Promise.race([
            promise,
            new Promise<null>((resolve) => {
              timeoutId = self.setTimeout(() => resolve(null), timeoutMs);
            }),
          ]);
        } catch {
          return null;
        } finally {
          if (timeoutId !== undefined) self.clearTimeout(timeoutId);
        }
      };

      const focusedWindow = await settleWithin(existingWindow.focus());
      if (focusedWindow) {
        const currentUrl = new URL(existingWindow.url);
        if (currentUrl.href === targetUrl.href) return;
        const navigatedWindow = await settleWithin(existingWindow.navigate(targetUrl.href));
        if (navigatedWindow) {
          await settleWithin(navigatedWindow.focus());
          return;
        }
      }
    }
    // No usable window (or an old one failed to wake): launch the app route.
    await self.clients.openWindow(targetUrl.href);
  })());
});
