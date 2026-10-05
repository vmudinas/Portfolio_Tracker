// Portfolio Tracker service worker: makes the app installable and lets it open offline.
// - Pages: network first, falling back to the cached app shell when offline.
// - Built assets (hashed file names): cache first.
// - Market data APIs are never cached here (the app keeps its own last-price cache).
const CACHE = 'portfolio-tracker-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // 'no-cache' revalidates with the server, so a new deploy shows up on the next reload instead of
    // after GitHub Pages' 10-minute HTTP cache on index.html expires.
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  if (url.pathname.includes('/assets/') || SHELL.some((p) => url.pathname.endsWith(p.slice(1)))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
