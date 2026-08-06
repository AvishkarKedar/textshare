/**
 * Offline shell for textshare.
 *
 * The app shell is cached on install. Module dependencies from esm.sh are
 * cached the first time they load, so a second visit works with no network
 * at all - Yjs merges whatever you typed offline when you reconnect.
 */
const VERSION = 'textshare-v3'
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
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

  // Never cache sync traffic or room lookups.
  if (url.pathname.startsWith('/room/') || url.protocol === 'wss:') return

  const isModule = url.hostname === 'esm.sh'
  const isShell = url.origin === location.origin
  if (!isModule && !isShell) return

  if (isModule) {
    // Immutable versioned modules: cache first.
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone()
        caches.open(VERSION).then(c => c.put(req, copy))
        return res
      }))
    )
    return
  }

  // App shell: network first so deploys land immediately, cache as fallback.
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone()
        caches.open(VERSION).then(c => c.put(req, copy))
        return res
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  )
})
