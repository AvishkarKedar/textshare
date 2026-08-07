/**
 * anonshare service worker.
 *
 * Caches the shell so the editor opens offline, and stays out of the way of
 * anything live: websockets, room lookups, and the relay are never touched.
 */

const VERSION = 'anonshare-v8'
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './demo.js',
  './zip.js',
  './security.html',
  './privacy.html',
  './terms.html',
  './manifest.webmanifest',
]

self.addEventListener('install', e => {
  self.skipWaiting()
  // allSettled, not all: one 404 must not throw away the whole cache.
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))))
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
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return
  if (url.pathname.startsWith('/room/')) return       // relay traffic, never cached
  if (url.hostname === 'api.github.com') return



  if (url.origin !== location.origin) return

  // Our own files: network first, so a deploy is picked up immediately.
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone()
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  )
})
