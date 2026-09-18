/**
 * anonshare service worker.
 * Navigations use the offline app shell; missing assets never receive HTML.
 */
const VERSION = 'anonshare-v21'
const SHELL = ['./','./index.html','./security.html','./privacy.html','./terms.html','./manifest.webmanifest']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(VERSION).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url)))))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/room/')) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) caches.open(VERSION).then(cache => cache.put(request, response.clone())).catch(() => {})
      return response
    })))
    return
  }

  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(VERSION).then(cache => cache.put(request, response.clone())).catch(() => {})
    return response
  }).catch(async () => {
    const cached = await caches.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') return (await caches.match('./index.html')) || Response.error()
    return Response.error()
  }))
})
