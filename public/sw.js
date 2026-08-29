/**
 * Service worker — the part that reaches Chrissy when the site is closed.
 *
 * Pushes are sent with NO payload on purpose, so no client's name, number or
 * appointment ever passes through Google's or Apple's push infrastructure.
 * When a push wakes this worker it comes back to the server, authenticated
 * with her own session cookie, and fetches the detail itself.
 */

const FALLBACK = {
  title: 'New booking',
  body: 'Open your dashboard to see it.',
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let detail = FALLBACK;
      try {
        const res = await fetch('/api/admin/notifications/latest', {
          credentials: 'include',
          cache: 'no-store',
        });
        // A 401 means her sign-in lapsed. Still notify — just without detail,
        // which is a reason to open the dashboard, not a reason to stay silent.
        if (res.ok) {
          const data = await res.json();
          if (data?.title) detail = { title: data.title, body: data.body || '' };
        }
      } catch {
        /* offline or blocked — the fallback still gets shown */
      }

      await self.registration.showNotification(detail.title, {
        body: detail.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'hbc-booking',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 80, 200],
        data: { url: '/admin' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/admin';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an already-open dashboard rather than stacking up tabs.
      for (const client of all) {
        if (client.url.includes('/admin') && 'focus' in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

// Chrome can drop a subscription and hand back a new one; re-register silently
// so she doesn't quietly stop receiving notifications.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/admin/notifications', { credentials: 'include' });
        if (!res.ok) return;
        const { vapidPublicKey } = await res.json();
        const key = Uint8Array.from(atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await fetch('/api/admin/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: fresh.toJSON(), label: 'Re-registered device' }),
        });
      } catch {
        /* nothing useful to do here — she can re-enable from the dashboard */
      }
    })(),
  );
});
