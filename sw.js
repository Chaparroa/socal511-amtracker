const TRACKER_URL = 'https://socal511-amtracker.vercel.app/train/770?station=CWT';

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Amtracker', body: event.data.text() }; }

  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'Amtracker Alert', {
      body: body || 'Train status update',
      data: { url: url || TRACKER_URL },
      requireInteraction: true,
      tag: 'amtracker-delay',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || TRACKER_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const existing = wins.find(w => w.url.startsWith('https://socal511-amtracker'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
