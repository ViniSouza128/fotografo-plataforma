// Kill-switch: desregistra qualquer service worker antigo desta origem.
// Era usado para PWA em uma versão anterior; a interceptação ficou stale e
// segurava chunks de webpack obsoletos. Esse arquivo limpa tudo na próxima visita.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // Apaga todos os caches abertos por SWs anteriores
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    } catch {}
    try {
      await self.registration.unregister()
    } catch {}
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true })
      for (const c of clients) {
        try { c.navigate(c.url) } catch {}
      }
    } catch {}
  })())
})
self.addEventListener('fetch', (event) => {
  // Não intercepta nada — apenas passa através até desregistrar.
  return
})
