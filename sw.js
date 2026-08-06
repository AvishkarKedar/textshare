/**
 * Offline shell.
 *
 * Two rules that matter: never touch /room/ or websocket traffic, and never
 * serve a stale app.js against a relay that has moved on. The shell is
 * network-first so a deploy reaches people on their next load, and esm.sh is
 * cache-first because those URLs are version-pinned and immutable.
 */

const VERSION = 'anonshare-v6'
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './demo.js',
  './zip.js',
  './security.html',
  './manifest.webmanifest',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll is all-or-nothing; one 404 would leave us with no cache at all.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return
  if (url.pathname.startsWith('/room/')) return
  if (url.hostname === 'api.github.com') return

  // Pinned module URLs never change contents. Cache them hard.
  if (url.hostname === 'esm.sh') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(VERSION).then(c => c.put(req, copy))
        }
        return res
      }))
    )
    return
  }

  if (url.origin !== location.origin) return

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(VERSION).then(c => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  )
})
