/// <reference lib="webworker" />
/**
 * Service worker: оболочка приложения и фото работают без сети,
 * данные студии берутся из сети, а при её отсутствии — из кэша.
 * Здесь же — показ push-напоминаний за сутки до записи.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Любая страница приложения открывается без сети
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Фото студии и работ
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 24 * 3600 })],
  }),
);

// Манифест и иконки студии
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'), new StaleWhileRevalidate({ cacheName: 'app-api' }));

// Настройки студии и занятость: сначала сеть, без сети — последняя сохранённая версия
registerRoute(
  ({ url, request }) => request.method === 'GET' && /\/rest\/v1\/(studios|rpc\/get_busy)/.test(url.pathname),
  new NetworkFirst({ cacheName: 'studio-data', networkTimeoutSeconds: 5, plugins: [new CacheableResponsePlugin({ statuses: [200] })] }),
);

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Напоминание о записи', {
      body: data.body ?? 'Завтра у вас запись в автостудию.',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          await w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
