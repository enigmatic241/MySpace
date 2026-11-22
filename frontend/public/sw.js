/* WorkHub service worker — enables PWA install + offline app shell.
 *
 * Strategy:
 *  - Precache the app shell (index.html, JS/CSS/assets) at install.
 *  - For navigations: network-first, fall back to cached index.html (offline shell).
 *  - For other same-origin GET assets: stale-while-revalidate.
 *  - Never cache /api/* (data must always be fresh) — but DO NOT block them
 *    (no fetch interception that returns errors when offline; let them fail
 *    naturally and the app shows its own error).
 */
const CACHE = 'workhub-shell-v1'
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Never intercept API calls or cross-origin requests — let them pass through.
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return
  }

  // HTML navigations: network-first, fall back to cached shell for offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // Other same-origin GETs (JS, CSS, images, icons): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetched
    }),
  )
})
