/* Whengacha service worker: funciona sin conexión y avisa de eventos que terminan. */
const SHELL = 'whengacha-shell-v1'
const IMGS = 'whengacha-img-v1'
const API = 'whengacha-api-v1'
const KEEP = [SHELL, IMGS, API, 'whengacha-prefs']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Datos: red primero, caché si no hay conexión.
  if (url.hostname === 'api.ennead.cc') {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(API).then(c => c.put(req, copy)); return res })
        .catch(() => caches.match(req)),
    )
    return
  }
  // Imágenes: caché primero.
  if (req.destination === 'image') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(IMGS).then(c => c.put(req, copy)) }
        return res
      }).catch(() => hit)),
    )
    return
  }
  // App: caché con actualización en segundo plano.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); return res }).catch(() => hit || caches.match('./'))
        return hit || net
      }),
    )
  }
})

async function checkAlerts() {
  const cache = await caches.open('whengacha-prefs')
  const res = await cache.match('alerts.json')
  if (!res) return
  const { enabled, alerts, seen } = await res.json()
  if (!enabled) return
  const now = Date.now()
  const due = alerts.filter(a => a.at <= now && a.end > now && !seen[a.key]).slice(0, 5)
  for (const a of due) {
    await self.registration.showNotification(a.title, { body: a.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: a.key })
    seen[a.key] = now
  }
  if (due.length) await cache.put('alerts.json', new Response(JSON.stringify({ enabled, alerts, seen }), { headers: { 'content-type': 'application/json' } }))
}

self.addEventListener('periodicsync', e => { if (e.tag === 'whengacha-alerts') e.waitUntil(checkAlerts()) })

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))))
})
