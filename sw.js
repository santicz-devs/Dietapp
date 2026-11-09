// Service worker de DietApp: permite abrir la app sin conexión.
const CACHE = "dietapp-v1";
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const fonts = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (u.origin !== location.origin && !fonts) return; // el Worker de la IA nunca se guarda
  const store = res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; };
  e.respondWith(fonts
    ? caches.match(r).then(hit => hit || fetch(r).then(store))
    // primero la red (siempre ves la última versión); sin internet, lo guardado
    : fetch(r).then(store).catch(() => caches.match(r).then(hit => hit || caches.match("index.html"))));
});
