// Kanha service worker: makes the site installable, shows an offline page when the
// network is gone, and receives the daily-verse push notification.
// Deliberately does NOT cache API responses or conversations.
const OFFLINE = '/offline.html'
const CACHE = 'kanha-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

// Page navigations: network first, offline page if there's no connection.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not JSON */ }
  const title = data.title || "Today's verse"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'A page of the Gita is open for you.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'daily-verse',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/verse' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/verse'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ('focus' in w) { w.navigate(url); return w.focus() }
      return self.clients.openWindow(url)
    }),
  )
})
